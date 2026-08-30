import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, {
  configuredTextAnalyzer,
  configuredEbayConnector,
  configuredMercadoLivreConnector,
  ebayCollectionLimits,
} from '../apps/worker/src/index';
import { EbayApiAdapter, UnavailableEbayConnector } from '@scout/ebay-connector';
import { GeminiTextAnalyzer } from '@scout/ai';
import { UnavailableMercadoLivreConnector } from '@scout/ml-connector';

const runId = '77777777-7777-4777-a777-777777777777';
const projectId = '33333333-3333-4333-a333-333333333333';
const sourceId = '00000000-0000-4000-a000-000000000001';
const now = '2026-07-28T21:00:00.000Z';
const criteria = {
  category: 'smartphone',
  brands: ['Apple'],
  models: ['iPhone 13'],
  variants: [],
  storageGb: [128],
  memoryGb: [],
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

const runRow = (status: 'pending' | 'running' | 'completed', provider: string, id = runId) => ({
  id,
  project_id: projectId,
  source_id: sourceId,
  status,
  idempotency_key: 'm5-worker-wire',
  queued_at: now,
  started_at: status === 'pending' ? null : now,
  finished_at: status === 'completed' ? now : null,
  lease_expires_at: null,
  attempt_count: 1,
  items_found: status === 'completed' ? 1 : 0,
  items_created: 0,
  items_updated: 0,
  estimated_cost: 0,
  provider,
  error: null,
  error_kind: null,
  error_code: null,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Milestone 5 Worker eBay adapter wiring', () => {
  it('selects the real text analyzer only with explicit Gemini mode', () => {
    expect(
      configuredTextAnalyzer({
        TEXT_ANALYZER_MODE: 'gemini',
        GEMINI_API_KEY: 'fixture-key',
      } as never),
    ).toBeInstanceOf(GeminiTextAnalyzer);
    expect(
      configuredTextAnalyzer({ TEXT_ANALYZER_MODE: 'deterministic' } as never),
    ).not.toBeInstanceOf(GeminiTextAnalyzer);
  });

  it('keeps the Browse budget closed across single and query-family collection paths', () => {
    expect(ebayCollectionLimits({ EBAY_BROWSE_BUDGET_PER_RUN: '103' } as never)).toEqual({
      maxPages: 1,
      pageSize: 100,
      maxItems: 100,
      maxQueries: 3,
    });
    expect(ebayCollectionLimits({ EBAY_BROWSE_BUDGET_PER_RUN: '400' } as never)).toEqual({
      maxPages: 4,
      pageSize: 100,
      maxItems: 394,
      maxQueries: 3,
    });
  });

  it('fails closed in Production without the atomic rate-limit Durable Object', () => {
    const connector = configuredEbayConnector({
      EBAY_CONNECTOR_MODE: 'production',
      EBAY_APP_ID_CLIENT_ID: 'client-id',
      EBAY_CERT_ID_CLIENT_SECRET: 'client-secret',
      EBAY_MARKETPLACE_ID: 'EBAY_US',
      EBAY_GLOBAL_REQUESTS_PER_MINUTE: '2',
      EBAY_BROWSE_BUDGET_PER_RUN: '6',
      SCOUT_CACHE: {} as never,
    } as never);
    expect(connector).toBeInstanceOf(UnavailableEbayConnector);
  });

  it('fails closed in Production without a declared Browse budget', () => {
    const namespace = {
      idFromName: vi.fn(() => ({ toString: () => 'rate-limit-id' })),
      get: vi.fn(),
    };
    const connector = configuredEbayConnector({
      EBAY_CONNECTOR_MODE: 'production',
      EBAY_APP_ID_CLIENT_ID: 'client-id',
      EBAY_CERT_ID_CLIENT_SECRET: 'client-secret',
      EBAY_MARKETPLACE_ID: 'EBAY_US',
      EBAY_GLOBAL_REQUESTS_PER_MINUTE: '2',
      EBAY_RATE_LIMITER: namespace,
    } as never);
    expect(connector).toBeInstanceOf(UnavailableEbayConnector);
  });

  it('uses the atomic rate-limit Durable Object in Production', () => {
    const namespace = {
      idFromName: vi.fn(() => ({ toString: () => 'rate-limit-id' })),
      get: vi.fn(),
    };
    const connector = configuredEbayConnector({
      EBAY_CONNECTOR_MODE: 'production',
      EBAY_APP_ID_CLIENT_ID: 'client-id',
      EBAY_CERT_ID_CLIENT_SECRET: 'client-secret',
      EBAY_MARKETPLACE_ID: 'EBAY_US',
      EBAY_GLOBAL_REQUESTS_PER_MINUTE: '2',
      EBAY_BROWSE_BUDGET_PER_RUN: '6',
      EBAY_RATE_LIMITER: namespace,
    } as never);
    expect(connector).toBeInstanceOf(EbayApiAdapter);
  });

  it('keeps Mercado Livre unavailable without an explicit production token', () => {
    expect(configuredMercadoLivreConnector({} as never)).toBeInstanceOf(
      UnavailableMercadoLivreConnector,
    );
    expect(
      configuredMercadoLivreConnector({ ML_CONNECTOR_MODE: 'production' } as never),
    ).toBeInstanceOf(UnavailableMercadoLivreConnector);
  });

  it('enables Mercado Livre only with explicit server-side production credentials', () => {
    const connector = configuredMercadoLivreConnector({
      ML_CONNECTOR_MODE: 'production',
      ML_ACCESS_TOKEN: 'test-ml-token',
    } as never);
    expect(connector.provider).toBe('mercadolivre-api-v1');
    expect(
      configuredMercadoLivreConnector({
        ML_CONNECTOR_MODE: 'production',
        ML_CLIENT_ID: 'client-id',
        ML_CLIENT_SECRET: 'client-secret',
        ML_REFRESH_TOKEN: 'refresh-token',
      } as never).provider,
    ).toBe('mercadolivre-api-v1');
  });

  it('uses the official sandbox adapter only when explicitly configured', async () => {
    const apiCalls: string[] = [];
    const collectionPatches: Array<Record<string, unknown>> = [];
    const progressPatches: Array<Record<string, unknown>> = [];
    let completionBody: Record<string, unknown> | undefined;
    const rawPut = vi.fn(async () => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/rest/v1/collection_runs') && !init?.method)
          return Response.json([runRow('pending', 'ebay-mock-v1')]);
        if (url.includes('/rest/v1/collection_runs') && init?.method === 'PATCH') {
          const body = JSON.parse(String(init.body)) as {
            status?: string;
            provider?: string;
            items_found?: number;
            requests_used?: number;
            request_budget?: number;
          };
          if (body.provider !== undefined) collectionPatches.push(body);
          if (body.items_found !== undefined) progressPatches.push(body);
          return Response.json([
            runRow(
              body.status === 'completed' ? 'completed' : 'running',
              body.provider ?? 'ebay-api-sandbox-v1',
            ),
          ]);
        }
        if (url.includes('/rpc/complete_collection_run_with_health')) {
          completionBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return Response.json([runRow('completed', 'ebay-api-sandbox-v1')]);
        }
        if (url.includes('/rest/v1/research_projects'))
          return Response.json([{ structured_query: criteria }]);
        if (url.includes('/rest/v1/search_term_observations') && !init?.method)
          return Response.json([]);
        if (url.includes('/rest/v1/search_query_families'))
          return Response.json([{ id: '99999999-9999-4999-a999-999999999999' }]);
        if (url.includes('/rest/v1/search_term_observations'))
          return new Response(null, { status: 201 });
        if (url.includes('/rpc/ingest_normalized_ebay_listing')) {
          apiCalls.push('ingest');
          return Response.json([
            {
              listing_id: '22222222-2222-4222-a222-222222222222',
              created: true,
              updated: false,
            },
          ]);
        }
        if (url.includes('/rest/v1/listing_triage_decisions') && !init?.method)
          return Response.json([]);
        if (url.includes('/rest/v1/listing_triage_decisions'))
          return new Response(null, { status: 201 });
        if (url.includes('/identity/v1/oauth2/token')) {
          apiCalls.push('oauth');
          return Response.json({
            access_token: 'worker-token',
            expires_in: 7200,
            token_type: 'Application Access Token',
          });
        }
        if (url.includes('/item_summary/search')) {
          apiCalls.push('search');
          return Response.json({
            itemSummaries: [
              {
                itemId: 'v1|145000000001|0',
                title: 'Apple iPhone 13 128GB cracked screen for parts',
                itemWebUrl: 'https://www.ebay.com/itm/145000000001',
                price: { value: '299.99', currency: 'USD' },
              },
            ],
          });
        }
        if (url.includes('/buy/browse/v1/item/')) {
          apiCalls.push('details');
          return Response.json({
            itemId: 'v1|145000000001|0',
            title: 'Apple iPhone 13 128GB cracked screen for parts',
            itemWebUrl: 'https://www.ebay.com/itm/145000000001',
            price: { value: '299.99', currency: 'USD' },
            condition: 'For parts or not working',
            conditionId: '7000',
            description: 'Screen cracked; powers on.',
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );
    const ack = vi.fn();
    const retry = vi.fn();
    const env = {
      SUPABASE_URL: 'http://supabase.local',
      SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
      EBAY_CONNECTOR_MODE: 'sandbox',
      EBAY_APP_ID_CLIENT_ID: 'worker-wire-client',
      EBAY_CERT_ID_CLIENT_SECRET: 'worker-wire-secret',
      EBAY_MARKETPLACE_ID: 'EBAY_US',
      EBAY_BROWSE_BUDGET_PER_RUN: '6',
      RAW_BUCKET: { put: rawPut },
      EBAY_IDENTITY_HASH_SECRET: 'test-only-identity-hash-secret-32-chars',
    } as never;

    await worker.queue({ messages: [{ body: { version: '1', runId }, ack, retry }] } as never, env);
    expect(rawPut).toHaveBeenCalledOnce();
    expect(apiCalls).toEqual(['oauth', 'search', 'details', 'search', 'search', 'ingest']);
    expect(collectionPatches).toEqual([{ provider: 'ebay-api-sandbox-v1' }]);
    expect(progressPatches).toEqual([
      { items_found: 1, requests_used: 2, request_budget: 6, truncated: false },
      { items_found: 1, requests_used: 3, request_budget: 6, truncated: false },
      { items_found: 1, requests_used: 4, request_budget: 6, truncated: false },
      { items_found: 1, requests_used: 4, request_budget: 6, truncated: false },
    ]);
    expect(completionBody).toEqual(
      expect.objectContaining({
        p_run_id: runId,
        p_items_found: 1,
        p_items_created: 1,
        p_items_updated: 0,
        p_provider: 'ebay-api-sandbox-v1',
        p_health: expect.objectContaining({
          collectionRunId: runId,
          state: 'NORMAL',
          ingestionLayer: 1,
        }),
      }),
    );
    expect(retry).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledOnce();
  });

  it('pages through Browse results when the run budget allows more items than one page', async () => {
    // O limite efetivo (207 itens) é MAIOR que o pageSize (100). Um limite menor
    // que o pageSize nunca produziria segunda página e não provaria nada.
    const searchOffsets: string[] = [];
    const detailIds = new Set<string>();
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/identity/v1/oauth2/token'))
        return Response.json({
          access_token: 'paging-token',
          expires_in: 7200,
          token_type: 'Application Access Token',
        });
      if (url.includes('/rest/v1/collection_runs') && !init?.method)
        return Response.json([runRow('pending', 'ebay-api-production-v1')]);
      if (url.includes('/rest/v1/collection_runs') && init?.method === 'PATCH')
        return Response.json([runRow('running', 'ebay-api-production-v1')]);
      if (url.includes('/rpc/complete_collection_run_with_health'))
        return Response.json([runRow('completed', 'ebay-api-production-v1')]);
      if (url.includes('/rest/v1/research_projects'))
        return Response.json([{ structured_query: criteria }]);
      if (url.includes('/rest/v1/search_term_observations') && !init?.method)
        return Response.json([]);
      if (url.includes('/rest/v1/search_query_families'))
        return Response.json([{ id: '99999999-9999-4999-a999-999999999999' }]);
      if (url.includes('/rest/v1/search_term_observations'))
        return new Response(null, { status: 201 });
      if (url.includes('/rpc/ingest_normalized_ebay_listing'))
        return Response.json([
          { listing_id: '22222222-2222-4222-a222-222222222222', created: true, updated: false },
        ]);
      if (url.includes('/rest/v1/listing_triage_decisions') && !init?.method)
        return Response.json([]);
      if (url.includes('/rest/v1/listing_triage_decisions'))
        return new Response(null, { status: 201 });
      if (url.includes('/item_summary/search')) {
        const offset = new URL(url).searchParams.get('offset') ?? '0';
        searchOffsets.push(offset);
        const base = Number(offset);
        return Response.json({
          next: 'https://api.ebay.com/buy/browse/v1/item_summary/search?offset=next',
          itemSummaries: [0, 1].map((index) => ({
            itemId: `v1|1450000000${base + index}|0`,
            title: 'Apple iPhone 13 128GB cracked screen for parts',
            itemWebUrl: `https://www.ebay.com/itm/1450000000${base + index}`,
            price: { value: '299.99', currency: 'USD' },
          })),
        });
      }
      if (url.includes('/buy/browse/v1/item/')) {
        const itemId = decodeURIComponent(url.split('/item/')[1]?.split('?')[0] ?? '');
        detailIds.add(itemId);
        return Response.json({
          itemId,
          title: 'Apple iPhone 13 128GB cracked screen for parts',
          itemWebUrl: 'https://www.ebay.com/itm/145000000001',
          price: { value: '299.99', currency: 'USD' },
          condition: 'For parts or not working',
          conditionId: '7000',
          description: 'Screen cracked; powers on.',
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);
    const rawPut = vi.fn(async () => undefined);
    const ack = vi.fn();
    const env = {
      SUPABASE_URL: 'http://supabase.local',
      SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
      EBAY_CONNECTOR_MODE: 'production',
      EBAY_APP_ID_CLIENT_ID: 'worker-wire-production-client',
      EBAY_CERT_ID_CLIENT_SECRET: 'worker-wire-production-secret',
      EBAY_MARKETPLACE_ID: 'EBAY_US',
      EBAY_GLOBAL_REQUESTS_PER_MINUTE: '600',
      EBAY_BROWSE_BUDGET_PER_RUN: '210',
      EBAY_RATE_LIMITER: {
        idFromName: vi.fn(() => ({ toString: () => 'rate-limit-id' })),
        get: vi.fn(() => ({ fetch: vi.fn(async () => Response.json({ ok: true })) })),
      },
      RAW_BUCKET: { put: rawPut },
      EBAY_IDENTITY_HASH_SECRET: 'test-only-identity-hash-secret-32-chars',
    } as never;

    await worker.queue(
      { messages: [{ body: { version: '1', runId }, ack, retry: vi.fn() }] } as never,
      env,
    );

    expect(searchOffsets.length).toBeGreaterThan(1);
    expect(searchOffsets).toEqual(['0', '2', '4', '0', '2', '4', '0', '2', '4']);
    expect(detailIds.size).toBe(6);
    expect(rawPut).toHaveBeenCalledTimes(6);
    expect(ack).toHaveBeenCalledOnce();
  });

  it('logs sanitized Browse telemetry and resets the local budget for each collection message', async () => {
    const logs: unknown[][] = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => logs.push(args));
    const runIds = [runId, '88888888-8888-4888-a888-888888888888'];
    let oauthCalls = 0;
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/identity/v1/oauth2/token')) {
        oauthCalls += 1;
        return Response.json({
          access_token: `worker-token-${oauthCalls}`,
          expires_in: 7200,
          token_type: 'Application Access Token',
        });
      }
      if (url.includes('/rest/v1/collection_runs') && !init?.method) {
        const requestedId = new URL(url).searchParams.get('id')?.replace(/^eq\./, '') ?? runId;
        return Response.json([runRow('pending', 'ebay-api-production-v1', requestedId)]);
      }
      if (url.includes('/rest/v1/collection_runs') && init?.method === 'PATCH')
        return Response.json([runRow('running', 'ebay-api-production-v1')]);
      if (url.includes('/rpc/complete_collection_run_with_health'))
        return Response.json([runRow('completed', 'ebay-api-production-v1')]);
      if (url.includes('/rest/v1/research_projects'))
        return Response.json([{ structured_query: criteria }]);
      if (url.includes('/rest/v1/search_term_observations') && !init?.method)
        return Response.json([]);
      if (url.includes('/rest/v1/search_query_families'))
        return Response.json([{ id: '99999999-9999-4999-a999-999999999999' }]);
      if (url.includes('/rest/v1/search_term_observations'))
        return new Response(null, { status: 201 });
      if (url.includes('/rpc/ingest_normalized_ebay_listing'))
        return Response.json([
          {
            listing_id: '22222222-2222-4222-a222-222222222222',
            created: true,
            updated: false,
          },
        ]);
      if (url.includes('/rest/v1/listing_triage_decisions') && !init?.method)
        return Response.json([]);
      if (url.includes('/rest/v1/listing_triage_decisions'))
        return new Response(null, { status: 201 });
      if (url.includes('/item_summary/search'))
        return Response.json({
          itemSummaries: [
            {
              itemId: 'v1|145000000001|0',
              title: 'Apple iPhone 13 128GB cracked screen for parts',
              itemWebUrl: 'https://www.ebay.com/itm/145000000001',
              price: { value: '299.99', currency: 'USD' },
            },
          ],
        });
      if (url.includes('/buy/browse/v1/item/'))
        return Response.json({
          itemId: 'v1|145000000001|0',
          title: 'Apple iPhone 13 128GB cracked screen for parts',
          itemWebUrl: 'https://www.ebay.com/itm/145000000001',
          price: { value: '299.99', currency: 'USD' },
          condition: 'For parts or not working',
          conditionId: '7000',
          description: 'Screen cracked; powers on.',
        });
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);
    const rateLimiter = {
      idFromName: vi.fn(() => ({ toString: () => 'rate-limit-id' })),
      get: vi.fn(() => ({ fetch: vi.fn(async () => Response.json({ ok: true })) })),
    };
    const rawPut = vi.fn(async () => undefined);
    const ack = vi.fn();
    const retry = vi.fn();
    const env = {
      SUPABASE_URL: 'http://supabase.local',
      SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
      EBAY_CONNECTOR_MODE: 'production',
      EBAY_APP_ID_CLIENT_ID: 'worker-wire-production-client',
      EBAY_CERT_ID_CLIENT_SECRET: 'worker-wire-production-secret',
      EBAY_MARKETPLACE_ID: 'EBAY_US',
      EBAY_GLOBAL_REQUESTS_PER_MINUTE: '10',
      EBAY_BROWSE_BUDGET_PER_RUN: '6',
      EBAY_RATE_LIMITER: rateLimiter,
      RAW_BUCKET: { put: rawPut },
      EBAY_IDENTITY_HASH_SECRET: 'test-only-identity-hash-secret-32-chars',
    } as never;

    await worker.queue(
      {
        messages: runIds.map((messageRunId) => ({
          body: { version: '1', runId: messageRunId },
          ack,
          retry,
        })),
      } as never,
      env,
    );

    const telemetry = logs
      .filter(([label]) => label === 'eBay Browse telemetry')
      .map(([, event]) => event as Record<string, unknown>);
    expect(
      telemetry.map(({ operation, requestNumber, maxRequests }) => ({
        operation,
        requestNumber,
        maxRequests,
      })),
    ).toEqual([
      { operation: 'search', requestNumber: 1, maxRequests: 6 },
      { operation: 'details', requestNumber: 2, maxRequests: 6 },
      { operation: 'search', requestNumber: 3, maxRequests: 6 },
      { operation: 'search', requestNumber: 4, maxRequests: 6 },
      { operation: 'search', requestNumber: 1, maxRequests: 6 },
      { operation: 'details', requestNumber: 2, maxRequests: 6 },
      { operation: 'search', requestNumber: 3, maxRequests: 6 },
      { operation: 'search', requestNumber: 4, maxRequests: 6 },
    ]);
    expect(
      telemetry.every((event) =>
        Object.keys(event).every((key) =>
          [
            'operation',
            'attempt',
            'requestNumber',
            'maxRequests',
            'outcome',
            'status',
            'errorCode',
            'total',
            'nextPresent',
            'q',
          ].includes(key),
        ),
      ),
    ).toBe(true);
    expect(
      telemetry.some((event) => 'url' in event || 'token' in event || 'payload' in event),
    ).toBe(false);
    expect(ack).toHaveBeenCalledTimes(2);
    expect(retry).not.toHaveBeenCalled();
  });

  it('requires and applies the configured manual probe Browse budget', async () => {
    const token = 'a'.repeat(64);
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/identity/v1/oauth2/token')) {
        return Response.json({
          access_token: 'probe-token',
          expires_in: 7200,
          token_type: 'Application Access Token',
        });
      }
      if (url.includes('/item_summary/search')) {
        return Response.json({
          itemSummaries: Array.from({ length: 6 }, (_, index) => ({
            itemId: `probe-${index + 1}`,
            title: `MacBook Pro M4 Max fixture ${index + 1}`,
            itemWebUrl: `https://www.ebay.com/itm/probe-${index + 1}`,
            price: { value: '1999.00', currency: 'USD' },
          })),
        });
      }
      if (url.includes('/buy/browse/v1/item/')) {
        const externalId = decodeURIComponent(new URL(url).pathname.split('/').at(-1) ?? '');
        return Response.json({
          itemId: externalId,
          title: `MacBook Pro M4 Max fixture ${externalId}`,
          itemWebUrl: `https://www.ebay.com/itm/${externalId}`,
          price: { value: '1999.00', currency: 'USD' },
          condition: 'For parts or not working',
          conditionId: '7000',
          description: 'Fixture description.',
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);
    const baseEnv = {
      EBAY_PROBE_TOKEN: token,
      EBAY_APP_ID_CLIENT_ID: 'production-client',
      EBAY_CERT_ID_CLIENT_SECRET: 'production-secret',
      EBAY_MARKETPLACE_ID: 'EBAY_US',
    };

    const denied = await worker.fetch(
      new Request('https://worker.test/internal/ebay/probe', {
        method: 'POST',
        headers: { Authorization: 'Bearer invalid', 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'MacBook Pro M4 Max' }),
      }),
      baseEnv as never,
      {} as never,
    );
    expect(denied.status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();

    const invalid = await worker.fetch(
      new Request('https://worker.test/internal/ebay/probe', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'MacBook Pro M4 Max', maxResults: 6 }),
      }),
      baseEnv as never,
      {} as never,
    );
    expect(invalid.status).toBe(422);
    expect(fetcher).not.toHaveBeenCalled();

    const missingBudget = await worker.fetch(
      new Request('https://worker.test/internal/ebay/probe', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'MacBook Pro M4 Max', maxResults: 5 }),
      }),
      baseEnv as never,
      {} as never,
    );
    expect(missingBudget.status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();

    const env = { ...baseEnv, EBAY_BROWSE_BUDGET_PER_RUN: '3' } as never;

    const response = await worker.fetch(
      new Request('https://worker.test/internal/ebay/probe', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'MacBook Pro M4 Max', maxResults: 5 }),
      }),
      env,
      {} as never,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      provider: 'ebay-api-production-v1',
      query: 'MacBook Pro M4 Max',
      browseRequests: 3,
      browseBudget: {
        maxRequests: 3,
        exhausted: true,
      },
      items: expect.arrayContaining([
        expect.objectContaining({ title: expect.stringContaining('MacBook Pro M4 Max') }),
      ]),
    });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
