import {
  opportunityScoresSchema,
  valuationInputSchema,
  valuationOutputSchema,
  type ValuationInput,
  type ValuationOutput,
} from '@scout/schemas';

export {
  opportunityScoresSchema,
  valuationInputSchema,
  valuationOutputSchema,
} from '@scout/schemas';
export type {
  ValuationInput,
  ValuationOutput,
  ValuationPolicy,
  ValuationMarketContext,
  OpportunityScores,
} from '@scout/schemas';
export * from './CollectionOpportunityValuationProcessor';

const clamp = (value: number) => Math.max(0, Math.min(100, value));

const comparableConditionKey = (condition: string): string =>
  condition.trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');

const median = (values: number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
};

const removeOutliers = (values: number[]): { kept: number[]; removed: number } => {
  if (values.length < 4) return { kept: values, removed: 0 };
  const sorted = [...values].sort((left, right) => left - right);
  const q1 = sorted[Math.floor((sorted.length - 1) * 0.25)];
  const q3 = sorted[Math.floor((sorted.length - 1) * 0.75)];
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;
  const kept = values.filter((value) => value >= lower && value <= upper);
  return { kept: kept.length > 0 ? kept : values, removed: values.length - kept.length };
};

const normalizedKey = (value: string | undefined): string | undefined =>
  value?.trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');

const adjustedComparablePrice = (
  input: ValuationInput,
  comparable: ValuationInput['comparables'][number],
): {
  priceMinor: number;
  versionAdjusted: boolean;
  locationAdjusted: boolean;
  shippingAdjusted: boolean;
  quantityAdjusted: boolean;
} => {
  const context = comparable.marketContext;
  const targetContext = input.targetMarketContext;
  const basePrice = comparable.priceMinor + (context.shippingCostMinor ?? 0);
  const unitPrice = basePrice / context.quantity;
  const versionDelta =
    targetContext.versionRank !== undefined && context.versionRank !== undefined
      ? targetContext.versionRank - context.versionRank
      : 0;
  const versionFactor = Math.max(
    0.5,
    Math.min(1.5, 1 + versionDelta * input.policy.versionStepRate),
  );
  const locationMismatch =
    Boolean(targetContext.location && context.location) &&
    normalizedKey(targetContext.location) !== normalizedKey(context.location);
  const locationFactor = locationMismatch ? 1 - input.policy.locationMismatchRate : 1;
  return {
    priceMinor: Math.max(0, Math.round(unitPrice * versionFactor * locationFactor)),
    versionAdjusted: versionDelta !== 0,
    locationAdjusted: locationMismatch,
    shippingAdjusted: context.shippingCostMinor !== undefined,
    quantityAdjusted: context.quantity !== 1,
  };
};

export class DeterministicValuationEngine {
  constructor(private readonly version = 'valuation-rules.v1') {}

  evaluate(rawInput: ValuationInput): ValuationOutput {
    const input = valuationInputSchema.parse(rawInput);
    const targetUnitPrice = Math.round(
      (input.targetPriceMinor + (input.targetMarketContext.shippingCostMinor ?? 0)) /
        input.targetMarketContext.quantity,
    );
    const validComparables = input.comparables.filter(
      (comparable) => comparable.currency === input.currency,
    );
    const targetCondition = input.targetCondition;
    const conditionMatchedComparables = targetCondition
      ? validComparables.filter(
          (comparable) =>
            comparableConditionKey(comparable.condition) ===
            comparableConditionKey(targetCondition),
        )
      : validComparables;
    const comparablePool =
      conditionMatchedComparables.length > 0 ? conditionMatchedComparables : validComparables;
    const adjustedComparables = comparablePool.map((comparable) => ({
      comparable,
      adjustment: adjustedComparablePrice(input, comparable),
    }));
    const { kept, removed } = removeOutliers(
      adjustedComparables.map(({ adjustment }) => adjustment.priceMinor),
    );
    const marketPrice = kept.length > 0 ? median(kept) : targetUnitPrice;
    const transactionCost = Math.round(marketPrice * input.policy.transactionCostRate);
    const maxPurchasePrice = Math.max(
      0,
      marketPrice -
        input.policy.processingCostMinor -
        input.policy.repairReserveMinor -
        transactionCost -
        input.policy.desiredMarginMinor,
    );

    const dealScore =
      marketPrice > 0 ? clamp(((marketPrice - targetUnitPrice) / marketPrice) * 100) : 0;
    const history = [...input.historicalPrices].sort((left, right) =>
      left.observedAt.localeCompare(right.observedAt),
    );
    const trendChange =
      history.length >= 2 && history[0].priceMinor > 0
        ? (history[history.length - 1].priceMinor - history[0].priceMinor) / history[0].priceMinor
        : 0;
    const trendScore = history.length >= 2 ? clamp(50 + trendChange * 200) : 50;

    const daysToSell = comparablePool
      .map((comparable) => comparable.daysToSell)
      .filter((days): days is number => days !== undefined);
    const liquidityScore = daysToSell.length > 0 ? clamp(100 - median(daysToSell) * 2) : 45;

    const seller = input.sellerSignals;
    const sellerPressureScore = seller
      ? clamp(
          (seller.priceDropCount ?? 0) * 20 +
            Math.min(30, (seller.daysActive ?? 0) / 3) +
            Math.min(20, (seller.inventoryCount ?? 0) / 10),
        )
      : 50;

    const observationSignals = input.observationSignals;
    const lifecyclePenalty = Math.min(
      0.25,
      observationSignals.removedCount * 0.05 +
        observationSignals.reappearedCount * 0.03 +
        observationSignals.descriptionChangedCount * 0.02,
    );
    const evidence: string[] = [];
    const missing: string[] = [];
    if (comparablePool.length > 0) evidence.push(`comparables:${comparablePool.length}`);
    else missing.push('comparables in the same currency');
    if (targetCondition) {
      if (conditionMatchedComparables.length > 0) {
        evidence.push(`condition_match:${conditionMatchedComparables.length}`);
      } else {
        missing.push('comparables matching target condition');
      }
    }
    if (history.length >= 2) evidence.push(`history_points:${history.length}`);
    else missing.push('longitudinal price history');
    if (daysToSell.length > 0) evidence.push(`liquidity_samples:${daysToSell.length}`);
    else missing.push('days-to-sell observations');
    if (seller) evidence.push('seller_signals');
    else missing.push('seller pressure signals');
    if (
      observationSignals.removedCount > 0 ||
      observationSignals.reappearedCount > 0 ||
      observationSignals.descriptionChangedCount > 0
    ) {
      evidence.push(
        `listing_lifecycle:removed=${observationSignals.removedCount},reappeared=${observationSignals.reappearedCount},description_changed=${observationSignals.descriptionChangedCount}`,
      );
    } else missing.push('listing lifecycle observations');
    const adjustmentCounts = adjustedComparables.reduce(
      (counts, { adjustment }) => ({
        version: counts.version + Number(adjustment.versionAdjusted),
        location: counts.location + Number(adjustment.locationAdjusted),
        shipping: counts.shipping + Number(adjustment.shippingAdjusted),
        quantity: counts.quantity + Number(adjustment.quantityAdjusted),
      }),
      { version: 0, location: 0, shipping: 0, quantity: 0 },
    );
    if (adjustmentCounts.version > 0)
      evidence.push(`version_adjustments:${adjustmentCounts.version}`);
    if (adjustmentCounts.location > 0)
      evidence.push(`location_adjustments:${adjustmentCounts.location}`);
    if (adjustmentCounts.shipping > 0)
      evidence.push(`shipping_adjustments:${adjustmentCounts.shipping}`);
    if (adjustmentCounts.quantity > 0)
      evidence.push(`quantity_adjustments:${adjustmentCounts.quantity}`);

    const baseConfidence = Math.max(
      0,
      Math.min(
        1,
        0.35 +
          Math.min(0.35, comparablePool.length * 0.07) +
          (history.length >= 2 ? 0.15 : 0) +
          (seller ? 0.1 : 0) +
          (daysToSell.length > 0 ? 0.05 : 0),
      ),
    );
    const confidence = Math.max(0, baseConfidence - lifecyclePenalty);
    const scores = opportunityScoresSchema.parse({
      dealScore,
      trendScore,
      liquidityScore,
      sellerPressureScore,
      riskConfidenceScore: confidence * 100,
    });
    return valuationOutputSchema.parse({
      valuationVersion: this.version,
      estimatedMarketPriceMinor: marketPrice,
      maxPurchasePriceMinor: maxPurchasePrice,
      comparablesUsed: kept.length,
      outliersRemoved: removed,
      scores,
      confidence,
      evidence,
      missing,
      explanation: `Market estimate ${marketPrice} minor units; target deal score ${Math.round(dealScore)}; confidence ${Math.round(confidence * 100)}%.`,
    });
  }
}

export const VALUATION_PACKAGE_MARKER = '@scout/valuation';
