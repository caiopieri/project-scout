import { ConnectorError } from '@scout/domain';
import {
  ebayRateLimitAcquireRequestSchema,
  type EbayRateLimitAcquireRequest,
} from '@scout/schemas';
import type { EbayRateLimiter } from '@scout/ebay-connector';

const WINDOW_KEY = 'fixed-window';

interface StoredWindow {
  bucket: number;
  count: number;
}

const response = (body: Record<string, unknown>, status: number) => Response.json(body, { status });

export class EbayRateLimitDurableObject {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405);

    let input: EbayRateLimitAcquireRequest;
    try {
      input = ebayRateLimitAcquireRequestSchema.parse(await request.json());
    } catch {
      return response({ error: 'Invalid rate-limit request.' }, 422);
    }

    try {
      return await this.state.blockConcurrencyWhile(async () => {
        const now = Date.now();
        const bucket = Math.floor(now / (input.windowSeconds * 1000));
        const stored = await this.state.storage.get<StoredWindow>(WINDOW_KEY);
        const current = stored?.bucket === bucket ? stored : { bucket, count: 0 };
        if (current.count >= input.maxRequests)
          return response({ code: 'EBAY_GLOBAL_RATE_LIMITED' }, 429);

        await this.state.storage.put(WINDOW_KEY, { bucket, count: current.count + 1 });
        return response({ ok: true }, 200);
      });
    } catch {
      return response({ code: 'EBAY_RATE_LIMIT_STATE_UNAVAILABLE' }, 503);
    }
  }
}

export class DurableObjectEbayRateLimiter implements EbayRateLimiter {
  constructor(
    private readonly namespace: DurableObjectNamespace,
    private readonly config: Omit<EbayRateLimitAcquireRequest, 'operation'> & {
      key: string;
    },
  ) {}

  async acquire(input: EbayRateLimitAcquireRequest): Promise<void> {
    const id = this.namespace.idFromName(this.config.key);
    const stub = this.namespace.get(id);
    const request = {
      ...this.config,
      operation: input.operation,
    } satisfies EbayRateLimitAcquireRequest & { key: string };
    const result = await stub.fetch('https://scout.internal/ebay-rate-limit', {
      method: 'POST',
      body: JSON.stringify(request),
    });
    if (result.status === 429)
      throw new ConnectorError(
        'eBay global request budget is exhausted.',
        'transient',
        'EBAY_GLOBAL_RATE_LIMITED',
      );
    if (!result.ok)
      throw new ConnectorError(
        'eBay global request budget is unavailable.',
        'transient',
        'EBAY_RATE_LIMIT_STATE_UNAVAILABLE',
      );
  }
}
