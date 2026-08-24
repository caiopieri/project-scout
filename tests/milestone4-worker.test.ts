import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../apps/worker/src/index';

const userId = '11111111-1111-4111-a111-111111111111';
const projectId = '33333333-3333-4333-a333-333333333333';
const runId = '77777777-7777-4777-a777-777777777777';
const sourceId = '00000000-0000-4000-a000-000000000001';
const criteria = {
  category: 'smartphone',
  brands: ['Apple'],
  models: ['iPhone 13'],
  variants: [],
  storageGb: [128],
  memoryGb: [],
  acceptedDefects: ['cracked_screen'],
  rejectedDefects: ['activation_lock'],
  acceptedConditions: ['for_repair'],
  countries: [],
  regions: [],
  requiredFunctionalStates: [],
  preferredEvidence: [],
  additionalKeywords: [],
  excludedKeywords: [],
};
const now = '2026-07-28T21:00:00.000Z';

const projectRow = (status = 'active') => ({
  id: projectId,
  user_id: userId,
  name: 'iPhone 13 para reparo',
  description: null,
  category: 'smartphone',
  natural_language_query: 'iPhone 13 128 GB com tela quebrada até R$ 1.800.',
  structured_query: criteria,
  status,
  taxonomy_version: '1.0.0',
  interpreter_provider: 'deterministic',
  interpreter_model: 'rules-pt-BR',
  interpreter_version: '1.0.0',
  interpreted_at: now,
  interpretation_confidence: 0.9,
  interpretation_ambiguities: [],
  interpretation_warnings: [],
  unidentified_fields: [],
  deleted_at: null,
  created_at: now,
  updated_at: now,
});

const runRow = (status = 'pending', queued = false, attemptCount = 0) => ({
  id: runId,
  project_id: projectId,
  source_id: sourceId,
  status,
  idempotency_key: 'collect-iphone-13-v1',
  queued_at: queued ? now : null,
  started_at: status === 'running' ? now : null,
  finished_at: status === 'completed' || status === 'failed' ? now : null,
  lease_expires_at: null,
  attempt_count: attemptCount,
  items_found: status === 'completed' ? 5 : 0,
  items_created: 0,
  items_updated: 0,
  estimated_cost: 0,
  provider: 'ebay-mock-v1',
  error: null,
  error_kind: null,
  error_code: null,
});

const queueSend = vi.fn(async () => undefined);
const rawPut = vi.fn(async () => undefined);
const env = {
  SUPABASE_URL: 'http://supabase.local',
  SUPABASE_ANON_KEY: 'local-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'local-service-key',
  WEB_ORIGIN: 'http://localhost:3000',
  COLLECT_QUEUE: { send: queueSend },
  RAW_BUCKET: { put: rawPut },
  EBAY_IDENTITY_HASH_SECRET: 'test-only-identity-hash-secret-32-chars',
} as never;

async function call(path: string, method = 'GET', idempotencyKey?: string) {
  return worker.fetch(
    new Request(`http://worker.local${path}`, {
      method,
      headers: {
        Authorization: 'Bearer valid-user-jwt',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
    }),
    env,
    {} as never,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  queueSend.mockClear();
  rawPut.mockClear();
});

describe('Milestone 4 Worker producer and consumer', () => {
  it('creates and queues one owner-scoped collection run', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/auth/v1/user'))
          return Response.json({ id: userId, email: 'owner@example.test' });
        if (url.includes('/rest/v1/profiles')) return new Response(null, { status: 201 });
        if (url.includes('/rest/v1/research_projects')) return Response.json([projectRow()]);
        if (url.includes('/rpc/request_ebay_collection_run')) return Response.json([runRow()]);
        if (url.includes('/rpc/mark_collection_run_queued'))
          return Response.json([runRow('pending', true)]);
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    const response = await call(
      `/api/projects/${projectId}/collection-runs`,
      'POST',
      'collect-iphone-13-v1',
    );
    expect(response.status).toBe(202);
    expect(queueSend).toHaveBeenCalledWith({ version: '1', runId });
    expect((await response.json()).provider).toBe('ebay-mock-v1');
  });

  it('returns an existing queued run without publishing a duplicate message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/auth/v1/user'))
          return Response.json({ id: userId, email: 'owner@example.test' });
        if (url.includes('/rest/v1/profiles')) return new Response(null, { status: 201 });
        if (url.includes('/rest/v1/research_projects')) return Response.json([projectRow()]);
        if (url.includes('/rpc/request_ebay_collection_run'))
          return Response.json([runRow('pending', true)]);
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );
    const response = await call(
      `/api/projects/${projectId}/collection-runs`,
      'POST',
      'collect-iphone-13-v1',
    );
    expect(response.status).toBe(200);
    expect(queueSend).not.toHaveBeenCalled();
  });

  it('requires an idempotency key and an active project', async () => {
    const projectStatus = vi.fn(() => 'active');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/auth/v1/user'))
          return Response.json({ id: userId, email: 'owner@example.test' });
        if (url.includes('/rest/v1/profiles')) return new Response(null, { status: 201 });
        if (url.includes('/rest/v1/research_projects'))
          return Response.json([projectRow(projectStatus())]);
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );
    expect((await call(`/api/projects/${projectId}/collection-runs`, 'POST')).status).toBe(422);
    projectStatus.mockReturnValue('archived');
    expect(
      (await call(`/api/projects/${projectId}/collection-runs`, 'POST', 'collect-iphone-13-v2'))
        .status,
    ).toBe(409);
  });

  it('returns only a run visible inside the requested project scope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/auth/v1/user'))
          return Response.json({ id: userId, email: 'owner@example.test' });
        if (url.includes('/rest/v1/profiles')) return new Response(null, { status: 201 });
        if (url.includes('/rest/v1/collection_runs'))
          return Response.json([runRow('completed', true, 1)]);
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );
    const response = await call(`/api/projects/${projectId}/collection-runs/${runId}`);
    expect(response.status).toBe(200);
    expect((await response.json()).itemsFound).toBe(5);
  });

  it('returns the latest owner-scoped opportunity valuation for a project listing', async () => {
    const listingId = '22222222-2222-4222-a222-222222222222';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/auth/v1/user'))
          return Response.json({ id: userId, email: 'owner@example.test' });
        if (url.includes('/rest/v1/profiles')) return new Response(null, { status: 201 });
        if (url.includes('/rest/v1/research_projects')) return Response.json([projectRow()]);
        if (url.includes('/rest/v1/research_project_listings'))
          return Response.json([{ listing_id: listingId }]);
        if (url.includes('/rest/v1/opportunity_valuations'))
          return Response.json([
            {
              id: '88888888-8888-4888-a888-888888888888',
              listing_id: listingId,
              valuation_version: 'valuation-rules.v1',
              estimated_market_price: 1550,
              max_purchase_price: 945,
              deal_score: 48,
              trend_score: 60,
              liquidity_score: 78,
              seller_pressure_score: 80,
              risk_confidence_score: 85,
              confidence: 0.85,
              comparables_used: 3,
              outliers_removed: 1,
              evidence: ['comparables:3'],
              missing: ['days-to-sell observations'],
              explanation: 'Fixture valuation',
              created_at: now,
            },
          ]);
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    const response = await call(`/api/projects/${projectId}/listings/${listingId}/valuation`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      listingId,
      maxPurchasePriceMinor: 94500,
      valuationVersion: 'valuation-rules.v1',
    });
  });

  it('processes a queue message with the service role and acknowledges it', async () => {
    const ack = vi.fn();
    const retry = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer local-service-key');
        if (url.includes('/rpc/claim_collection_run'))
          return Response.json([runRow('running', true, 1)]);
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
        if (url.includes('/rpc/complete_collection_run_with_health'))
          return Response.json([runRow('completed', true, 1)]);
        if (url.includes('/rest/v1/collection_runs') && init?.method === 'PATCH')
          return Response.json([runRow('completed', true, 1)]);
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await worker.queue({ messages: [{ body: { version: '1', runId }, ack, retry }] } as never, env);
    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
    // O caminho mock tem 5 fixtures. O 4 anterior era o teto artificial de
    // coleta que a S1.1b-1 remove, não uma propriedade do mock.
    expect(rawPut).toHaveBeenCalledTimes(5);
  });

  it('retries an infrastructure failure without acknowledging the message', async () => {
    const ack = vi.fn();
    const retry = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    await worker.queue({ messages: [{ body: { version: '1', runId }, ack, retry }] } as never, env);
    expect(ack).not.toHaveBeenCalled();
    expect(retry).toHaveBeenCalledWith({ delaySeconds: 30 });
    consoleError.mockRestore();
  });
});
