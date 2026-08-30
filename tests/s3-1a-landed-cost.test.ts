import { describe, expect, it } from 'vitest';
import { calculateUsToUsLandedCost } from '@scout/domain';
import { landedCostSchema, type UsToUsLandedCostInput } from '@scout/schemas';

const input: UsToUsLandedCostInput = {
  itemPriceMinor: 29999,
  shippingCostMinor: 1550,
  currency: 'USD',
};

describe('S3.1a US to US landed cost', () => {
  it('sums declared shipping in minor units', () => {
    expect(calculateUsToUsLandedCost(input)).toMatchObject({
      route: 'US_TO_US',
      policyVersion: 'landed-cost.us-us.v1',
      status: 'known',
      currency: 'USD',
      components: {
        itemPrice: { amountMinor: 29999, origin: 'informado' },
        shipping: { amountMinor: 1550, origin: 'informado' },
      },
      totalMinor: 31549,
      missing: [],
    });
  });

  it('treats declared zero as known and null as indeterminate', () => {
    const free = calculateUsToUsLandedCost({ ...input, shippingCostMinor: 0 });
    expect(free).toMatchObject({ status: 'known', totalMinor: 29999 });
    expect(free.components.shipping).toMatchObject({ amountMinor: 0, origin: 'informado' });

    const unknown = calculateUsToUsLandedCost({ ...input, shippingCostMinor: null });
    expect(unknown).toMatchObject({
      status: 'indeterminate',
      totalMinor: null,
      missing: ['shipping'],
      components: { shipping: { amountMinor: null, origin: 'desconhecido' } },
    });
  });

  it('rejects invalid inputs and unsafe totals', () => {
    for (const invalid of [
      { ...input, currency: 'US' },
      { ...input, itemPriceMinor: 29999.5 as never },
      { ...input, shippingCostMinor: -1 },
      { ...input, itemPriceMinor: Number.MAX_SAFE_INTEGER, shippingCostMinor: 1 },
    ])
      expect(() => calculateUsToUsLandedCost(invalid)).toThrow();
  });

  it('rejects an inconsistent known result', () => {
    expect(() =>
      landedCostSchema.parse({
        route: 'US_TO_US',
        policyVersion: 'landed-cost.us-us.v1',
        status: 'known',
        currency: 'USD',
        components: {
          itemPrice: { amountMinor: 100, currency: 'USD', origin: 'informado' },
          shipping: { amountMinor: 0, currency: 'USD', origin: 'informado' },
        },
        totalMinor: 99,
        missing: [],
      }),
    ).toThrow();
  });
});
