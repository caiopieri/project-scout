import {
  ConnectorError,
  type FetchPageInput,
  type RawPage,
  type ScrapingProvider,
} from '@scout/domain';

export const SCOUT_USER_AGENT = 'ScoutBot/0.1 (+https://github.com/caiopieri/project-scout)';

interface RobotsGroup {
  agents: string[];
  rules: Array<{ allow: boolean; path: string }>;
  crawlDelaySeconds?: number;
}

/** Minimal RFC 9309 parser: groups by user-agent, longest matching rule wins, Allow wins ties. */
export const parseRobotsTxt = (text: string): RobotsGroup[] => {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const match = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1].toLowerCase();
    const value = match[2].trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === 'allow' || key === 'disallow') {
      if (value || key === 'allow') current.rules.push({ allow: key === 'allow', path: value });
    } else if (key === 'crawl-delay' && Number.isFinite(Number(value))) {
      current.crawlDelaySeconds = Number(value);
    }
  }
  return groups;
};

const ruleMatches = (rulePath: string, path: string) => {
  if (!rulePath) return false;
  const pattern = rulePath
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\\\$$/, '$');
  return new RegExp(`^${pattern}`).test(path);
};

export const robotsDecision = (groups: RobotsGroup[], userAgent: string, path: string) => {
  const token = userAgent.split('/')[0].toLowerCase();
  const group =
    groups.find((candidate) =>
      candidate.agents.some((agent) => agent !== '*' && token.includes(agent)),
    ) ?? groups.find((candidate) => candidate.agents.includes('*'));
  if (!group) return { allowed: true, crawlDelaySeconds: undefined };
  let best: { allow: boolean; length: number } | null = null;
  for (const rule of group.rules) {
    if (!ruleMatches(rule.path, path)) continue;
    const length = rule.path.length;
    if (!best || length > best.length || (length === best.length && rule.allow))
      best = { allow: rule.allow, length };
  }
  return { allowed: best ? best.allow : true, crawlDelaySeconds: group.crawlDelaySeconds };
};

const BLOCK_MARKERS = [
  /captcha/i,
  /cf-chl-|challenge-platform|Just a moment\.\.\./i,
  /access denied|request blocked|unusual traffic/i,
];

export interface HttpScrapingProviderOptions {
  userAgent?: string;
  minIntervalMs?: number;
  timeoutMs?: number;
  maxBytes?: number;
  fetcher?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Layer 4: direct HTTP/HTML. Identifies itself, obeys robots.txt (and its crawl-delay), keeps its
 * own per-host pace, and treats a block (403/429, CAPTCHA or challenge page) as a terminal
 * health signal. It never retries around a block, rotates identity or solves a challenge.
 */
export class HttpScrapingProvider implements ScrapingProvider {
  private readonly robots = new Map<string, RobotsGroup[]>();
  private readonly lastRequestAt = new Map<string, number>();
  private readonly userAgent: string;
  private readonly minIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: HttpScrapingProviderOptions = {}) {
    this.userAgent = options.userAgent ?? SCOUT_USER_AGENT;
    this.minIntervalMs = options.minIntervalMs ?? 5_000;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.maxBytes = options.maxBytes ?? 3 * 1024 * 1024;
    this.fetcher = options.fetcher ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  private async robotsFor(origin: string) {
    const cached = this.robots.get(origin);
    if (cached) return cached;
    let groups: RobotsGroup[] = [];
    try {
      const response = await this.fetcher(`${origin}/robots.txt`, {
        headers: { 'User-Agent': this.userAgent },
      });
      if (response.status === 401 || response.status === 403)
        groups = [{ agents: ['*'], rules: [{ allow: false, path: '/' }] }];
      else if (response.ok) groups = parseRobotsTxt(await response.text());
    } catch {
      throw new ConnectorError('robots.txt could not be read.', 'transient', 'ROBOTS_UNAVAILABLE');
    }
    this.robots.set(origin, groups);
    return groups;
  }

  async fetchPage(input: FetchPageInput): Promise<RawPage> {
    if (input.jsRendering)
      throw new ConnectorError(
        'Layer 4 does not render JavaScript.',
        'permanent',
        'LAYER_UNSUPPORTED',
      );
    const url = new URL(input.url);
    const decision = robotsDecision(
      await this.robotsFor(url.origin),
      this.userAgent,
      `${url.pathname}${url.search}`,
    );
    if (!decision.allowed)
      throw new ConnectorError('robots.txt disallows this path.', 'permanent', 'ROBOTS_DISALLOWED');
    const interval = Math.max(this.minIntervalMs, (decision.crawlDelaySeconds ?? 0) * 1000);
    const wait = (this.lastRequestAt.get(url.host) ?? -Infinity) + interval - this.now();
    if (wait > 0) await this.sleep(wait);
    this.lastRequestAt.set(url.host, this.now());

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetcher(url.toString(), {
        headers: { 'User-Agent': this.userAgent, Accept: 'text/html,application/xhtml+xml' },
        signal: controller.signal,
      });
    } catch {
      throw new ConnectorError(
        'Source unreachable or timed out.',
        'transient',
        'SOURCE_UNAVAILABLE',
      );
    } finally {
      clearTimeout(timer);
    }
    const text = await response.text();
    if (text.length > this.maxBytes)
      throw new ConnectorError('Page exceeds the size limit.', 'permanent', 'PAGE_TOO_LARGE');
    const head = text.slice(0, 20_000);
    if (response.status === 429)
      throw new ConnectorError('Source rate limited this collector.', 'permanent', 'RATE_LIMITED');
    if (response.status === 401 || response.status === 403)
      throw new ConnectorError('Source blocked this collector.', 'permanent', 'SOURCE_BLOCKED');
    // A short page that is mostly a CAPTCHA or challenge is a block, whatever its status code.
    if (text.length < 50_000 && BLOCK_MARKERS[0].test(head))
      throw new ConnectorError('Source answered with a CAPTCHA.', 'permanent', 'CAPTCHA');
    if (!response.ok && BLOCK_MARKERS.some((marker) => marker.test(head)))
      throw new ConnectorError('Source blocked this collector.', 'permanent', 'SOURCE_BLOCKED');
    if (!response.ok)
      throw new ConnectorError(
        `Source answered ${response.status}.`,
        response.status >= 500 ? 'transient' : 'permanent',
        'SOURCE_HTTP_ERROR',
      );
    return {
      content: text,
      statusCode: response.status,
      url: response.url || url.toString(),
      fetchedAt: new Date(this.now()),
    };
  }
}
