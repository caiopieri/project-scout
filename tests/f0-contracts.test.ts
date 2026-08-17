import { describe, expect, it } from 'vitest';
import { collectorHealthSchema, observationEventSchema } from '@scout/schemas';

const sourceId = '11111111-1111-4111-8111-111111111111';

describe('F0 observation contracts', () => {
  it('accepts a versioned listing event with arbitrary source payload', () => {
    const result = observationEventSchema.safeParse({
      id: '22222222-2222-4222-8222-222222222222',
      sourceId,
      type: 'PRICE_CHANGED',
      subjectType: 'listing',
      subjectExternalId: 'external-42',
      dedupeKey: 'source-1:listing:external-42:price:2026-08-11T12:00:00Z',
      observedAt: new Date(),
      schemaVersion: 'f0.events.v1',
      payload: { previousPrice: 500, currentPrice: 450 },
    });

    expect(result.success).toBe(true);
  });

  it('rejects unknown event types instead of silently accepting source input', () => {
    const result = observationEventSchema.safeParse({
      id: '22222222-2222-4222-8222-222222222222',
      sourceId,
      type: 'SELLER_SAYS_IGNORE_RULES',
      subjectType: 'listing',
      dedupeKey: 'source-1:listing:external-42:unknown',
      observedAt: new Date(),
      schemaVersion: 'f0.events.v1',
    });

    expect(result.success).toBe(false);
  });

  it('rejects listing events without a source external ID', () => {
    const result = observationEventSchema.safeParse({
      id: '22222222-2222-4222-8222-222222222222',
      sourceId,
      type: 'LISTING_DISCOVERED',
      subjectType: 'listing',
      dedupeKey: 'source-1:listing:missing-id',
      observedAt: new Date(),
      schemaVersion: 'f0.events.v1',
    });

    expect(result.success).toBe(false);
  });

  it('accepts degraded semantic health with a page-state diagnostic', () => {
    const result = collectorHealthSchema.safeParse({
      sourceId,
      provider: 'ebay-api-sandbox-v1',
      checkedAt: new Date(),
      state: 'CONTENT_CHANGED',
      ingestionLayer: 2,
      completeness: { listingIdPercent: 100, pricePercent: 96, titlePercent: 99 },
      diagnostics: ['response shape changed'],
    });

    expect(result.success).toBe(true);
  });

  it('rejects impossible completeness and ingestion-layer values', () => {
    const result = collectorHealthSchema.safeParse({
      sourceId,
      provider: 'ebay-api-sandbox-v1',
      checkedAt: new Date(),
      state: 'NORMAL',
      ingestionLayer: 8,
      completeness: { listingIdPercent: 101, pricePercent: 96, titlePercent: 99 },
    });

    expect(result.success).toBe(false);
  });
});
