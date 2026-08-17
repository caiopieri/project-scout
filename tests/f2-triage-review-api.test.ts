import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../apps/worker/src/index';

const userId = '11111111-1111-4111-a111-111111111111';
const projectId = '33333333-3333-4333-a333-333333333333';
const listingId = '22222222-2222-4222-a222-222222222222';
const decisionId = '44444444-4444-4444-a444-444444444444';
const reviewId = '55555555-5555-4555-a555-555555555555';
const now = '2026-08-13T19:00:00.000Z';

const project = {
  id: projectId,
  user_id: userId,
  name: 'triage test',
  description: null,
  category: 'smartphone',
  natural_language_query: 'iPhone 13 usado',
  structured_query: {
    category: 'smartphone',
    brands: ['Apple'],
    models: ['iPhone 13'],
    variants: [],
    storageGb: [],
    memoryGb: [],
    maximumPrice: { amountMinor: 180000, currency: 'BRL' },
    acceptedDefects: [],
    rejectedDefects: [],
    acceptedConditions: [],
    countries: [],
    regions: [],
    requiredFunctionalStates: [],
    preferredEvidence: [],
    additionalKeywords: [],
    excludedKeywords: [],
  },
  status: 'active',
  taxonomy_version: '1.0.0',
  interpreter_provider: 'deterministic',
  interpreter_model: 'rules',
  interpreter_version: '1.0.0',
  interpreted_at: now,
  interpretation_confidence: 0.9,
  interpretation_ambiguities: [],
  interpretation_warnings: [],
  unidentified_fields: [],
  deleted_at: null,
  created_at: now,
  updated_at: now,
};

const decision = {
  id: decisionId,
  project_id: projectId,
  source_id: '00000000-0000-4000-a000-000000000001',
  listing_id: listingId,
  filter_decision: 'REVIEW',
  filter_reasons: ['PRICE_BAIT_SIGNAL'],
  identity: { status: 'MATCHED', confidence: 0.8, evidence: ['title'], mergeEligible: false },
  investigation: {
    state: 'NEEDS_HUMAN_REVIEW',
    confidence: 0.7,
    reasons: ['price bait'],
    requiresHumanReview: true,
  },
  decision_version: 'triage-rules.v1',
  created_at: now,
};

const review = {
  id: reviewId,
  project_id: projectId,
  listing_id: listingId,
  status: 'accepted',
  reviewed_at: now,
};
const candidateId = '77777777-7777-4777-a777-777777777777';
const candidate = {
  id: candidateId,
  project_id: projectId,
  left_source_id: '00000000-0000-4000-a000-000000000001',
  left_listing_id: listingId,
  right_source_id: '00000000-0000-4000-a000-000000000002',
  right_listing_id: '88888888-8888-4888-a888-888888888888',
  relation: 'REVIEW',
  confidence: 0.78,
  evidence: ['canonical-key-equal'],
  merge_eligible: false,
  review_status: 'pending',
  reviewed_at: null,
  created_at: now,
};

const env = {
  SUPABASE_URL: 'http://supabase.local',
  SUPABASE_ANON_KEY: 'anon',
  WEB_ORIGIN: 'http://localhost:3000',
} as never;

async function call(path: string, method = 'GET', body?: unknown) {
  return worker.fetch(
    new Request(`http://worker.local${path}`, {
      method,
      headers: { Authorization: 'Bearer valid-user-jwt', 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }),
    env,
    {} as never,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('F2 triage human review API', () => {
  it('reads deterministic decisions and owner reviews, then updates only the review status', async () => {
    const requests: Array<{ url: string; method?: string; body?: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        requests.push({
          url,
          method: init?.method,
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        if (url.endsWith('/auth/v1/user'))
          return Response.json({ id: userId, email: 'owner@example.test' });
        if (url.includes('/rest/v1/profiles')) return new Response(null, { status: 201 });
        if (url.includes('/rest/v1/research_projects')) return Response.json([project]);
        if (url.includes('/rest/v1/listing_triage_decisions')) return Response.json([decision]);
        if (url.includes('/rest/v1/rpc/review_listing_triage') && init?.method === 'POST')
          return Response.json([review]);
        if (url.includes('/rest/v1/listing_triage_reviews')) return Response.json([review]);
        if (url.includes('/rest/v1/cross_source_identity_candidates'))
          return Response.json([candidate]);
        if (url.includes('/rest/v1/rpc/review_cross_source_identity_candidate'))
          return Response.json([{ ...candidate, review_status: 'accepted', reviewed_at: now }]);
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    expect((await call(`/api/projects/${projectId}/triage-decisions`)).status).toBe(200);
    expect((await call(`/api/projects/${projectId}/triage-reviews`)).status).toBe(200);
    expect((await call(`/api/projects/${projectId}/cross-source-candidates`)).status).toBe(200);
    const response = await call(`/api/projects/${projectId}/triage-reviews/${listingId}`, 'PATCH', {
      status: 'accepted',
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ listingId, status: 'accepted' });
    const candidateResponse = await call(
      `/api/projects/${projectId}/cross-source-candidates/${candidateId}`,
      'PATCH',
      { status: 'accepted' },
    );
    expect(candidateResponse.status).toBe(200);
    expect(await candidateResponse.json()).toMatchObject({
      id: candidateId,
      reviewStatus: 'accepted',
    });
    const write = requests.find(
      (request) => request.url.includes('/rpc/review_listing_triage') && request.method === 'POST',
    );
    expect(write?.body).toEqual({
      p_project_id: projectId,
      p_listing_id: listingId,
      p_status: 'accepted',
    });
    expect(
      requests.find(
        (request) =>
          request.url.includes('/rpc/review_cross_source_identity_candidate') &&
          request.method === 'POST',
      )?.body,
    ).toEqual({
      p_project_id: projectId,
      p_candidate_id: candidateId,
      p_status: 'accepted',
    });
  });

  it('rejects an invalid review status before reaching PostgREST', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/auth/v1/user'))
        return Response.json({ id: userId, email: 'owner@example.test' });
      if (url.includes('/rest/v1/profiles')) return new Response(null, { status: 201 });
      if (url.includes('/rest/v1/research_projects')) return Response.json([project]);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await call(`/api/projects/${projectId}/triage-reviews/${listingId}`, 'PATCH', {
      status: 'forged',
    });
    expect(response.status).toBe(422);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
