/**
 * Self-heal level 1 building blocks: classify a failure from its codes and describe how a page's
 * structure changed. Everything here is deterministic, and the structural evidence carries only
 * markup tokens (class names, data-attribute names, value shapes) — never collected text, so a
 * hostile listing cannot reach the maintenance agent through it.
 */

export type FailureClass = 'source_block' | 'network' | 'auth' | 'parser' | 'semantic' | 'unknown';

const BLOCK_CODES = new Set([
  'SOURCE_BLOCKED',
  'CAPTCHA',
  'RATE_LIMITED',
  'ROBOTS_DISALLOWED',
  'LOGIN_REQUIRED',
]);
const NETWORK_CODES = new Set(['SOURCE_UNAVAILABLE', 'SOURCE_HTTP_ERROR', 'ROBOTS_UNAVAILABLE']);
const PARSER_CODES = new Set(['CONTENT_CHANGED', 'CANARY_BELOW_EXPECTED']);

/** Which kind of fix a failure needs; only `parser` failures can be repaired by a selector map. */
export const classifyFailure = (codes: Array<string | null | undefined>): FailureClass => {
  const known = codes.filter((code): code is string => Boolean(code));
  if (known.some((code) => BLOCK_CODES.has(code))) return 'source_block';
  if (known.some((code) => /AUTH|OAUTH|UNAUTHORIZED|CONFIGURATION/.test(code))) return 'auth';
  if (known.some((code) => NETWORK_CODES.has(code) || /TIMEOUT|UPSTREAM/.test(code)))
    return 'network';
  if (known.some((code) => code.startsWith('SEMANTIC_'))) return 'semantic';
  if (known.some((code) => PARSER_CODES.has(code) || /INVALID_|MAPPING/.test(code)))
    return 'parser';
  return 'unknown';
};

const SAFE_TOKEN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const OPENING_TAG = /<([a-z][a-z0-9]*)\b([^>]*)>/gi;

/** Counts of `class:<token>` and `attr:<data-name>` across the page. */
export const structuralSignature = (html: string) => {
  const counts = new Map<string, number>();
  const bump = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
  for (const match of html.matchAll(OPENING_TAG)) {
    const attributes = match[2];
    for (const name of /\sclass="([^"]*)"/.exec(attributes)?.[1].split(/\s+/) ?? [])
      if (SAFE_TOKEN.test(name)) bump(`class:${name}`);
    for (const attribute of attributes.matchAll(/\s(data-[a-z0-9-]{1,60})=/g))
      bump(`attr:${attribute[1]}`);
  }
  return counts;
};

export interface StructuralDiff {
  disappeared: Array<{ token: string; count: number }>;
  appeared: Array<{ token: string; count: number }>;
}

/** Tokens that vanished or showed up between the last good page and the broken one. */
export const diffStructure = (before: string, after: string, limit = 40): StructuralDiff => {
  const old = structuralSignature(before);
  const next = structuralSignature(after);
  const only = (from: Map<string, number>, other: Map<string, number>) =>
    [...from.entries()]
      .filter(([token]) => !other.has(token))
      .map(([token, count]) => ({ token, count }))
      .sort((left, right) => right.count - left.count || left.token.localeCompare(right.token))
      .slice(0, limit);
  return { disappeared: only(old, next), appeared: only(next, old) };
};

/** Describes an attribute value by shape so the agent sees structure, not content. */
const shapeOf = (value: string) => {
  if (/^\d+(\.\d{1,2})?$/.test(value)) return `<number ${value}>`;
  if (/^[A-Z0-9]{4,20}$/.test(value)) return `<code ${value.length} chars>`;
  return `<text ${value.length} chars>`;
};

/**
 * A sanitized outline of the markup around the first tag carrying `class:<token>`: tag names,
 * safe class tokens and data attributes with value shapes. Text nodes are dropped.
 */
export const markupSkeleton = (html: string, anchorClass: string, maxTags = 25) => {
  const tags = [...html.matchAll(OPENING_TAG)];
  const start = tags.findIndex((match) =>
    (/\sclass="([^"]*)"/.exec(match[2])?.[1].split(/\s+/) ?? []).includes(anchorClass),
  );
  if (start < 0) return [];
  return tags.slice(start, start + maxTags).map((match) => {
    const classes = (/\sclass="([^"]*)"/.exec(match[2])?.[1].split(/\s+/) ?? []).filter((name) =>
      SAFE_TOKEN.test(name),
    );
    const data = [...match[2].matchAll(/\s(data-[a-z0-9-]{1,60})="([^"]*)"/g)].map(
      ([, name, value]) => `${name}=${shapeOf(value)}`,
    );
    return [
      `<${match[1].toLowerCase()}`,
      classes.length ? `class="${classes.join(' ')}"` : '',
      ...data,
    ]
      .filter(Boolean)
      .join(' ')
      .concat('>');
  });
};
