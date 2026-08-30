import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ConnectorError } from '@scout/domain';
import {
  buildEbaySearchUrl,
  defaultEbayFetch,
  EbayApiAdapter,
  InMemoryEbayTokenCache,
  parseEbayAmountMinor,
  UnavailableEbayConnector,
  type EbayFetch,
  type EbayRequestTelemetryEvent,
} from '@scout/ebay-connector';
import type { EbayApiAdapterDependencies } from '@scout/ebay-connector';
import type { ResearchCriteria } from '@scout/schemas';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(resolve(process.cwd(), 'tests', 'fixtures', 'ebay', name), 'utf8'));

const searchFixture = fixture('browse-search-page-1.json');
const itemFixture = fixture('browse-item.json');
const criteria: ResearchCriteria = {
  category: 'smartphone',
  brands: ['Apple'],
  models: ['iPhone 13'],
  variants: [],
  storageGb: [128],
  memoryGb: [],
  maximumPrice: { amountMinor: 35000, currency: 'USD' },
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

const tokenResponse = () =>
  Response.json({
    access_token: 'test-application-token',
    expires_in: 7200,
    token_type: 'Application Access Token',
  });

const adapter = (
  fetcher: EbayFetch,
  extra: Partial<ConstructorParameters<typeof EbayApiAdapter>[0]> = {},
  dependencies: EbayApiAdapterDependencies = {},
) =>
  new EbayApiAdapter(
    {
      environment: 'sandbox',
      clientId: 'sandbox-client-id',
      clientSecret: 'sandbox-client-secret',
      marketplaceId: 'EBAY_US',
      ...extra,
    },
    {
      fetch: fetcher,
      sleep: async () => undefined,
      now: () => new Date('2026-07-28T12:00:00.000Z').getTime(),
      tokenCache: new InMemoryEbayTokenCache(),
      ...dependencies,
    },
  );

describe('Milestone 5 eBay official API adapter', () => {
  it('calls the runtime fetch through the global receiver', async () => {
    vi.stubGlobal('fetch', function (this: unknown) {
      expect(this).toBe(globalThis);
      return Promise.resolve(tokenResponse());
    });
    try {
      await defaultEbayFetch('https://api.ebay.test/resource');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('serializes eBay-only fixed-price condition and same-currency price filters', () => {
    const url = buildEbaySearchUrl(
      { criteria, limit: 50, cursor: '100' },
      {
        environment: 'production',
        marketplaceId: 'EBAY_US',
      },
    );
    expect(url.origin).toBe('https://api.ebay.com');
    expect(url.searchParams.get('q')).toBe('Apple iPhone 13 128GB');
    expect(url.searchParams.get('limit')).toBe('50');
    expect(url.searchParams.get('offset')).toBe('100');
    expect(url.searchParams.get('filter')).toBe(
      'buyingOptions:{FIXED_PRICE},conditionIds:{7000},price:[..350.00],priceCurrency:USD',
    );
  });

  it('does not apply a BRL maximum directly to USD listings without an exchange rate', () => {
    const url = buildEbaySearchUrl(
      {
        criteria: { ...criteria, maximumPrice: { amountMinor: 180000, currency: 'BRL' } },
        limit: 20,
      },
      { environment: 'production', marketplaceId: 'EBAY_US' },
    );
    expect(url.searchParams.get('filter')).not.toContain('price:');
    expect(url.searchParams.get('filter')).not.toContain('priceCurrency:');
  });

  it('mints and caches an application token while mapping a search page', async () => {
    const calls: URL[] = [];
    const fetcher = vi.fn<EbayFetch>(async (input, init) => {
      const url = new URL(String(input));
      calls.push(url);
      if (url.pathname.endsWith('/oauth2/token')) {
        expect(new Headers(init?.headers).get('Authorization')).toMatch(/^Basic /);
        expect(init?.body).toContain('grant_type=client_credentials');
        return tokenResponse();
      }
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-application-token');
      expect(new Headers(init?.headers).get('X-EBAY-C-MARKETPLACE-ID')).toBe('EBAY_US');
      return Response.json(searchFixture);
    });
    const connector = adapter(fetcher);
    const first = await connector.search({ criteria, limit: 2 });
    const second = await connector.search({ criteria, limit: 2 });
    expect(first.items[0]).toMatchObject({
      externalId: 'v1|145000000001|0',
      price: { amountMinor: 29999, currency: 'USD' },
      sellerExternalId: 'repair-seller',
    });
    expect(first.nextCursor).toBe('2');
    expect(second.items).toHaveLength(2);
    expect(calls.filter((url) => url.pathname.endsWith('/oauth2/token'))).toHaveLength(1);
  });

  it('returns all valid previews for the collection layer to screen and persist', async () => {
    const fetcher = vi.fn<EbayFetch>(async (input) => {
      if (String(input).includes('/oauth2/token')) return tokenResponse();
      return Response.json({
        itemSummaries: [
          {
            itemId: 'v1|component|0',
            title: 'iPhone 13 LCD screen replacement',
            itemWebUrl: 'https://www.ebay.com/itm/component',
            price: { value: '20.00', currency: 'USD' },
          },
          {
            itemId: 'v1|excluded|0',
            title: 'Apple iPhone 13 activation lock',
            itemWebUrl: 'https://www.ebay.com/itm/excluded',
            price: { value: '120.00', currency: 'USD' },
          },
          {
            itemId: 'v1|device|0',
            title: 'Apple iPhone 13 cracked screen for parts',
            itemWebUrl: 'https://www.ebay.com/itm/device',
            price: { value: '120.00', currency: 'USD' },
          },
        ],
      });
    });
    const result = await adapter(fetcher).search({
      criteria: { ...criteria, excludedKeywords: ['activation lock'] },
      limit: 3,
    });
    expect(result.items.map((item) => item.externalId)).toEqual([
      'v1|component|0',
      'v1|excluded|0',
      'v1|device|0',
    ]);
  });

  it('emits sanitized request telemetry and reports the real local budget', async () => {
    const events: EbayRequestTelemetryEvent[] = [];
    const fetcher = vi.fn<EbayFetch>(async (input) =>
      String(input).includes('/oauth2/token') ? tokenResponse() : Response.json(searchFixture),
    );
    const connector = adapter(
      fetcher,
      { maxAttempts: 1, maxBrowseRequests: 2 },
      { onRequest: (event) => events.push(event) },
    );

    await connector.search({ criteria, limit: 1 });

    expect(events).toEqual([
      {
        operation: 'search',
        attempt: 1,
        requestNumber: 1,
        maxRequests: 2,
        observedAt: new Date('2026-07-28T12:00:00.000Z').getTime(),
        outcome: 'success',
        status: 200,
        total: 3,
        nextPresent: true,
        q: 'Apple iPhone 13 128GB',
      },
    ]);
    expect(events[0]).not.toHaveProperty('url');
    expect(events[0]).not.toHaveProperty('token');
    expect(connector.getRequestBudgetSnapshot()).toEqual({
      requestsUsed: 1,
      maxRequests: 2,
      requestsRemaining: 1,
      exhausted: false,
    });
  });

  it('emits search telemetry with nextPresent false when eBay omits next', async () => {
    const events: EbayRequestTelemetryEvent[] = [];
    const fetcher = vi.fn<EbayFetch>(async (input) =>
      String(input).includes('/oauth2/token')
        ? tokenResponse()
        : Response.json({ total: 0, itemSummaries: [] }),
    );
    const connector = adapter(
      fetcher,
      { maxAttempts: 1, maxBrowseRequests: 2 },
      { onRequest: (event) => events.push(event) },
    );

    await connector.search({ criteria, limit: 1 });

    expect(events).toContainEqual(
      expect.objectContaining({
        operation: 'search',
        outcome: 'success',
        total: 0,
        nextPresent: false,
        q: 'Apple iPhone 13 128GB',
      }),
    );
  });

  it('keeps the existing success event before rejecting an invalid search payload', async () => {
    const events: EbayRequestTelemetryEvent[] = [];
    const fetcher = vi.fn<EbayFetch>(async (input) =>
      String(input).includes('/oauth2/token')
        ? tokenResponse()
        : Response.json({ itemSummaries: 'invalid' }),
    );
    const connector = adapter(fetcher, {}, { onRequest: (event) => events.push(event) });

    await expect(connector.search({ criteria, limit: 1 })).rejects.toMatchObject({
      code: 'EBAY_SEARCH_INVALID_RESPONSE',
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ operation: 'search', outcome: 'success', status: 200 });
    expect(events[0]).not.toHaveProperty('total');
    expect(events[0]).not.toHaveProperty('nextPresent');
    expect(events[0]).not.toHaveProperty('q');
  });

  it('does not add search pagination telemetry fields to details events', async () => {
    const events: EbayRequestTelemetryEvent[] = [];
    const fetcher = vi.fn<EbayFetch>(async (input) =>
      String(input).includes('/oauth2/token') ? tokenResponse() : Response.json(itemFixture),
    );
    const connector = adapter(
      fetcher,
      { maxAttempts: 1, maxBrowseRequests: 2 },
      { onRequest: (event) => events.push(event) },
    );

    await connector.fetchDetails('v1|145000000001|0');

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      operation: 'details',
      outcome: 'success',
      status: 200,
    });
    expect(events[0]).not.toHaveProperty('total');
    expect(events[0]).not.toHaveProperty('nextPresent');
    expect(events[0]).not.toHaveProperty('q');
  });

  it('does not let a telemetry consumer break requests', async () => {
    const fetcher = vi.fn<EbayFetch>(async (input) =>
      String(input).includes('/oauth2/token') ? tokenResponse() : Response.json(searchFixture),
    );
    const connector = adapter(
      fetcher,
      {},
      {
        onRequest: () => {
          throw new Error('telemetry');
        },
      },
    );

    await expect(connector.search({ criteria, limit: 1 })).resolves.toMatchObject({
      items: expect.any(Array),
    });
  });

  it('advances pagination using raw eBay item count when a page is fully filtered', async () => {
    const fetcher = vi.fn<EbayFetch>(async (input) => {
      if (String(input).includes('/oauth2/token')) return tokenResponse();
      return Response.json({
        next: 'https://api.ebay.com/buy/browse/v1/item_summary/search?offset=2',
        itemSummaries: [
          {
            itemId: 'v1|component|0',
            title: 'MacBook palmrest replacement',
            itemWebUrl: 'https://www.ebay.com/itm/component',
            price: { value: '20.00', currency: 'USD' },
          },
          {
            itemId: 'v1|box|0',
            title: 'MacBook empty box only',
            itemWebUrl: 'https://www.ebay.com/itm/box',
            price: { value: '20.00', currency: 'USD' },
          },
        ],
      });
    });
    const result = await adapter(fetcher).search({ criteria, limit: 2 });
    expect(result.items.map((item) => item.externalId)).toEqual(['v1|component|0', 'v1|box|0']);
    expect(result.nextCursor).toBe('2');
  });

  it('validates and maps item details while retaining the validated raw API payload', async () => {
    const fetcher = vi.fn<EbayFetch>(async (input) =>
      String(input).includes('/oauth2/token') ? tokenResponse() : Response.json(itemFixture),
    );
    const result = await adapter(fetcher).fetchDetails('v1|145000000001|0');
    expect(result.preview).toMatchObject({
      externalId: 'v1|145000000001|0',
      title: 'Apple iPhone 13 128GB cracked screen for parts',
      price: { amountMinor: 29999, currency: 'USD' },
      sellerExternalId: 'repair-seller',
    });
    expect(result.payload).toMatchObject({
      conditionId: '7000',
      description: expect.stringContaining('powers on'),
    });
    expect(String(fetcher.mock.calls[1]?.[0])).toContain('v1%7C145000000001%7C0');
  });

  it('retries rate limits, refreshes an unauthorized token, and bounds attempts', async () => {
    let tokenCount = 0;
    let apiCount = 0;
    const fetcher = vi.fn<EbayFetch>(async (input) => {
      if (String(input).includes('/oauth2/token')) {
        tokenCount += 1;
        return Response.json({
          access_token: `token-${tokenCount}`,
          expires_in: 7200,
          token_type: 'Application Access Token',
        });
      }
      apiCount += 1;
      if (apiCount === 1)
        return Response.json({ errors: [{ message: 'Expired token' }] }, { status: 401 });
      if (apiCount === 2)
        return Response.json(
          { errors: [{ message: 'Slow down' }] },
          { status: 429, headers: { 'Retry-After': '0' } },
        );
      return Response.json(searchFixture);
    });
    const result = await adapter(fetcher).search({ criteria, limit: 2 });
    expect(result.items).toHaveLength(2);
    expect({ tokenCount, apiCount }).toEqual({ tokenCount: 2, apiCount: 3 });
  });

  it('classifies a final unauthorized response as an authentication health signal', async () => {
    const fetcher = vi.fn<EbayFetch>(async (input) =>
      String(input).includes('/oauth2/token')
        ? tokenResponse()
        : Response.json({ errors: [{ message: 'Unauthorized' }] }, { status: 401 }),
    );

    await expect(
      adapter(fetcher, { maxAttempts: 1 }).search({ criteria, limit: 1 }),
    ).rejects.toMatchObject({ code: 'EBAY_UNAUTHORIZED', kind: 'permanent' });
  });

  it('stops before exceeding the configured Browse request budget', async () => {
    const events: EbayRequestTelemetryEvent[] = [];
    const fetcher = vi.fn<EbayFetch>(async (input) =>
      String(input).includes('/oauth2/token') ? tokenResponse() : Response.json(searchFixture),
    );
    const connector = adapter(
      fetcher,
      { maxAttempts: 1, maxBrowseRequests: 2 },
      { onRequest: (event) => events.push(event) },
    );
    await connector.search({ criteria, limit: 1 });
    await connector.search({ criteria, limit: 1 });
    await expect(connector.search({ criteria, limit: 1 })).rejects.toMatchObject({
      kind: 'permanent',
      code: 'REQUEST_BUDGET_EXHAUSTED',
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(events.at(-1)).toMatchObject({
      outcome: 'error',
      errorCode: 'REQUEST_BUDGET_EXHAUSTED',
      requestNumber: 2,
      maxRequests: 2,
    });
    expect(connector.getRequestBudgetSnapshot().exhausted).toBe(true);
  });

  it('classifies permanent API failures and rejects malformed successful payloads', async () => {
    const rejectedFetch = vi.fn<EbayFetch>(async (input) =>
      String(input).includes('/oauth2/token')
        ? tokenResponse()
        : Response.json({ errors: [{ message: 'Bad filter' }] }, { status: 400 }),
    );
    await expect(adapter(rejectedFetch).search({ criteria, limit: 2 })).rejects.toMatchObject({
      kind: 'permanent',
      code: 'EBAY_API_REJECTED',
    });
    expect(rejectedFetch).toHaveBeenCalledTimes(2);

    const invalidFetch = vi.fn<EbayFetch>(async (input) =>
      String(input).includes('/oauth2/token')
        ? tokenResponse()
        : Response.json({ itemSummaries: [{ itemId: 'missing-required-fields' }] }),
    );
    await expect(adapter(invalidFetch).search({ criteria, limit: 2 })).rejects.toMatchObject({
      kind: 'permanent',
      code: 'EBAY_SEARCH_INVALID_RESPONSE',
    });
  });

  it('uses exact minor-unit parsing and fails safely when credentials are unavailable', async () => {
    expect(parseEbayAmountMinor('0.01')).toBe(1);
    expect(parseEbayAmountMinor('299.99')).toBe(29999);
    expect(() => parseEbayAmountMinor('12.345')).toThrow(ConnectorError);
    await expect(
      new UnavailableEbayConnector('production').search({ criteria, limit: 1 }),
    ).rejects.toMatchObject({ kind: 'permanent', code: 'EBAY_CONFIGURATION_MISSING' });
  });
});
