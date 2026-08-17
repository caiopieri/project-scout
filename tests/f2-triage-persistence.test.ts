import { describe, expect, it } from 'vitest';
import { CollectionTriageService } from '@scout/search-intelligence';
import {
  listingTriageDecisionSchema,
  type ListingTriageDecision,
  type ListingTriageDecisionTransport,
  type ResearchCriteria,
  type RawListingRecord,
} from '@scout/schemas';

const criteria: ResearchCriteria = {
  category: 'smartphone',
  brands: ['Apple'],
  models: ['iPhone 13'],
  variants: [],
  storageGb: [128],
  memoryGb: [],
  acceptedDefects: ['cracked_screen'],
  rejectedDefects: ['activation_lock'],
  acceptedConditions: ['for_repair'],
  countries: ['BR'],
  regions: [],
  requiredFunctionalStates: [],
  preferredEvidence: [],
  additionalKeywords: [],
  excludedKeywords: ['icloud'],
};

const listing: RawListingRecord = {
  preview: {
    externalId: 'MLB123',
    url: 'https://produto.mercadolivre.com.br/MLB123',
    title: 'Apple iPhone 13 128GB com tela quebrada',
    price: { amountMinor: 145000, currency: 'BRL' },
  },
  payload: { description: 'Liga e aceita reparo da tela.' },
};

describe('F2 triage persistence boundary', () => {
  it('persists a deterministic decision after ingestion maps the listing id', async () => {
    const saved: ListingTriageDecision[] = [];
    const service = new CollectionTriageService({
      save: async (input) =>
        saved.push(listingTriageDecisionSchema.parse({ ...input, createdAt: new Date() })),
    });

    await service.process({
      projectId: '11111111-1111-4111-a111-111111111111',
      sourceId: '22222222-2222-4222-a222-222222222222',
      criteria,
      result: { items: [listing], pagesFetched: 1, provider: 'fixture' },
      persistence: {
        itemsCreated: 1,
        itemsUpdated: 0,
        listingIds: ['33333333-3333-4333-a333-333333333333'],
        listingIdsByExternalId: { MLB123: '33333333-3333-4333-a333-333333333333' },
      },
    });

    expect(saved[0]).toMatchObject({
      listingId: '33333333-3333-4333-a333-333333333333',
      filter: { decision: 'KEEP' },
      identity: { status: 'MATCHED', mergeEligible: false },
      investigation: { state: 'DISCOVERED', requiresHumanReview: false },
    });
  });

  it('does not write a decision when ingestion has no listing mapping', async () => {
    const save = async () => {
      throw new Error('must not be called');
    };
    const service = new CollectionTriageService({ save });

    await expect(
      service.process({
        projectId: '11111111-1111-4111-a111-111111111111',
        sourceId: '22222222-2222-4222-a222-222222222222',
        criteria,
        result: { items: [listing], pagesFetched: 1, provider: 'fixture' },
        persistence: {
          itemsCreated: 0,
          itemsUpdated: 0,
          listingIds: [],
          listingIdsByExternalId: {},
        },
      }),
    ).resolves.toBeUndefined();
  });

  it('persists only reviewable cross-source candidates against prior decisions', async () => {
    const previous: ListingTriageDecisionTransport = {
      id: '66666666-6666-4666-a666-666666666666',
      projectId: '11111111-1111-4111-a111-111111111111',
      sourceId: '44444444-4444-4444-a444-444444444444',
      listingId: '55555555-5555-4555-a555-555555555555',
      filter: { decision: 'KEEP', reasons: [] },
      identity: {
        canonicalKey: 'apple|iphone 13|128gb',
        status: 'MATCHED',
        confidence: 0.95,
        evidence: ['structured'],
        attributes: {
          brand: 'Apple',
          model: 'Apple iPhone 13',
          variant: 'A2633',
          storageGb: 128,
          memoryGb: 4,
        },
        media: { imageCount: 1, primaryImagePresent: true },
        mergeEligible: false,
      },
      investigation: {
        state: 'DISCOVERED',
        confidence: 0.9,
        reasons: [],
        requiresHumanReview: false,
      },
      decisionVersion: 'triage-rules.v1',
      createdAt: '2026-08-14T10:00:00.000Z',
    };
    const candidates: Array<{ projectId: string; decision: unknown }> = [];
    const service = new CollectionTriageService(
      {
        save: async () => undefined,
        findByProjectId: async () => [previous],
      },
      undefined,
      undefined,
      undefined,
      { saveCandidate: async (input) => candidates.push(input) } as never,
    );

    await service.process({
      projectId: previous.projectId,
      sourceId: '22222222-2222-4222-a222-222222222222',
      criteria,
      result: { items: [listing], pagesFetched: 1, provider: 'fixture' },
      persistence: {
        itemsCreated: 1,
        itemsUpdated: 0,
        listingIds: ['33333333-3333-4333-a333-333333333333'],
        listingIdsByExternalId: { MLB123: '33333333-3333-4333-a333-333333333333' },
      },
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      projectId: previous.projectId,
      decision: { relation: 'REVIEW', mergeEligible: false },
    });
  });
});
