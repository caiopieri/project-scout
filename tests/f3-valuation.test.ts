import { describe, expect, it } from 'vitest';
import { DeterministicValuationEngine } from '@scout/valuation';
import type { ValuationInput } from '@scout/valuation';

const baseInput: ValuationInput = {
  targetPriceMinor: 80000,
  currency: 'BRL',
  comparables: [
    {
      listingId: 'a',
      priceMinor: 150000,
      currency: 'BRL',
      condition: 'used',
      observedAt: '2026-08-01T00:00:00.000Z',
      daysToSell: 10,
    },
    {
      listingId: 'b',
      priceMinor: 160000,
      currency: 'BRL',
      condition: 'used',
      observedAt: '2026-08-02T00:00:00.000Z',
      daysToSell: 12,
    },
    {
      listingId: 'c',
      priceMinor: 155000,
      currency: 'BRL',
      condition: 'used',
      observedAt: '2026-08-03T00:00:00.000Z',
      daysToSell: 8,
    },
    {
      listingId: 'outlier',
      priceMinor: 900000,
      currency: 'BRL',
      condition: 'used',
      observedAt: '2026-08-04T00:00:00.000Z',
      daysToSell: 90,
    },
  ],
  historicalPrices: [
    { priceMinor: 140000, observedAt: '2026-07-01T00:00:00.000Z' },
    { priceMinor: 155000, observedAt: '2026-08-01T00:00:00.000Z' },
  ],
  sellerSignals: { priceDropCount: 2, daysActive: 30, inventoryCount: 20 },
  policy: {
    processingCostMinor: 10000,
    desiredMarginMinor: 30000,
    repairReserveMinor: 5000,
    transactionCostRate: 0.1,
  },
};

describe('F3 deterministic valuation engine', () => {
  it('removes an outlier and calculates market price, max purchase and scores', () => {
    const output = new DeterministicValuationEngine().evaluate(baseInput);

    expect(output).toMatchObject({
      estimatedMarketPriceMinor: 155000,
      maxPurchasePriceMinor: 94500,
      comparablesUsed: 3,
      outliersRemoved: 1,
    });
    expect(output.scores.dealScore).toBeGreaterThan(40);
    expect(output.scores.liquidityScore).toBeGreaterThan(70);
    expect(output.scores.sellerPressureScore).toBeGreaterThan(50);
    expect(output.valuationVersion).toBe('valuation-rules.v1');
  });

  it('uses same-condition comparables before considering other conditions', () => {
    const output = new DeterministicValuationEngine().evaluate({
      ...baseInput,
      targetCondition: 'Used',
      comparables: [
        ...baseInput.comparables,
        {
          listingId: 'parts-only',
          priceMinor: 500000,
          currency: 'BRL',
          condition: 'parts_only',
          observedAt: '2026-08-05T00:00:00.000Z',
          daysToSell: 2,
        },
      ],
    });

    expect(output.estimatedMarketPriceMinor).toBe(155000);
    expect(output.comparablesUsed).toBe(3);
    expect(output.evidence).toContain('condition_match:4');
    expect(output.missing).not.toContain('comparables matching target condition');
  });

  it('falls back explicitly when no comparable matches the target condition', () => {
    const output = new DeterministicValuationEngine().evaluate({
      ...baseInput,
      targetCondition: 'refurbished',
      comparables: baseInput.comparables.map((comparable) => ({
        ...comparable,
        condition: 'parts_only',
      })),
    });

    expect(output.comparablesUsed).toBe(3);
    expect(output.missing).toContain('comparables matching target condition');
    expect(output.evidence).toContain('comparables:4');
  });

  it('remains explicit about missing evidence instead of faking confidence', () => {
    const output = new DeterministicValuationEngine().evaluate({
      ...baseInput,
      comparables: [],
      historicalPrices: [],
      sellerSignals: undefined,
    });

    expect(output.estimatedMarketPriceMinor).toBe(baseInput.targetPriceMinor);
    expect(output.confidence).toBeLessThan(0.5);
    expect(output.missing).toEqual([
      'comparables in the same currency',
      'longitudinal price history',
      'days-to-sell observations',
      'seller pressure signals',
      'listing lifecycle observations',
    ]);
  });

  it('penalizes confidence without changing market price when lifecycle evidence is unstable', () => {
    const stable = new DeterministicValuationEngine().evaluate({
      ...baseInput,
      observationSignals: {},
    });
    const unstable = new DeterministicValuationEngine().evaluate({
      ...baseInput,
      observationSignals: { removedCount: 2, reappearedCount: 1, descriptionChangedCount: 2 },
    });

    expect(unstable.estimatedMarketPriceMinor).toBe(stable.estimatedMarketPriceMinor);
    expect(unstable.confidence).toBeLessThan(stable.confidence);
    expect(unstable.evidence).toContain(
      'listing_lifecycle:removed=2,reappeared=1,description_changed=2',
    );
  });

  it('adjusts comparables by ranked version, location, shipping and lot quantity', () => {
    const output = new DeterministicValuationEngine().evaluate({
      ...baseInput,
      targetMarketContext: {
        productVersion: 'Gen 2',
        versionRank: 2,
        location: 'São Paulo, SP',
      },
      comparables: [
        {
          listingId: 'lot',
          priceMinor: 180000,
          currency: 'BRL',
          condition: 'used',
          observedAt: '2026-08-05T00:00:00.000Z',
          marketContext: {
            productVersion: 'Gen 1',
            versionRank: 0,
            location: 'Curitiba, PR',
            shippingCostMinor: 10000,
            quantity: 2,
          },
        },
      ],
    });

    expect(output.estimatedMarketPriceMinor).toBe(99275);
    expect(output.evidence).toEqual(
      expect.arrayContaining([
        'version_adjustments:1',
        'location_adjustments:1',
        'shipping_adjustments:1',
        'quantity_adjustments:1',
      ]),
    );
  });

  it('rejects unsafe market context instead of guessing an adjustment', () => {
    expect(() =>
      new DeterministicValuationEngine().evaluate({
        ...baseInput,
        targetMarketContext: { quantity: 0 },
      }),
    ).toThrow();
  });
});
