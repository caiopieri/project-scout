import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseRestSearchQueryFamilyRepository } from '@scout/database/search-intelligence';
import {
  CollectionQueryFamilyProvider,
  DeterministicQueryFamilyGenerator,
} from '@scout/search-intelligence';
import type { ResearchCriteria } from '@scout/schemas';

const criteria: ResearchCriteria = {
  category: 'smartphone',
  brands: ['Apple'],
  models: ['iPhone 13'],
  variants: [],
  storageGb: [128],
  memoryGb: [],
  maximumPrice: { amountMinor: 180000, currency: 'BRL' },
  acceptedDefects: [],
  rejectedDefects: [],
  acceptedConditions: [],
  countries: ['BR'],
  regions: [],
  requiredFunctionalStates: [],
  preferredEvidence: [],
  additionalKeywords: [],
  excludedKeywords: [],
};

afterEach(() => vi.unstubAllGlobals());

describe('F2 query family persistence boundary', () => {
  it('loads only accepted observations and persists a family idempotently', async () => {
    const requests: Array<{ url: string; method: string | undefined; prefer: string | null }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        requests.push({
          url: String(input),
          method: init?.method,
          prefer: new Headers(init?.headers).get('Prefer'),
        });
        if (String(input).includes('search_term_observations?project_id=')) {
          return Response.json([
            {
              term: 'iphone usado',
              normalized_term: 'iphone usado',
              kind: 'learned',
              status: 'accepted',
              evidence: ['review-1'],
              source: 'human-review',
            },
          ]);
        }
        if (String(input).includes('search_query_families'))
          return Response.json([{ id: '99999999-9999-4999-a999-999999999999' }]);
        return new Response(null, { status: 201 });
      }),
    );

    const repository = new SupabaseRestSearchQueryFamilyRepository({
      baseUrl: 'http://supabase.local',
      anonKey: 'service',
      accessToken: 'service',
    });
    const provider = new CollectionQueryFamilyProvider(
      repository,
      new DeterministicQueryFamilyGenerator(),
    );
    const family = await provider.getFamily({
      projectId: '11111111-1111-4111-a111-111111111111',
      criteria,
    });
    await repository.saveFamily({
      projectId: '11111111-1111-4111-a111-111111111111',
      sourceId: '22222222-2222-4222-a222-222222222222',
      collectionRunId: '33333333-3333-4333-a333-333333333333',
      family,
    });

    expect(family.queries).toContainEqual(
      expect.objectContaining({ query: 'iphone usado', kind: 'learned' }),
    );
    expect(requests.map(({ method }) => method)).toEqual([undefined, 'POST', 'POST']);
    expect(requests[1]?.prefer).toContain('resolution=merge-duplicates');
    expect(requests[2]?.prefer).toContain('resolution=ignore-duplicates');
  });

  it('fails closed when the family insert does not return an id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json([])),
    );
    const repository = new SupabaseRestSearchQueryFamilyRepository({
      baseUrl: 'http://supabase.local',
      anonKey: 'service',
      accessToken: 'service',
    });

    await expect(
      repository.saveFamily({
        projectId: '11111111-1111-4111-a111-111111111111',
        sourceId: '22222222-2222-4222-a222-222222222222',
        collectionRunId: '33333333-3333-4333-a333-333333333333',
        family: new DeterministicQueryFamilyGenerator().generate(criteria),
      }),
    ).rejects.toThrow('returned no id');
  });

  it('maps owner-visible observations and sends only the review status on update', async () => {
    const requests: Array<{ url: string; method: string | undefined; body: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        requests.push({
          url: String(input),
          method: init?.method,
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        return Response.json([
          {
            id: '44444444-4444-4444-a444-444444444444',
            project_id: '11111111-1111-4111-a111-111111111111',
            family_id: '55555555-5555-4555-a555-555555555555',
            term: 'iphone usado',
            normalized_term: 'iphone usado',
            kind: 'learned',
            status: 'accepted',
            evidence: ['human-review'],
            source: 'deterministic-query-family',
            created_at: '2026-08-13T18:00:00.000Z',
          },
        ]);
      }),
    );
    const repository = new SupabaseRestSearchQueryFamilyRepository({
      baseUrl: 'http://supabase.local',
      anonKey: 'anon',
      accessToken: 'user-jwt',
    });

    const visible = await repository.findByProjectId('11111111-1111-4111-a111-111111111111');
    const reviewed = await repository.review({
      projectId: '11111111-1111-4111-a111-111111111111',
      observationId: '44444444-4444-4444-a444-444444444444',
      status: 'accepted',
    });

    expect(visible[0]?.projectId).toBe('11111111-1111-4111-a111-111111111111');
    expect(reviewed.status).toBe('accepted');
    expect(requests[1]).toMatchObject({ method: 'PATCH', body: { status: 'accepted' } });
  });
});
