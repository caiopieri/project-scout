import { describe, expect, it } from 'vitest';
import { sliceListingFeed } from '@scout/domain';
import type { ListingTransport, ReferenceDiscount } from '@scout/schemas';

const policy = {
  version: 'reference-discount.v1',
  windowDays: 30,
  minimumObservations: 10,
  iqrMultiplier: 1.5,
} as const;
const segment = {
  product: { brand: 'Apple', model: 'iPhone 13' },
  condition: 'Used',
  currency: 'USD',
};
const sample = { windowDays: 30, nRaw: 12, nTrimmed: 12, selfObservationsExcluded: 0 };

const known = (discountBasisPoints: number, landedCostMinor: number): ReferenceDiscount => ({
  status: 'known',
  policy,
  segment,
  sample,
  landedCostMinor,
  referenceMedianMinor: 30000,
  discountMinor: Math.round((30000 * discountBasisPoints) / 10_000),
  discountBasisPoints,
});
const refused: ReferenceDiscount = {
  status: 'NAO_RANQUEAVEL',
  policy,
  reasons: ['AMOSTRA_INSUFICIENTE'],
  segment,
  sample,
};

const listing = (
  id: string,
  collectedAt: string,
  referenceDiscount: ReferenceDiscount,
  totalMinor = 25000,
) =>
  ({
    id,
    firstCollectedAt: new Date(collectedAt),
    referenceDiscount,
    landedCost: {
      route: 'US_TO_US',
      policyVersion: 'landed-cost.us-us.v1',
      status: 'known',
      currency: 'USD',
      components: {
        itemPrice: { amountMinor: totalMinor - 1000, currency: 'USD', origin: 'informado' },
        shipping: { amountMinor: 1000, currency: 'USD', origin: 'informado' },
      },
      totalMinor,
      missing: [],
    },
  }) as unknown as ListingTransport;

const snapshot = new Date('2026-09-10T00:00:00.000Z');
const acervo = [
  listing('a', '2026-09-01T00:00:00.000Z', known(500, 28500), 28500),
  listing('b', '2026-09-02T00:00:00.000Z', known(2000, 24000), 24000),
  listing('c', '2026-09-03T00:00:00.000Z', known(-300, 30900), 30900),
  listing('d', '2026-09-04T00:00:00.000Z', refused),
  listing('e', '2026-09-05T00:00:00.000Z', refused),
];

describe('S3.4a listing feed', () => {
  it('splits declared groups and orders rankables honestly', () => {
    const byDiscount = sliceListingFeed(acervo, {
      group: 'rankable',
      sort: 'discount',
      snapshot,
      offset: 0,
      limit: 10,
    });
    expect(byDiscount.items.map(({ id }) => id)).toEqual(['b', 'a', 'c']);
    expect(byDiscount.totals).toEqual({ rankable: 3, unbacked: 2 });
    const byCost = sliceListingFeed(acervo, {
      group: 'rankable',
      sort: 'totalCost',
      snapshot,
      offset: 0,
      limit: 10,
    });
    expect(byCost.items.map(({ id }) => id)).toEqual(['b', 'a', 'c']);
    const newest = sliceListingFeed(acervo, {
      group: 'rankable',
      sort: 'newest',
      snapshot,
      offset: 0,
      limit: 10,
    });
    expect(newest.items.map(({ id }) => id)).toEqual(['c', 'b', 'a']);
  });

  it('never orders unbacked items by discount and never mixes them in', () => {
    const unbacked = sliceListingFeed(acervo, {
      group: 'unbacked',
      sort: 'discount',
      snapshot,
      offset: 0,
      limit: 10,
    });
    expect(unbacked.items.map(({ id }) => id)).toEqual(['e', 'd']);
    expect(
      unbacked.items.every((item) => item.referenceDiscount?.status === 'NAO_RANQUEAVEL'),
    ).toBe(true);
  });

  it('keeps pages stable when new items arrive after the snapshot', () => {
    const first = sliceListingFeed(acervo, {
      group: 'rankable',
      sort: 'discount',
      snapshot,
      offset: 0,
      limit: 2,
    });
    expect(first.nextOffset).toBe(2);
    const grown = [...acervo, listing('z', '2026-09-11T00:00:00.000Z', known(9000, 3000), 3000)];
    const second = sliceListingFeed(grown, {
      group: 'rankable',
      sort: 'discount',
      snapshot,
      offset: 2,
      limit: 2,
    });
    expect([...first.items, ...second.items].map(({ id }) => id)).toEqual(['b', 'a', 'c']);
    expect(second.nextOffset).toBeNull();
    expect(second.newSinceSnapshot).toBe(1);
  });
});
