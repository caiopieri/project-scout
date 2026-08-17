import { describe, expect, it, vi } from 'vitest';
import { ConnectorError } from '@scout/domain';
import {
  EbayApiAdapter,
  InMemoryEbayTokenCache,
  KvEbayRateLimiter,
  type EbayFetch,
} from '@scout/ebay-connector';
import type { ResearchCriteria } from '@scout/schemas';
import { EbayRateLimitDurableObject } from '../apps/worker/src/EbayRateLimitDurableObject';

const criteria: ResearchCriteria = {
  category: 'smartphone',
  brands: ['Apple'],
  models: ['iPhone 13'],
  variants: [],
  storageGb: [128],
  memoryGb: [],
  maximumPrice: { amountMinor: 180000, currency: 'USD' },
  acceptedDefects: ['cracked_screen'],
  rejectedDefects: [],
  acceptedConditions: ['for_repair'],
  countries: [],
  regions: [],
  requiredFunctionalStates: [],
  preferredEvidence: [],
  additionalKeywords: [],
  excludedKeywords: [],
};

class MemoryStore {
  readonly values = new Map<string, string>();
  readonly puts: Array<{ key: string; value: string; expirationTtl?: number }> = [];
  failGet = false;
  failPut = false;

  async get(key: string) {
    if (this.failGet) throw new Error('KV unavailable');
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }) {
    if (this.failPut) throw new Error('KV unavailable');
    this.values.set(key, value);
    this.puts.push({ key, value, expirationTtl: options?.expirationTtl });
  }
}

class DurableObjectStateFake {
  readonly values = new Map<string, unknown>();
  private pending = Promise.resolve();
  readonly storage = {
    get: async <T>(key: string) => this.values.get(key) as T | undefined,
    put: async <T>(key: string, value: T) => {
      this.values.set(key, value);
    },
  };

  blockConcurrencyWhile<T>(callback: () => Promise<T>) {
    const result = this.pending.then(callback);
    this.pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

describe('eBay global rate limiter', () => {
  it('reserves a bounded number of requests per window and resets in the next bucket', async () => {
    let now = 1_700_000_000_000;
    const store = new MemoryStore();
    const limiter = new KvEbayRateLimiter(store, {
      maxRequests: 2,
      windowSeconds: 60,
      keyPrefix: 'test:ebay',
      now: () => now,
    });

    await limiter.acquire({ operation: 'search' });
    await limiter.acquire({ operation: 'details' });
    await expect(limiter.acquire({ operation: 'search' })).rejects.toMatchObject({
      kind: 'transient',
      code: 'EBAY_GLOBAL_RATE_LIMITED',
    });
    expect(store.puts).toHaveLength(2);
    expect(store.puts[0].expirationTtl).toBe(65);

    now += 60_000;
    await expect(limiter.acquire({ operation: 'search' })).resolves.toBeUndefined();
  });

  it('serializes concurrent reservations within one Worker isolate', async () => {
    const store = new MemoryStore();
    const limiter = new KvEbayRateLimiter(store, {
      maxRequests: 2,
      windowSeconds: 60,
      now: () => 1_700_000_000_000,
    });
    const results = await Promise.allSettled([
      limiter.acquire({ operation: 'search' }),
      limiter.acquire({ operation: 'details' }),
      limiter.acquire({ operation: 'search' }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(results[2]).toMatchObject({
      status: 'rejected',
      reason: { code: 'EBAY_GLOBAL_RATE_LIMITED' },
    });
  });

  it('fails closed when KV state is unavailable or invalid', async () => {
    const unavailable = new MemoryStore();
    unavailable.failGet = true;
    const unavailableLimiter = new KvEbayRateLimiter(unavailable, {
      maxRequests: 1,
      windowSeconds: 60,
    });
    await expect(unavailableLimiter.acquire({ operation: 'search' })).rejects.toMatchObject({
      kind: 'transient',
      code: 'EBAY_RATE_LIMIT_STATE_UNAVAILABLE',
    });

    const invalid = new MemoryStore();
    invalid.values.set('test:ebay:28333333', '{invalid');
    const invalidLimiter = new KvEbayRateLimiter(invalid, {
      maxRequests: 1,
      windowSeconds: 60,
      keyPrefix: 'test:ebay',
      now: () => 28333333 * 60_000,
    });
    await expect(invalidLimiter.acquire({ operation: 'search' })).rejects.toMatchObject({
      kind: 'permanent',
      code: 'EBAY_RATE_LIMIT_STATE_INVALID',
    });
  });

  it('does not silently accept invalid policy or write failures', async () => {
    expect(
      () => new KvEbayRateLimiter(new MemoryStore(), { maxRequests: 0, windowSeconds: 60 }),
    ).toThrow(ConnectorError);

    const store = new MemoryStore();
    store.failPut = true;
    const limiter = new KvEbayRateLimiter(store, { maxRequests: 1, windowSeconds: 60 });
    await expect(limiter.acquire({ operation: 'details' })).rejects.toMatchObject({
      kind: 'transient',
      code: 'EBAY_RATE_LIMIT_STATE_UNAVAILABLE',
    });
  });

  it('stops before Browse and preserves the stable limiter error', async () => {
    const acquire = vi.fn(async () => {
      throw new ConnectorError(
        'Do not expose this message',
        'transient',
        'EBAY_GLOBAL_RATE_LIMITED',
      );
    });
    const fetcher = vi.fn<EbayFetch>(async (input) =>
      String(input).includes('/oauth2/token')
        ? Response.json({
            access_token: 'token',
            expires_in: 7200,
            token_type: 'Application Access Token',
          })
        : Response.json({ itemSummaries: [] }),
    );
    const adapter = new EbayApiAdapter(
      {
        environment: 'sandbox',
        clientId: 'client',
        clientSecret: 'secret',
        maxAttempts: 1,
      },
      {
        fetch: fetcher,
        tokenCache: new InMemoryEbayTokenCache(),
        rateLimiter: { acquire },
      },
    );
    await expect(adapter.search({ criteria, limit: 1 })).rejects.toMatchObject({
      kind: 'transient',
      code: 'EBAY_GLOBAL_RATE_LIMITED',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('/oauth2/token');
  });

  it('serializes reservations across Worker isolates through the Durable Object state', async () => {
    const state = new DurableObjectStateFake();
    const object = new EbayRateLimitDurableObject(state as never);
    const request = () =>
      object.fetch(
        new Request('https://scout.internal/ebay-rate-limit', {
          method: 'POST',
          body: JSON.stringify({ operation: 'search', maxRequests: 2, windowSeconds: 60 }),
        }),
      );

    const responses = await Promise.all([request(), request(), request()]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 200, 429]);
  });
});
