import { ConnectorError } from '@scout/domain';

export interface EbayRateLimitStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface EbayRateLimiter {
  acquire(input: { operation: 'search' | 'details' }): Promise<void>;
}

export interface KvEbayRateLimiterConfig {
  maxRequests: number;
  windowSeconds: number;
  keyPrefix?: string;
  now?: () => number;
}

interface WindowState {
  bucket: number;
  count: number;
}

const parseWindowState = (raw: string): WindowState | null => {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    return typeof record.bucket === 'number' &&
      Number.isSafeInteger(record.bucket) &&
      typeof record.count === 'number' &&
      Number.isSafeInteger(record.count) &&
      record.count >= 0
      ? { bucket: record.bucket, count: record.count }
      : null;
  } catch {
    return null;
  }
};

export class KvEbayRateLimiter implements EbayRateLimiter {
  private readonly now: () => number;
  private readonly keyPrefix: string;
  private pending: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: EbayRateLimitStore,
    private readonly config: KvEbayRateLimiterConfig,
  ) {
    if (!Number.isSafeInteger(config.maxRequests) || config.maxRequests < 1)
      throw new ConnectorError(
        'eBay rate limit must allow at least one request per window.',
        'permanent',
        'EBAY_RATE_LIMIT_CONFIGURATION_INVALID',
      );
    if (!Number.isSafeInteger(config.windowSeconds) || config.windowSeconds < 1)
      throw new ConnectorError(
        'eBay rate limit window must be a positive integer.',
        'permanent',
        'EBAY_RATE_LIMIT_CONFIGURATION_INVALID',
      );
    this.now = config.now ?? Date.now;
    this.keyPrefix = config.keyPrefix ?? 'scout:ebay:rate:v1';
  }

  acquire(input: { operation: 'search' | 'details' }): Promise<void> {
    const next = this.pending.then(() => this.reserve(input));
    this.pending = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async reserve(_input: { operation: 'search' | 'details' }): Promise<void> {
    const bucket = Math.floor(this.now() / 1000 / this.config.windowSeconds);
    const key = `${this.keyPrefix}:${bucket}`;
    let raw: string | null;
    try {
      raw = await this.store.get(key);
    } catch {
      throw new ConnectorError(
        'eBay rate limit state is unavailable.',
        'transient',
        'EBAY_RATE_LIMIT_STATE_UNAVAILABLE',
      );
    }
    const previous = raw === null ? null : parseWindowState(raw);
    if (raw !== null && !previous)
      throw new ConnectorError(
        'eBay rate limit state is invalid.',
        'permanent',
        'EBAY_RATE_LIMIT_STATE_INVALID',
      );
    const count = previous?.bucket === bucket ? previous.count : 0;
    if (count >= this.config.maxRequests)
      throw new ConnectorError(
        'eBay global request limit reached.',
        'transient',
        'EBAY_GLOBAL_RATE_LIMITED',
      );
    try {
      await this.store.put(
        key,
        JSON.stringify({ bucket, count: count + 1 } satisfies WindowState),
        { expirationTtl: this.config.windowSeconds + 5 },
      );
    } catch {
      throw new ConnectorError(
        'eBay rate limit state could not be reserved.',
        'transient',
        'EBAY_RATE_LIMIT_STATE_UNAVAILABLE',
      );
    }
  }
}
