import { describe, expect, it } from 'vitest';
import {
  calculateReferenceDiscount,
  calculateUsToUsLandedCost,
} from '@scout/domain';
import { marketMetricsSchema } from '@scout/schemas';

const policy = {
  version: 'reference-discount.us-us.v1' as const,
  windowDays: 30 as const,
  minimumObservations: 10 as const,
  iqrMultiplier: 1.5 as const,
  referenceTreatment: 'leave_one_listing_out' as const,
};
const product = {
  brand: 'Apple',
  model: 'iPhone 13',
  variant: '128GB',
  confidence: 1,
  evidenceIds: [],
};
const market = (
  status: 'known' | 'AMOSTRA_INSUFICIENTE' = 'known',
  currency = 'USD',
  windowDays = 30,
) =>
  marketMetricsSchema.parse({
    windowDays,
    minimumObservations: 10,
    iqrMultiplier: 1.5,
    segments: [{
      product: { brand: 'Apple', model: 'iPhone 13', variant: '128GB' },
      condition: 'Used', currency, windowDays, nRaw: status === 'known' ? 10 : 9,
      nTrimmed: status === 'known' ? 10 : 9, nDiscarded: 0, status,
      medianMinor: status === 'known' ? 31549 : null,
    }],
  });
const cost = (shippingCostMinor: number | null, currency = 'USD') =>
  calculateUsToUsLandedCost({ itemPriceMinor: 20000, shippingCostMinor, currency });
const run = (landedCost: ReturnType<typeof cost>, metrics = market()) =>
  calculateReferenceDiscount({ landedCost, marketMetrics: metrics, product, condition: 'Used', policy });

describe('S3.3a reference discount', () => {
  it('returns the signed minor-unit discount and open account', () => {
    expect(run(cost(1000))).toMatchObject({
      status: 'known', currency: 'USD', landedCostMinor: 21000,
      referenceMedianMinor: 31549, discountMinor: 10549,
      policy, referenceTreatment: 'leave_one_listing_out',
    });
  });

  it.each([
    ['indeterminate cost', cost(null), market(), ['CUSTO_INDETERMINADO']],
    ['insufficient sample', cost(1000), market('AMOSTRA_INSUFICIENTE'), ['AMOSTRA_INSUFICIENTE']],
    ['both legs missing', cost(null), market('AMOSTRA_INSUFICIENTE'), ['CUSTO_INDETERMINADO', 'AMOSTRA_INSUFICIENTE']],
    ['different currency', cost(1000), market('known', 'EUR'), ['MOEDA_DIVERGENTE']],
  ])('refuses %s without decision numbers', (_name, landedCost, metrics, missing) => {
    const result = run(landedCost, metrics);
    expect(result).toMatchObject({ status: 'NAO_RANQUEAVEL', missing, policy, referenceTreatment: 'leave_one_listing_out' });
    expect(result).not.toHaveProperty('discountMinor');
    expect(result).not.toHaveProperty('landedCostMinor');
    expect(result).not.toHaveProperty('referenceMedianMinor');
  });

  it('rejects a policy incompatible with calculated market metrics', () => {
    expect(() => run(cost(1000), market('known', 'USD', 90))).toThrow();
  });
});
