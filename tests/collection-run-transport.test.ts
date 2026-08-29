import { describe, expect, it } from 'vitest';
import { collectionRunTransportSchema, opportunityValuationTransportSchema } from '@scout/schemas';

describe('collection run transport contract', () => {
  it('coerces API ISO date strings into dates for the web client', () => {
    const run = collectionRunTransportSchema.parse({
      id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      projectId: 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb',
      sourceId: 'cccccccc-cccc-4ccc-accc-cccccccccccc',
      status: 'pending',
      idempotencyKey: 'mvp-test-001',
      queuedAt: '2026-08-13T12:00:00.000Z',
      attemptCount: 0,
      itemsFound: 0,
      itemsCreated: 0,
      itemsUpdated: 0,
      estimatedCost: 0,
      provider: 'ebay-api-production-v1',
    });

    expect(run.queuedAt).toBeInstanceOf(Date);
  });
});

describe('opportunity valuation transport contract', () => {
  it('coerces the persisted creation date for the web client', () => {
    const valuation = opportunityValuationTransportSchema.parse({
      id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      listingId: 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb',
      valuationVersion: 'valuation-rules.v1',
      estimatedMarketPriceMinor: 150000,
      maxPurchasePriceMinor: 90000,
      comparablesUsed: 3,
      outliersRemoved: 0,
      scores: {
        dealScore: 40,
        trendScore: 50,
        liquidityScore: 45,
        sellerPressureScore: 50,
        riskConfidenceScore: 70,
      },
      confidence: 0.7,
      evidence: ['comparables:3'],
      missing: ['longitudinal price history'],
      explanation: 'Deterministic valuation.',
      createdAt: '2026-08-13T12:00:00.000Z',
    });

    expect(valuation.createdAt).toBeInstanceOf(Date);
  });
});
