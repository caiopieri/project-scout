import {
  landedCostSchema,
  usToUsLandedCostInputSchema,
  type LandedCost,
  type UsToUsLandedCostInput,
} from '@scout/schemas';

export const calculateUsToUsLandedCost = (rawInput: UsToUsLandedCostInput): LandedCost => {
  const input = usToUsLandedCostInputSchema.parse(rawInput);
  const shippingCostMinor = input.shippingCostMinor;
  const shippingKnown = shippingCostMinor !== null;
  return landedCostSchema.parse({
    route: 'US_TO_US',
    policyVersion: 'landed-cost.us-us.v1',
    status: shippingKnown ? 'known' : 'indeterminate',
    currency: input.currency,
    components: {
      itemPrice: {
        amountMinor: input.itemPriceMinor,
        currency: input.currency,
        origin: 'informado',
      },
      shipping: {
        amountMinor: shippingCostMinor,
        currency: input.currency,
        origin: shippingKnown ? 'informado' : 'desconhecido',
      },
    },
    totalMinor: shippingKnown ? input.itemPriceMinor + shippingCostMinor : null,
    missing: shippingKnown ? [] : ['shipping'],
  });
};
