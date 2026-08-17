import { describe, expect, it } from 'vitest';
import { DeterministicAuctionLotEvaluator } from '@scout/valuation';

const lot = {
  externalId: 'lot-42',
  source: 'auction-fixture',
  title: 'Lote de notebooks corporativos',
  category: 'electronics' as const,
  quantity: 10,
  askingPriceMinor: 500000,
  currency: 'BRL' as const,
  condition: 'used' as const,
  location: 'São Paulo',
  evidence: [
    {
      source: 'market-a',
      priceMinor: 100000,
      currency: 'BRL' as const,
      note: 'Comparable A',
      version: 'market-v1',
    },
    {
      source: 'market-b',
      priceMinor: 110000,
      currency: 'BRL' as const,
      note: 'Comparable B',
      version: 'market-v1',
    },
    {
      source: 'market-c',
      priceMinor: 105000,
      currency: 'BRL' as const,
      note: 'Comparable C',
      version: 'market-v1',
    },
  ],
};

const policy = {
  shippingMinor: 20000,
  buyerFeesMinor: 25000,
  taxesMinor: 30000,
  processingMinor: 40000,
  repairReserveMinor: 50000,
  minimumMarginMinor: 100000,
};

describe('F5.1 deterministic auction lot dossier', () => {
  const evaluator = new DeterministicAuctionLotEvaluator();

  it('calculates total/unit cost and shortlist without executing a bid', () => {
    const dossier = evaluator.evaluate(lot, policy);
    expect(dossier).toMatchObject({
      totalCostMinor: 665000,
      unitCostMinor: 66500,
      estimatedMarketUnitPriceMinor: 105000,
      estimatedRevenueMinor: 1050000,
      maxRecommendedPurchaseMinor: 785000,
      estimatedMarginMinor: 385000,
      recommendation: 'SHORTLIST',
      risk: 'LOW',
    });
  });

  it('requires market evidence and condition before shortlist', () => {
    const dossier = evaluator.evaluate({ ...lot, condition: undefined, evidence: [] }, policy);
    expect(dossier.recommendation).toBe('REVIEW');
    expect(dossier.risk).toBe('HIGH');
    expect(dossier.flags).toEqual(
      expect.arrayContaining(['MISSING_MARKET_EVIDENCE', 'MISSING_CONDITION']),
    );
  });

  it('avoids a lot whose total margin misses policy', () => {
    const dossier = evaluator.evaluate({ ...lot, askingPriceMinor: 900000 }, policy);
    expect(dossier.recommendation).toBe('AVOID');
    expect(dossier.flags).toContain('MARGIN_BELOW_TARGET');
    expect(dossier.flags).toContain('ASKING_PRICE_ABOVE_LIMIT');
  });

  it('rejects unsafe or unknown external fields', () => {
    expect(() => evaluator.evaluate({ ...lot, bid: true }, policy)).toThrow();
    expect(() => evaluator.evaluate({ ...lot, secret: 'token' }, policy)).toThrow();
    expect(() => evaluator.evaluate({ ...lot, category: 'vehicles' }, policy)).toThrow();
    expect(() => evaluator.evaluate({ ...lot, command: 'bid' }, policy)).toThrow();
    expect(() =>
      evaluator.evaluate({ ...lot, quantity: Number.MAX_SAFE_INTEGER + 1 }, policy),
    ).toThrow();
  });

  it('keeps incomplete quantity and costs visible as uncertainty', () => {
    const dossier = evaluator.evaluate({ ...lot, quantity: undefined }, { shippingMinor: 20000 });

    expect(dossier.flags).toEqual(
      expect.arrayContaining(['MISSING_QUANTITY', 'MISSING_COST_POLICY']),
    );
    expect(dossier.recommendation).toBe('REVIEW');
    expect(dossier.risk).toBe('MEDIUM');
  });
});
