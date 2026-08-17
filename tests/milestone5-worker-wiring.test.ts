import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, {
  configuredEbayConnector,
  configuredMercadoLivreConnector,
} from '../apps/worker/src/index';
import { EbayApiAdapter, UnavailableEbayConnector } from '@scout/ebay-connector';
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

const runRow = (status: 'running' | 'completed', provider: string) => ({
  id: runId,
  project_id: projectId,
  source_id: sourceId,
  status,
  idempotency_key: 'm5-worker-wire',
  queued_at: now,
  started_at: now,
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
  it('fails closed in Production without the atomic rate-limit Durable Object', () => {
    const connector = configuredEbayConnector({
      EBAY_CONNECTOR_MODE: 'production',
      EBAY_APP_ID_CLIENT_ID: 'client-id',
      EBAY_CERT_ID_CLIENT_SECRET: 'client-secret',
      EBAY_MARKETPLACE_ID: 'EBAY_US',
      EBAY_GLOBAL_REQUESTS_PER_MINUTE: '2',
      SCOUT_CACHE: {} as never,
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
    let completionBody: Record<string, unknown> | undefined;
    const rawPut = vi.fn(async () => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/rpc/claim_collection_run'))
          return Response.json([runRow('running', 'ebay-mock-v1')]);
        if (url.includes('/rest/v1/collection_runs') && init?.method === 'PATCH') {
          const body = JSON.parse(String(init.body)) as { status?: string; provider?: string };
          collectionPatches.push(body);
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
      RAW_BUCKET: { put: rawPut },
      EBAY_IDENTITY_HASH_SECRET: 'test-only-identity-hash-secret-32-chars',
    } as never;

    await worker.queue({ messages: [{ body: { version: '1', runId }, ack, retry }] } as never, env);
    expect(rawPut).toHaveBeenCalledOnce();
    expect(apiCalls).toEqual(['oauth', 'search', 'details', 'ingest']);
    expect(collectionPatches).toEqual([{ provider: 'ebay-api-sandbox-v1' }]);
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

  it('runs the authenticated manual production probe within six Browse calls', async () => {
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
    const env = {
      EBAY_PROBE_TOKEN: token,
      EBAY_APP_ID_CLIENT_ID: 'production-client',
      EBAY_CERT_ID_CLIENT_SECRET: 'production-secret',
      EBAY_MARKETPLACE_ID: 'EBAY_US',
    } as never;

    const denied = await worker.fetch(
      new Request('https://worker.test/internal/ebay/probe', {
        method: 'POST',
        headers: { Authorization: 'Bearer invalid', 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'MacBook Pro M4 Max' }),
      }),
      env,
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
      env,
      {} as never,
    );
    expect(invalid.status).toBe(422);
    expect(fetcher).not.toHaveBeenCalled();

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
      browseRequests: 6,
      items: expect.arrayContaining([
        expect.objectContaining({ title: expect.stringContaining('MacBook Pro M4 Max') }),
      ]),
    });
    expect(fetcher).toHaveBeenCalledTimes(7);
  });
});
