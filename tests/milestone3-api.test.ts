import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../apps/worker/src/index';

const userId = '11111111-1111-4111-a111-111111111111';
const projectId = '33333333-3333-4333-a333-333333333333';
const env = {
  SUPABASE_URL: 'http://supabase.local',
  SUPABASE_ANON_KEY: 'local-anon-key',
  WEB_ORIGIN: 'http://localhost:3000',
} as never;

const criteria = {
  category: 'smartphone',
  brands: ['Apple'],
  models: ['iPhone 13'],
  variants: [],
  storageGb: [128],
  memoryGb: [],
  maximumPrice: { amountMinor: 180000, currency: 'BRL' },
  acceptedDefects: ['cracked_screen'],
  rejectedDefects: ['activation_lock'],
  acceptedConditions: [],
  countries: [],
  regions: [],
  requiredFunctionalStates: [],
  preferredEvidence: [],
  additionalKeywords: [],
  excludedKeywords: [],
};
const interpretation = {
  confidence: 0.9,
  ambiguities: [],
  warnings: [],
  unidentifiedFields: [],
  provider: 'deterministic',
  model: 'rules-pt-BR',
  promptOrRuleVersion: '1.0.0',
  taxonomyVersion: '1.0.0',
  interpretedAt: '2026-07-28T18:00:00.000Z',
};

function projectRow(status = 'active') {
  return {
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
    interpreted_at: '2026-07-28T18:00:00.000Z',
    interpretation_confidence: 0.9,
    interpretation_ambiguities: [],
    interpretation_warnings: [],
    unidentified_fields: [],
    deleted_at: null,
    created_at: '2026-07-28T18:00:00.000Z',
    updated_at: '2026-07-28T18:00:00.000Z',
  };
}

const makeLandedCost = (
  status: 'known' | 'indeterminate',
  itemPriceMinor: number,
  shippingCostMinor: number | null,
  totalMinor: number | null,
) => ({
  route: 'US_TO_US',
  policyVersion: 'landed-cost.us-us.v1',
  status,
  currency: 'USD',
  components: {
    itemPrice: { amountMinor: itemPriceMinor, currency: 'USD', origin: 'informado' },
    shipping: {
      amountMinor: shippingCostMinor,
      currency: 'USD',
      origin: shippingCostMinor === null ? 'desconhecido' : 'informado',
    },
  },
  totalMinor,
  missing: shippingCostMinor === null ? ['shipping'] : [],
});

const listingRow = (id: string, landedCost: ReturnType<typeof makeLandedCost>) => ({
  id,
  source_id: '00000000-0000-4000-a000-000000000001',
  external_id: id,
  url: `https://www.ebay.com/itm/${id}`,
  title: id,
  description: 'Fixture',
  condition: 'Used',
  currency: 'USD',
  price: landedCost.components.itemPrice.amountMinor / 100,
  shipping_cost: (landedCost.components.shipping.amountMinor ?? 0) / 100,
  total_visible_cost: (landedCost.totalMinor ?? landedCost.components.itemPrice.amountMinor) / 100,
  seller_id: null,
  location: null,
  status: 'active',
  published_at: null,
  first_collected_at: '2026-08-30T12:00:00.000Z',
  last_updated_at: '2026-08-30T12:00:00.000Z',
  specifications: {},
  inferred_product: null,
  raw_data_path: `raw/${id}.json`,
  raw_content_hash: null,
  raw_schema_version: null,
  raw_data_metadata: { shippingCostKnown: landedCost.status === 'known', landedCost },
});

function mockSupabase(restResponse: unknown = [], onRest?: (init?: RequestInit) => void) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/v1/user'))
        return Response.json({ id: userId, email: 'owner@example.test' });
      if (url.includes('/rest/v1/profiles')) return new Response(null, { status: 201 });
      if (url.includes('/rest/v1/research_projects')) {
        onRest?.(init);
        return Response.json(restResponse);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }),
  );
}

async function call(path: string, method = 'GET', body?: unknown, authenticated = true) {
  const request = new Request(`http://worker.local${path}`, {
    method,
    headers: authenticated
      ? { Authorization: 'Bearer valid-user-jwt', 'Content-Type': 'application/json' }
      : undefined,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return worker.fetch(request, env, {} as never);
}

afterEach(() => vi.unstubAllGlobals());

describe('Milestone 3 Worker API', () => {
  it('can disable user-facing API routes in a public deployment', async () => {
    const response = await worker.fetch(
      new Request('http://worker.local/api/projects'),
      { ...env, PUBLIC_API_ENABLED: 'false' } as never,
      {} as never,
    );
    expect(response.status).toBe(404);
  });

  it('rejects unauthenticated requests before project access', async () => {
    const response = await call('/api/projects', 'GET', undefined, false);
    expect(response.status).toBe(401);
  });

  it('validates and interprets an intent request', async () => {
    mockSupabase();
    const response = await call('/api/intent/interpret', 'POST', {
      query: 'iPhone 13 128 GB até R$ 1.800.',
    });
    expect(response.status).toBe(200);
    expect((await response.json()).criteria.models).toEqual(['iPhone 13']);
  });

  it('rejects malformed project creation payloads', async () => {
    mockSupabase();
    const response = await call('/api/projects', 'POST', { name: '' });
    expect(response.status).toBe(422);
  });

  it('creates a validated project using the authenticated identity', async () => {
    let persisted: Record<string, unknown> | undefined;
    mockSupabase([projectRow()], (init) => {
      persisted = JSON.parse(String(init?.body)) as Record<string, unknown>;
    });
    const response = await call('/api/projects', 'POST', {
      name: 'iPhone 13 para reparo',
      naturalLanguageQuery: 'iPhone 13 128 GB com tela quebrada até R$ 1.800.',
      structuredQuery: criteria,
      interpretation: { ...interpretation, provider: 'forged-browser-provider' },
      status: 'active',
    });
    expect(response.status).toBe(201);
    expect((await response.json()).userId).toBe(userId);
    expect(persisted?.interpreter_provider).toBe('deterministic');
  });

  it('returns not found when RLS yields no visible project', async () => {
    mockSupabase([]);
    const response = await call(`/api/projects/${projectId}`);
    expect(response.status).toBe(404);
  });

  it('archives, restores and soft-deletes through explicit lifecycle routes', async () => {
    mockSupabase([projectRow('archived')]);
    expect((await call(`/api/projects/${projectId}/archive`, 'POST')).status).toBe(200);
    expect((await call(`/api/projects/${projectId}/restore`, 'POST')).status).toBe(200);
    expect((await call(`/api/projects/${projectId}`, 'DELETE')).status).toBe(204);
  });

  it('returns known and indeterminate landed costs through the listings route', async () => {
    const knownListingId = '11111111-1111-4111-a111-111111111111';
    const unknownListingId = '22222222-2222-4222-a222-222222222222';
    const knownLandedCost = makeLandedCost('known', 29999, 1550, 31549);
    const unknownLandedCost = makeLandedCost('indeterminate', 10000, null, null);
    const rows = [
      listingRow(knownListingId, knownLandedCost),
      listingRow(unknownListingId, unknownLandedCost),
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/auth/v1/user'))
          return Response.json({ id: userId, email: 'owner@example.test' });
        if (url.includes('/rest/v1/profiles')) return new Response(null, { status: 201 });
        if (url.includes('/rest/v1/research_projects')) return Response.json([projectRow()]);
        if (url.includes('/rest/v1/research_project_listings'))
          return Response.json(rows.map(({ id }) => ({ listing_id: id })));
        if (url.includes('/rest/v1/listings')) return Response.json(rows);
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    const response = await call(`/api/projects/${projectId}/listings`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as Array<{
      id: string;
      landedCost: { status: string; totalMinor: number | null; missing: string[] };
    }>;
    expect(body).toHaveLength(2);
    expect(body[0].landedCost).toMatchObject({ status: 'known', totalMinor: 31549 });
    expect(body[1].landedCost).toMatchObject({
      status: 'indeterminate',
      totalMinor: null,
      missing: ['shipping'],
    });
  });

  it('lists and reviews only validated search observations through the authenticated route', async () => {
    const observationId = '44444444-4444-4444-a444-444444444444';
    const familyId = '55555555-5555-4555-a555-555555555555';
    let reviewBody: unknown;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/auth/v1/user'))
          return Response.json({ id: userId, email: 'owner@example.test' });
        if (url.includes('/rest/v1/profiles')) return new Response(null, { status: 201 });
        if (url.includes('/rest/v1/research_projects')) return Response.json([projectRow()]);
        if (url.includes('/rest/v1/search_term_observations') && init?.method === 'PATCH') {
          reviewBody = JSON.parse(String(init.body));
          return Response.json([
            {
              id: observationId,
              project_id: projectId,
              family_id: familyId,
              term: 'iphone usado',
              normalized_term: 'iphone usado',
              kind: 'learned',
              status: 'accepted',
              evidence: ['human-review'],
              source: 'deterministic-query-family',
              created_at: '2026-08-13T18:00:00.000Z',
            },
          ]);
        }
        if (url.includes('/rest/v1/search_term_observations'))
          return Response.json([
            {
              id: observationId,
              project_id: projectId,
              family_id: familyId,
              term: 'iphone usado',
              normalized_term: 'iphone usado',
              kind: 'learned',
              status: 'candidate',
              evidence: ['generated:query-family-rules.v1'],
              source: 'deterministic-query-family',
              created_at: '2026-08-13T18:00:00.000Z',
            },
          ]);
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    const listResponse = await call(`/api/projects/${projectId}/search-term-observations`);
    expect(listResponse.status).toBe(200);
    expect((await listResponse.json())[0].status).toBe('candidate');

    const reviewResponse = await call(
      `/api/projects/${projectId}/search-term-observations/${observationId}`,
      'PATCH',
      { status: 'accepted' },
    );
    expect(reviewResponse.status).toBe(200);
    expect((await reviewResponse.json()).status).toBe('accepted');
    expect(reviewBody).toEqual({ status: 'accepted' });

    const invalidResponse = await call(
      `/api/projects/${projectId}/search-term-observations/${observationId}`,
      'PATCH',
      { status: 'approved' },
    );
    expect(invalidResponse.status).toBe(422);
  });
});
