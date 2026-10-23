import { chromium, type BrowserContext } from 'playwright';
import { parseRobotsTxt, robotsDecision, SCOUT_USER_AGENT } from '@scout/collection';
import {
  ConnectorError,
  type FetchPageInput,
  type RawPage,
  type ScrapingProvider,
} from '@scout/domain';

/**
 * Layer 5: a real browser on the user's machine with the user's own persistent profile, so a
 * source that needs login is read with the session the user created by hand. It obeys robots.txt,
 * keeps a slow per-host pace, and stops on a login wall or CAPTCHA instead of working around it.
 * Cookies never leave this process: callers receive page HTML only.
 */
export class BrowserScrapingProvider implements ScrapingProvider {
  private context: BrowserContext | null = null;
  private readonly lastRequestAt = new Map<string, number>();
  private readonly robots = new Map<string, ReturnType<typeof parseRobotsTxt>>();

  constructor(
    private readonly profileDir: string,
    private readonly minIntervalMs = 8_000,
    private readonly headless = true,
  ) {}

  private async browser() {
    this.context ??= await chromium.launchPersistentContext(this.profileDir, {
      headless: this.headless,
      userAgent: `${SCOUT_USER_AGENT} local-agent`,
    });
    return this.context;
  }

  async close() {
    await this.context?.close();
    this.context = null;
  }

  async fetchPage(input: FetchPageInput): Promise<RawPage> {
    const url = new URL(input.url);
    if (!this.robots.has(url.origin)) {
      const response = await fetch(`${url.origin}/robots.txt`).catch(() => null);
      this.robots.set(url.origin, response?.ok ? parseRobotsTxt(await response.text()) : []);
    }
    if (!robotsDecision(this.robots.get(url.origin)!, SCOUT_USER_AGENT, url.pathname).allowed)
      throw new ConnectorError('robots.txt disallows this path.', 'permanent', 'ROBOTS_DISALLOWED');
    const wait = (this.lastRequestAt.get(url.host) ?? -Infinity) + this.minIntervalMs - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    this.lastRequestAt.set(url.host, Date.now());

    const page = await (await this.browser()).newPage();
    try {
      const response = await page.goto(url.toString(), {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      const finalUrl = new URL(page.url());
      const html = await page.content();
      if (
        /\/(login|signin|entrar)\b/i.test(finalUrl.pathname) ||
        (await page.locator('input[type="password"]').count())
      )
        throw new ConnectorError(
          'The source asks for login: sign in by hand in this profile first.',
          'permanent',
          'LOGIN_REQUIRED',
        );
      if (/captcha|challenge-platform/i.test(html.slice(0, 20_000)))
        throw new ConnectorError(
          'The source shows a CAPTCHA; the agent stops here.',
          'permanent',
          'CAPTCHA',
        );
      const status = response?.status() ?? 0;
      if (status === 403 || status === 429)
        throw new ConnectorError(
          'The source blocked the browser.',
          'permanent',
          status === 429 ? 'RATE_LIMITED' : 'SOURCE_BLOCKED',
        );
      return { content: html, statusCode: status, url: finalUrl.toString(), fetchedAt: new Date() };
    } finally {
      await page.close();
    }
  }
}
