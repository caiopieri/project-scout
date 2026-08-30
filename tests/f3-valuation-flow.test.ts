import { describe, expect, it } from 'vitest';
import {
  calculateUsToUsLandedCost,
  type OpportunityValuation,
  type OpportunityValuationRepository,
} from '@scout/domain';
import { CollectionOpportunityValuationProcessor } from '@scout/valuation';
import { rawListingRecordSchema, type CollectionResult } from '@scout/schemas';

const record = (externalId: string, amountMinor: number, condition?: string) =>
  rawListingRecordSchema.parse({
    preview: {
      externalId,
      url: `https://market.example/${externalId}`,
      title: `Laptop ${externalId}`,
      price: { amountMinor, currency: 'BRL' },
    },
    payload: { fixture: true, ...(condition ? { condition } : {}) },
  });

class MemoryValuationRepository implements OpportunityValuationRepository {
  readonly values: OpportunityValuation[] = [];

  async save(input: Omit<OpportunityValuation, 'id' | 'createdAt'>) {
    const value = {
      ...input,
      id: `00000000-0000-4000-a000-00000000000${this.values.length + 1}`,
      createdAt: new Date(),
    };
    this.values.push(value);
    return value;
  }

  async findLatestByListingId(listingId: string) {
    return this.values.find((value) => value.listingId === listingId) ?? null;
  }
}

describe('F3 collection opportunity flow', () => {
  it('derives and persists one valuation per normalized listing', async () => {
    const result: CollectionResult = {
      items: [record('a', 80000), record('b', 120000)],
      pagesFetched: 1,
      provider: 'fixture',
    };
    const repository = new MemoryValuationRepository();
    await new CollectionOpportunityValuationProcessor(
      repository,
      undefined,
      () => new Date('2026-08-13T12:00:00.000Z'),
    ).evaluate({
      sourceId: '00000000-0000-4000-a000-000000000001',
      result,
      persistence: {
        itemsCreated: 2,
        itemsUpdated: 0,
        listingIds: [
          '11111111-1111-4111-a111-111111111111',
          '22222222-2222-4222-a222-222222222222',
        ],
        listingIdsByExternalId: {
          a: '11111111-1111-4111-a111-111111111111',
          b: '22222222-2222-4222-a222-222222222222',
        },
      },
      policy: {
        processingCostMinor: 5000,
        desiredMarginMinor: 20000,
        repairReserveMinor: 1000,
        transactionCostRate: 0.1,
      },
    });

    expect(repository.values).toHaveLength(2);
    expect(repository.values[0]).toMatchObject({
      listingId: '11111111-1111-4111-a111-111111111111',
      estimatedMarketPriceMinor: 120000,
      maxPurchasePriceMinor: 82000,
    });
    expect(repository.values[0].missing).toContain('longitudinal price history');
  });

  it('does not persist valuation for a listing with indeterminate landed cost', async () => {
    const result: CollectionResult = {
      items: [record('a', 80000)],
      pagesFetched: 1,
      provider: 'fixture',
    };
    const repository = new MemoryValuationRepository();
    const listingRepository = {
      findById: async () => ({
        rawDataMetadata: { shippingCostKnown: false },
        landedCost: calculateUsToUsLandedCost({
          itemPriceMinor: 80000,
          shippingCostMinor: null,
          currency: 'BRL',
        }),
      }),
      getPriceHistory: async () => [],
    };
    await new CollectionOpportunityValuationProcessor(
      repository,
      undefined,
      undefined,
      listingRepository,
    ).evaluate({
      sourceId: '00000000-0000-4000-a000-000000000001',
      result,
      persistence: {
        itemsCreated: 1,
        itemsUpdated: 0,
        listingIds: ['11111111-1111-4111-a111-111111111111'],
        listingIdsByExternalId: { a: '11111111-1111-4111-a111-111111111111' },
      },
      policy: {
        processingCostMinor: 5000,
        desiredMarginMinor: 20000,
        repairReserveMinor: 1000,
        transactionCostRate: 0.1,
      },
    });

    expect(repository.values).toHaveLength(0);
  });

  it('passes listing condition into valuation instead of mixing incompatible comparables', async () => {
    const result: CollectionResult = {
      items: [
        record('target', 80000, 'used'),
        record('used-comparable', 120000, 'used'),
        record('parts-comparable', 500000, 'parts_only'),
      ],
      pagesFetched: 1,
      provider: 'fixture',
    };
    const repository = new MemoryValuationRepository();

    await new CollectionOpportunityValuationProcessor(repository).evaluate({
      sourceId: '00000000-0000-4000-a000-000000000001',
      result,
      persistence: {
        itemsCreated: 3,
        itemsUpdated: 0,
        listingIds: [
          '11111111-1111-4111-a111-111111111111',
          '22222222-2222-4222-a222-222222222222',
          '33333333-3333-4333-a333-333333333333',
        ],
        listingIdsByExternalId: {
          target: '11111111-1111-4111-a111-111111111111',
          'used-comparable': '22222222-2222-4222-a222-222222222222',
          'parts-comparable': '33333333-3333-4333-a333-333333333333',
        },
      },
      policy: {
        processingCostMinor: 5000,
        desiredMarginMinor: 20000,
        repairReserveMinor: 1000,
        transactionCostRate: 0.1,
      },
    });

    expect(repository.values[0]).toMatchObject({
      estimatedMarketPriceMinor: 120000,
      comparablesUsed: 1,
    });
    expect(repository.values[0].evidence).toContain('condition_match:1');
  });

  it('loads persisted price history per listing and converts database units to valuation units', async () => {
    const result: CollectionResult = {
      items: [record('a', 80000), record('b', 120000)],
      pagesFetched: 1,
      provider: 'fixture',
    };
    const repository = new MemoryValuationRepository();
    const historyByListing = new Map([
      [
        '11111111-1111-4111-a111-111111111111',
        [
          {
            id: '44444444-4444-4444-a444-444444444444',
            listingId: '11111111-1111-4111-a111-111111111111',
            price: 1000,
            shippingCost: 0,
            status: 'active' as const,
            collectedAt: new Date('2026-07-01T00:00:00.000Z'),
          },
          {
            id: '55555555-5555-4555-a555-555555555555',
            listingId: '11111111-1111-4111-a111-111111111111',
            price: 1200,
            shippingCost: 0,
            status: 'active' as const,
            collectedAt: new Date('2026-08-01T00:00:00.000Z'),
          },
        ],
      ],
    ]);

    await new CollectionOpportunityValuationProcessor(repository, undefined, undefined, {
      getPriceHistory: async (listingId) => historyByListing.get(listingId) ?? [],
    }).evaluate({
      sourceId: '00000000-0000-4000-a000-000000000001',
      result,
      persistence: {
        itemsCreated: 2,
        itemsUpdated: 0,
        listingIds: [
          '11111111-1111-4111-a111-111111111111',
          '22222222-2222-4222-a222-222222222222',
        ],
        listingIdsByExternalId: {
          a: '11111111-1111-4111-a111-111111111111',
          b: '22222222-2222-4222-a222-222222222222',
        },
      },
      policy: {
        processingCostMinor: 5000,
        desiredMarginMinor: 20000,
        repairReserveMinor: 1000,
        transactionCostRate: 0.1,
      },
    });

    expect(repository.values[0].evidence).toContain('history_points:2');
    expect(repository.values[0].scores.trendScore).toBe(90);
    expect(repository.values[1].missing).toContain('longitudinal price history');
  });

  it('counts persisted lifecycle events and lowers confidence for unstable listings', async () => {
    const result: CollectionResult = {
      items: [record('a', 80000), record('b', 120000)],
      pagesFetched: 1,
      provider: 'fixture',
    };
    const repository = new MemoryValuationRepository();
    const lifecycleEvents = [
      {
        id: '44444444-4444-4444-a444-444444444444',
        sourceId: '00000000-0000-4000-a000-000000000001',
        type: 'REMOVED' as const,
        subjectType: 'listing' as const,
        subjectExternalId: 'a',
        dedupeKey: 'removed-a',
        observedAt: new Date('2026-08-01T00:00:00.000Z'),
        schemaVersion: 'f0.events.v1',
        payload: {},
      },
      {
        id: '55555555-5555-4555-a555-555555555555',
        sourceId: '00000000-0000-4000-a000-000000000001',
        type: 'REAPPEARED' as const,
        subjectType: 'listing' as const,
        subjectExternalId: 'a',
        dedupeKey: 'reappeared-a',
        observedAt: new Date('2026-08-02T00:00:00.000Z'),
        schemaVersion: 'f0.events.v1',
        payload: {},
      },
      {
        id: '66666666-6666-4666-a666-666666666666',
        sourceId: '00000000-0000-4000-a000-000000000001',
        type: 'DESCRIPTION_CHANGED' as const,
        subjectType: 'listing' as const,
        subjectExternalId: 'a',
        dedupeKey: 'description-a',
        observedAt: new Date('2026-08-03T00:00:00.000Z'),
        schemaVersion: 'f0.events.v1',
        payload: {},
      },
    ];
    const stableRepository = { findByListing: async () => [] };
    const unstableRepository = {
      findByListing: async (_sourceId: string, externalId: string) =>
        externalId === 'a' ? lifecycleEvents : [],
    };

    await new CollectionOpportunityValuationProcessor(
      repository,
      undefined,
      undefined,
      undefined,
      unstableRepository,
    ).evaluate({
      sourceId: '00000000-0000-4000-a000-000000000001',
      result,
      persistence: {
        itemsCreated: 2,
        itemsUpdated: 0,
        listingIds: [
          '11111111-1111-4111-a111-111111111111',
          '22222222-2222-4222-a222-222222222222',
        ],
        listingIdsByExternalId: {
          a: '11111111-1111-4111-a111-111111111111',
          b: '22222222-2222-4222-a222-222222222222',
        },
      },
      policy: {
        processingCostMinor: 5000,
        desiredMarginMinor: 20000,
        repairReserveMinor: 1000,
        transactionCostRate: 0.1,
      },
    });

    const stableOutput = new CollectionOpportunityValuationProcessor(
      new MemoryValuationRepository(),
      undefined,
      undefined,
      undefined,
      stableRepository,
    );
    await stableOutput.evaluate({
      sourceId: '00000000-0000-4000-a000-000000000001',
      result,
      persistence: {
        itemsCreated: 2,
        itemsUpdated: 0,
        listingIds: [
          '11111111-1111-4111-a111-111111111111',
          '22222222-2222-4222-a222-222222222222',
        ],
        listingIdsByExternalId: {
          a: '11111111-1111-4111-a111-111111111111',
          b: '22222222-2222-4222-a222-222222222222',
        },
      },
      policy: {
        processingCostMinor: 5000,
        desiredMarginMinor: 20000,
        repairReserveMinor: 1000,
        transactionCostRate: 0.1,
      },
    });

    expect(repository.values[0].evidence).toContain(
      'listing_lifecycle:removed=1,reappeared=1,description_changed=1',
    );
    expect(repository.values[0].confidence).toBeLessThan(0.7);
    expect(repository.values[1].missing).toContain('listing lifecycle observations');
  });
});
