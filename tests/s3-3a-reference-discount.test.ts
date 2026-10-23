import { describe, expect, it } from 'vitest';
import {
  calculateReferenceDiscount,
  calculateUsToUsLandedCost,
  REFERENCE_POLICY_V1,
  type TaggedMarketObservation,
} from '@scout/domain';
import { referenceDiscountSchema } from '@scout/schemas';

const asOf = new Date('2026-08-31T00:00:00.000Z');
const segment = {
  product: { brand: 'Apple', model: 'iPhone 13' },
  condition: 'Used',
  currency: 'USD',
};
const knownCost = calculateUsToUsLandedCost({
  itemPriceMinor: 25000,
  shippingCostMinor: 1000,
  currency: 'USD',
});
const unknownCost = calculateUsToUsLandedCost({
  itemPriceMinor: 25000,
  shippingCostMinor: null,
  currency: 'USD',
});

const tagged = (
  listingId: string,
  priceMinor: number,
  day: number,
  overrides = {},
): TaggedMarketObservation => ({
  listingId,
  observation: {
    ...segment,
    priceMinor,
    observedAt: new Date(`2026-08-${String(day).padStart(2, '0')}T00:00:00.000Z`),
    ...overrides,
  },
});

const peers = Array.from({ length: 10 }, (_, index) => tagged(`peer-${index}`, 30000, index + 1));

describe('S3.3a reference discount', () => {
  it('opens the account for a known cost in a sufficient segment', () => {
    const result = calculateReferenceDiscount(
      { id: 'target', landedCost: knownCost, segment },
      peers,
      REFERENCE_POLICY_V1,
      asOf,
    );
    expect(result).toMatchObject({
      status: 'known',
      landedCostMinor: 26000,
      referenceMedianMinor: 30000,
      discountMinor: 4000,
      discountBasisPoints: 1333,
      sample: { nRaw: 10, nTrimmed: 10, windowDays: 30, selfObservationsExcluded: 0 },
      policy: { version: 'reference-discount.v1', minimumObservations: 10 },
    });
    expect(referenceDiscountSchema.parse(result)).toEqual(result);
  });

  it('keeps a negative distance when the cost is above the reference', () => {
    const expensive = calculateUsToUsLandedCost({
      itemPriceMinor: 33000,
      shippingCostMinor: 0,
      currency: 'USD',
    });
    const result = calculateReferenceDiscount(
      { id: 'target', landedCost: expensive, segment },
      peers,
      REFERENCE_POLICY_V1,
      asOf,
    );
    expect(result).toMatchObject({
      status: 'known',
      discountMinor: -3000,
      discountBasisPoints: -1000,
    });
  });

  it('never lets a listing count toward its own reference', () => {
    const ownObservations = Array.from({ length: 5 }, (_, index) =>
      tagged('target', 26000, index + 20),
    );
    const nine = peers.slice(0, 9);
    const result = calculateReferenceDiscount(
      { id: 'target', landedCost: knownCost, segment },
      [...nine, ...ownObservations],
      REFERENCE_POLICY_V1,
      asOf,
    );
    expect(result).toMatchObject({
      status: 'NAO_RANQUEAVEL',
      reasons: ['AMOSTRA_INSUFICIENTE'],
      sample: { nRaw: 9, selfObservationsExcluded: 5 },
    });
  });

  it('names every missing leg instead of producing a number', () => {
    const both = calculateReferenceDiscount(
      { id: 'target', landedCost: unknownCost, segment },
      peers.slice(0, 3),
      REFERENCE_POLICY_V1,
      asOf,
    );
    expect(both).toMatchObject({
      status: 'NAO_RANQUEAVEL',
      reasons: ['CUSTO_INDETERMINADO', 'AMOSTRA_INSUFICIENTE'],
    });
    expect(both).not.toHaveProperty('discountMinor');

    const costOnly = calculateReferenceDiscount(
      { id: 'target', landedCost: unknownCost, segment },
      peers,
      REFERENCE_POLICY_V1,
      asOf,
    );
    expect(costOnly).toMatchObject({ status: 'NAO_RANQUEAVEL', reasons: ['CUSTO_INDETERMINADO'] });

    const noSegment = calculateReferenceDiscount(
      { id: 'target', landedCost: knownCost, segment: null },
      peers,
      REFERENCE_POLICY_V1,
      asOf,
    );
    expect(noSegment).toMatchObject({
      status: 'NAO_RANQUEAVEL',
      reasons: ['SEGMENTO_DESCONHECIDO'],
      segment: null,
      sample: null,
    });
  });

  it('compares only within the same currency and segment', () => {
    const otherCurrency = peers.map((peer) =>
      tagged(peer.listingId, 30000, 5, { currency: 'EUR' }),
    );
    const otherCondition = peers.map((peer) =>
      tagged(peer.listingId, 30000, 5, { condition: 'For parts' }),
    );
    const result = calculateReferenceDiscount(
      { id: 'target', landedCost: knownCost, segment },
      [...otherCurrency, ...otherCondition],
      REFERENCE_POLICY_V1,
      asOf,
    );
    expect(result).toMatchObject({
      status: 'NAO_RANQUEAVEL',
      reasons: ['AMOSTRA_INSUFICIENTE'],
      sample: { nRaw: 0 },
    });
  });

  it('fails closed on an invalid policy', () => {
    expect(() =>
      calculateReferenceDiscount(
        { id: 'target', landedCost: knownCost, segment },
        peers,
        { ...REFERENCE_POLICY_V1, minimumObservations: 3 },
        asOf,
      ),
    ).toThrow();
  });
});
