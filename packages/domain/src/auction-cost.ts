import type { AuctionCost, AuctionPremises, AuctionTerms } from '@scout/schemas';

type Component = AuctionCost['components'][keyof AuctionCost['components']];

const unknown = (basis: string): Component => ({ amountMinor: null, origin: 'unknown', basis });

/**
 * Real cost of winning a lot at a given hammer price: hammer + buyer's premium + admin fee +
 * sales tax + removal. Each component is stated (terms text), assumed (a user premise) or
 * unknown. The total is known only when nothing is unknown, flagged `assumed` when any premise
 * was needed, and indeterminate otherwise — with every missing piece named.
 */
export const calculateAuctionCost = (input: {
  hammerMinor: number | null;
  currency: string;
  terms: AuctionTerms;
  premises?: AuctionPremises;
}): AuctionCost => {
  const premises = input.premises ?? {};
  const { terms } = input;
  const hammer: Component =
    input.hammerMinor === null
      ? unknown('no bid yet')
      : { amountMinor: input.hammerMinor, origin: 'stated', basis: 'current high bid' };

  const premiumPercent =
    typeof terms.buyerPremiumPercent?.value === 'number'
      ? { percent: terms.buyerPremiumPercent.value, origin: 'stated' as const }
      : premises.buyerPremiumPercent !== undefined
        ? { percent: premises.buyerPremiumPercent, origin: 'assumed' as const }
        : null;
  const buyerPremium: Component =
    premiumPercent && hammer.amountMinor !== null
      ? {
          amountMinor: Math.round((hammer.amountMinor * premiumPercent.percent) / 100),
          origin: premiumPercent.origin,
          basis: `${premiumPercent.percent}% of hammer`,
        }
      : unknown(premiumPercent ? 'no hammer price' : "buyer's premium not stated");

  const adminFee: Component =
    typeof terms.adminFeeMinor?.value === 'number'
      ? { amountMinor: terms.adminFeeMinor.value, origin: 'stated', basis: 'fee stated in terms' }
      : { amountMinor: 0, origin: 'stated', basis: 'no fee stated in terms' };

  const taxBase =
    hammer.amountMinor !== null && buyerPremium.amountMinor !== null
      ? hammer.amountMinor + buyerPremium.amountMinor
      : null;
  const salesTax: Component =
    terms.salesTaxApplies?.value === false
      ? { amountMinor: 0, origin: 'stated', basis: 'terms state no sales tax' }
      : premises.salesTaxPercent !== undefined && taxBase !== null
        ? {
            amountMinor: Math.round((taxBase * premises.salesTaxPercent) / 100),
            origin: 'assumed',
            basis: `${premises.salesTaxPercent}% of hammer + premium`,
          }
        : unknown(
            terms.salesTaxApplies?.value === true
              ? 'sales tax applies; rate depends on the state'
              : 'sales tax not addressed',
          );

  const removal: Component =
    premises.removalMinor !== undefined
      ? {
          amountMinor: premises.removalMinor,
          origin: 'assumed',
          basis: 'removal and shipping estimate',
        }
      : unknown(
          terms.buyerRemoves?.value === true
            ? 'buyer removes and ships at own cost'
            : 'removal cost not addressed',
        );

  const components = { hammer, buyerPremium, adminFee, salesTax, removal };
  const missing = Object.entries(components)
    .filter(([, component]) => component.origin === 'unknown')
    .map(([name]) => name);
  const totalMinor = missing.length
    ? null
    : Object.values(components).reduce((sum, component) => sum + (component.amountMinor ?? 0), 0);
  const stated = typeof terms.quantity?.value === 'number' ? terms.quantity.value : null;
  const quantity = stated ?? premises.quantity ?? null;
  const unitsOrigin =
    stated !== null
      ? premises.usefulRatio !== undefined
        ? ('assumed' as const)
        : ('stated' as const)
      : quantity !== null
        ? ('assumed' as const)
        : ('unknown' as const);
  const usefulUnits =
    quantity !== null && premises.usefulRatio !== undefined
      ? Math.round(quantity * premises.usefulRatio * 100) / 100
      : quantity;
  return {
    policyVersion: 'auction-cost.v1',
    currency: input.currency,
    status: missing.length
      ? 'indeterminate'
      : Object.values(components).some((component) => component.origin === 'assumed')
        ? 'assumed'
        : 'known',
    components,
    totalMinor,
    usefulUnits,
    unitsOrigin,
    costPerUsefulUnitMinor:
      totalMinor !== null && usefulUnits ? Math.round(totalMinor / usefulUnits) : null,
    missing,
  };
};

/**
 * Highest hammer price that keeps the cost per useful unit at or below the target, under the same
 * stated facts and premises. Null when anything it depends on is unknown.
 */
export const maxBidForUnitCost = (input: {
  targetUnitCostMinor: number;
  terms: AuctionTerms;
  premises?: AuctionPremises;
}) => {
  const probe = calculateAuctionCost({
    hammerMinor: 100_00,
    currency: 'USD',
    terms: input.terms,
    premises: input.premises,
  });
  if (probe.totalMinor === null || !probe.usefulUnits) return null;
  const premium = probe.components.buyerPremium.amountMinor! / 100_00;
  const taxRate = probe.components.salesTax.amountMinor
    ? probe.components.salesTax.amountMinor / (100_00 + probe.components.buyerPremium.amountMinor!)
    : 0;
  const fixed = probe.components.adminFee.amountMinor! + probe.components.removal.amountMinor!;
  const budget = input.targetUnitCostMinor * probe.usefulUnits - fixed;
  if (budget <= 0) return 0;
  return Math.floor(budget / ((1 + premium) * (1 + taxRate)));
};
