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
export {
  auctionLotCostPolicySchema,
  auctionLotDossierSchema,
  auctionLotInputSchema,
} from '@scout/schemas';
export type { AuctionLotCostPolicy, AuctionLotDossier, AuctionLotInput } from '@scout/schemas';
export { auctionDocumentSchema, auctionEvidenceNormalizationSchema } from '@scout/schemas';
export type { AuctionDocument, AuctionEvidenceNormalization } from '@scout/schemas';
export { auctionMonitorEventSchema, auctionMonitorSummarySchema } from '@scout/schemas';
export type { AuctionMonitorEvent, AuctionMonitorSummary } from '@scout/schemas';
export {
  negotiationContextSchema,
  negotiationEvidenceSchema,
  negotiationSuggestionSchema,
} from '@scout/schemas';
export type {
  NegotiationContext,
  NegotiationEvidence,
  NegotiationSuggestion,
  NegotiationSource,
  NegotiationFreshnessInput,
  NegotiationFreshnessResult,
  NegotiationInteraction,
  NegotiationFollowUp,
  AuthorizationEnvelope,
  AuthorizationGateResult,
  AuthorizationSessionGateResult,
} from '@scout/schemas';
export * from './CollectionOpportunityValuationProcessor';

import type {
  AuctionEvidenceNormalizer,
  AuctionLotEvaluator,
  AuctionMonitorAggregator,
  NegotiationAssistant,
  NegotiationFreshnessChecker,
  NegotiationFollowUpAssistant,
  AuthorizationEnvelopeBuilder,
  AuthorizationEnvelopeValidator,
  AuthorizationSessionGate,
} from '@scout/domain';
import {
  auctionLotCostPolicySchema,
  auctionLotDossierSchema,
  auctionLotInputSchema,
  type AuctionLotDossier,
  auctionDocumentSchema,
  auctionEvidenceNormalizationSchema,
  type AuctionDocument,
  type AuctionEvidenceNormalization,
  auctionMonitorEventSchema,
  auctionMonitorSummarySchema,
  type AuctionMonitorEvent,
  type AuctionMonitorSummary,
  negotiationContextSchema,
  negotiationSuggestionSchema,
  negotiationFreshnessInputSchema,
  negotiationFreshnessResultSchema,
  type NegotiationSuggestion,
  type NegotiationFreshnessResult,
  negotiationInteractionSchema,
  negotiationFollowUpSchema,
  type NegotiationFollowUp,
  authorizationRequestSchema,
  authorizationEnvelopeSchema,
  type AuthorizationEnvelope,
  authorizationGateInputSchema,
  authorizationGateResultSchema,
  type AuthorizationGateResult,
  authorizationSessionGateInputSchema,
  authorizationSessionGateResultSchema,
  type AuthorizationSessionGateResult,
} from '@scout/schemas';

const formatMinor = (currency: string, amountMinor: number): string =>
  `${currency} ${(amountMinor / 100).toFixed(2)}`;

export class DeterministicNegotiationAssistant implements NegotiationAssistant {
  suggest(rawInput: unknown): NegotiationSuggestion {
    const input = negotiationContextSchema.parse(rawInput);
    const suggestedOfferMinor = Math.min(input.targetPriceMinor, input.askingPriceMinor);
    const evidenceReferences = input.evidence.map(
      (evidence) => `${evidence.kind}:${evidence.source}:${evidence.externalId}`,
    );
    const message =
      'Olá! Tenho interesse neste anúncio. ' +
      `Minha proposta é ${formatMinor(input.currency, suggestedOfferMinor)}. ` +
      'Podemos confirmar a disponibilidade e as condições descritas?';
    return negotiationSuggestionSchema.parse({
      contextId: input.contextId,
      source: input.source,
      externalId: input.externalId,
      currency: input.currency,
      suggestedOfferMinor,
      maxOfferMinor: input.userMaxPriceMinor,
      message,
      requestedQuestions: input.questions,
      evidenceReferences,
      rationale:
        `Oferta limitada ao menor valor entre alvo e preço pedido; ` +
        `pressão do vendedor: ${input.sellerPressure}; ` +
        `valor de mercado informado: ${formatMinor(input.currency, input.marketValueMinor)}.`,
      requiresHumanReview: true,
      sent: false,
      executable: false,
    });
  }
}

export class DeterministicNegotiationFreshnessChecker implements NegotiationFreshnessChecker {
  check(rawInput: unknown): NegotiationFreshnessResult {
    const input = negotiationFreshnessInputSchema.parse(rawInput);
    const latestEvidenceAt = input.context.evidence.reduce(
      (latest, evidence) => (evidence.observedAt > latest ? evidence.observedAt : latest),
      input.context.evidence[0].observedAt,
    );
    const nowMs = Date.parse(input.now);
    const latestMs = Date.parse(latestEvidenceAt);
    const ageSeconds = Math.max(0, Math.floor((nowMs - latestMs) / 1000));
    const status: NegotiationFreshnessResult['status'] =
      nowMs < latestMs
        ? 'INVALID_FUTURE_TIMESTAMP'
        : ageSeconds > input.maxAgeSeconds
          ? 'STALE'
          : 'FRESH';
    return negotiationFreshnessResultSchema.parse({
      contextId: input.context.contextId,
      checkedAt: input.now,
      latestEvidenceAt,
      ageSeconds,
      status,
      revalidationRequired: status !== 'FRESH',
      usable: status === 'FRESH',
    });
  }
}

export class DeterministicNegotiationFollowUpAssistant implements NegotiationFollowUpAssistant {
  suggest(rawInput: unknown): NegotiationFollowUp {
    const input = negotiationInteractionSchema.parse(rawInput);
    const declined = input.outcome === 'DECLINED';
    const message = declined
      ? 'Obrigado pelo retorno. Registro a recusa apenas nesta negociação e não recomendo insistir neste contexto.'
      : input.outcome === 'NO_RESPONSE'
        ? 'Olá! Retomo o contato sobre o anúncio. Ainda há interesse em negociar?'
        : input.outcome === 'QUESTION'
          ? 'Obrigado pela resposta. Podemos esclarecer os pontos pendentes antes de avaliar os próximos passos?'
          : input.outcome === 'COUNTEROFFER'
            ? 'Obrigado pela contraproposta. Vou deixar esta condição para revisão antes de qualquer resposta.'
            : 'Obrigado pela confirmação. Vou deixar o próximo passo para revisão humana antes de qualquer resposta.';
    return negotiationFollowUpSchema.parse({
      contextId: input.contextId,
      source: input.source,
      externalId: input.externalId,
      recommendedAction: declined ? 'DO_NOT_FOLLOW_UP' : 'REVIEW_AND_SEND_MANUALLY',
      message,
      requestedQuestions: input.questions,
      rationale: declined
        ? 'A recusa é contextual e não cria uma regra permanente para o vendedor.'
        : `Resultado observado: ${input.outcome}; qualquer resposta exige revisão humana.`,
      refusalIsContextual: true,
      requiresHumanReview: true,
      sent: false,
      executable: false,
    });
  }
}

export class DeterministicAuthorizationEnvelopeBuilder implements AuthorizationEnvelopeBuilder {
  build(rawInput: unknown): AuthorizationEnvelope {
    const request = authorizationRequestSchema.parse(rawInput);
    return authorizationEnvelopeSchema.parse({
      ...request,
      authorizationVersion: 'authorization-envelope.v1',
      status: 'PENDING_HUMAN_APPROVAL',
      humanApproved: false,
      executable: false,
    });
  }
}

export class DeterministicAuthorizationEnvelopeValidator implements AuthorizationEnvelopeValidator {
  validate(rawInput: unknown): AuthorizationGateResult {
    const input = authorizationGateInputSchema.parse(rawInput);
    const decision = input.alreadyConsumed
      ? 'REPLAYED'
      : Date.parse(input.now) >= Date.parse(input.envelope.expiresAt)
        ? 'EXPIRED'
        : 'AWAITING_HUMAN_APPROVAL';
    return authorizationGateResultSchema.parse({
      authorizationId: input.envelope.authorizationId,
      decision,
      requiresHumanApproval: true,
      executable: false,
    });
  }
}

export class DeterministicAuthorizationSessionGate implements AuthorizationSessionGate {
  validate(rawInput: unknown): AuthorizationSessionGateResult {
    const input = authorizationSessionGateInputSchema.parse(rawInput);
    const identityMatches =
      input.currentUserId === input.envelope.userId &&
      input.currentSessionId === input.binding.sessionId;
    const decision = !identityMatches
      ? 'SESSION_MISMATCH'
      : Date.parse(input.now) >= Date.parse(input.binding.expiresAt)
        ? 'SESSION_EXPIRED'
        : 'SESSION_MATCH';
    return authorizationSessionGateResultSchema.parse({
      authorizationId: input.envelope.authorizationId,
      decision,
      requiresHumanApproval: true,
      executable: false,
    });
  }
}

export class DeterministicAuctionLotEvaluator implements AuctionLotEvaluator {
  evaluate(rawInput: unknown, rawPolicy: unknown): AuctionLotDossier {
    const input = auctionLotInputSchema.parse(rawInput);
    const policy = auctionLotCostPolicySchema.parse(rawPolicy);
    const quantity = input.quantity ?? 1;
    const marketEvidence = input.evidence.filter((item) => item.currency === input.currency);
    const marketUnitPrice = marketEvidence.length
      ? Math.round(
          [...marketEvidence.map((item) => item.priceMinor)].sort((a, b) => a - b)[
            Math.floor((marketEvidence.length - 1) / 2)
          ],
        )
      : 0;
    const nonPurchaseCosts = [
      policy.shippingMinor,
      policy.buyerFeesMinor,
      policy.taxesMinor,
      policy.processingMinor,
      policy.repairReserveMinor,
    ].reduce((total: number, cost) => total + (cost ?? 0), 0);
    const totalCostMinor = input.askingPriceMinor + nonPurchaseCosts;
    const unitCostMinor = Math.ceil(totalCostMinor / quantity);
    const estimatedRevenueMinor = marketUnitPrice * quantity;
    const minimumMarginMinor = policy.minimumMarginMinor ?? 0;
    const maxRecommendedPurchaseMinor = Math.max(
      0,
      estimatedRevenueMinor - nonPurchaseCosts - minimumMarginMinor,
    );
    const estimatedMarginMinor = estimatedRevenueMinor - totalCostMinor;
    const flags = [] as AuctionLotDossier['flags'];
    if (marketEvidence.length === 0) flags.push('MISSING_MARKET_EVIDENCE');
    if (marketEvidence.length > 0 && marketEvidence.length < 3) flags.push('LOW_MARKET_SAMPLE');
    if (!input.condition) flags.push('MISSING_CONDITION');
    if (!input.location) flags.push('MISSING_LOCATION');
    if (input.quantity === undefined) flags.push('MISSING_QUANTITY');
    if (policy.shippingMinor === undefined) flags.push('MISSING_SHIPPING_EVIDENCE');
    if (
      policy.buyerFeesMinor === undefined ||
      policy.taxesMinor === undefined ||
      policy.processingMinor === undefined ||
      policy.repairReserveMinor === undefined ||
      policy.minimumMarginMinor === undefined
    ) {
      flags.push('MISSING_COST_POLICY');
    }
    if (estimatedMarginMinor < minimumMarginMinor) flags.push('MARGIN_BELOW_TARGET');
    if (input.askingPriceMinor > maxRecommendedPurchaseMinor)
      flags.push('ASKING_PRICE_ABOVE_LIMIT');
    const hasMissingData = flags.some(
      (flag) => flag !== 'MARGIN_BELOW_TARGET' && flag !== 'ASKING_PRICE_ABOVE_LIMIT',
    );
    const recommendation = hasMissingData
      ? 'REVIEW'
      : estimatedMarginMinor < minimumMarginMinor
        ? 'AVOID'
        : 'SHORTLIST';
    const risk: AuctionLotDossier['risk'] = flags.some(
      (flag) => flag === 'MISSING_MARKET_EVIDENCE' || flag === 'MISSING_CONDITION',
    )
      ? 'HIGH'
      : flags.length > 0
        ? 'MEDIUM'
        : 'LOW';
    return auctionLotDossierSchema.parse({
      externalId: input.externalId,
      source: input.source,
      currency: input.currency,
      totalCostMinor,
      unitCostMinor,
      estimatedMarketUnitPriceMinor: marketUnitPrice,
      estimatedRevenueMinor,
      maxRecommendedPurchaseMinor,
      estimatedMarginMinor,
      risk,
      flags,
      recommendation,
      evidenceCount: marketEvidence.length,
      explanation: [
        'AUCTION_LOT_DOSSIER',
        `RECOMMENDATION_${recommendation}`,
        `RISK_${risk}`,
        ...flags,
      ].join('|'),
    });
  }
}

export class DeterministicAuctionEvidenceNormalizer implements AuctionEvidenceNormalizer {
  normalize(rawInput: unknown): AuctionEvidenceNormalization {
    const documents = auctionDocumentSchema.array().max(50).parse(rawInput);
    const lotIds = new Set(documents.map((document) => document.lotExternalId));
    if (lotIds.size > 1) throw new Error('Auction documents must belong to one lot.');
    const ordered = [...documents].sort(
      (left, right) =>
        left.type.localeCompare(right.type) ||
        right.version - left.version ||
        left.documentId.localeCompare(right.documentId),
    );
    const latestByType = new Map<string, AuctionDocument>();
    for (const document of ordered) {
      if (!latestByType.has(document.type)) latestByType.set(document.type, document);
    }
    const claimsByKey = new Map<string, Set<string>>();
    for (const document of ordered) {
      for (const claim of document.claims) {
        const values = claimsByKey.get(claim.key) ?? new Set<string>();
        values.add(`${claim.status}:${claim.value}`);
        claimsByKey.set(claim.key, values);
      }
    }
    const conflictingKeys = [...claimsByKey.entries()]
      .filter(([, values]) => values.size > 1)
      .map(([key]) => key)
      .sort();
    const flags: AuctionEvidenceNormalization['flags'] = [];
    if (documents.length === 0) flags.push('NO_DOCUMENTS');
    if (conflictingKeys.length > 0) flags.push('CONFLICTING_CLAIMS');
    if (!latestByType.has('MANIFEST')) flags.push('MISSING_MANIFEST');
    if (!latestByType.has('CONDITION_REPORT')) flags.push('MISSING_CONDITION_REPORT');
    const completeness = Math.max(0, 1 - flags.length * 0.25);
    return auctionEvidenceNormalizationSchema.parse({
      lotExternalId: documents[0]?.lotExternalId ?? 'unknown',
      documentCount: documents.length,
      claimCount: documents.reduce((count, document) => count + document.claims.length, 0),
      completeness,
      flags,
      conflictingKeys,
      latestDocumentIds: [...latestByType.values()].map((document) => document.documentId),
    });
  }
}

export class DeterministicAuctionMonitorAggregator implements AuctionMonitorAggregator {
  aggregate(rawInput: unknown): AuctionMonitorSummary {
    const events = auctionMonitorEventSchema.array().max(100).parse(rawInput);
    const lotIds = new Set(events.map((event) => event.lotExternalId));
    if (lotIds.size > 1) throw new Error('Auction events must belong to one lot.');
    const ordered = [...events].sort(
      (left, right) =>
        left.sequence - right.sequence ||
        left.observedAt.localeCompare(right.observedAt) ||
        left.eventId.localeCompare(right.eventId),
    );
    const unique = new Map<string, AuctionMonitorEvent>();
    for (const event of ordered) unique.set(event.eventId, event);
    const deduplicated = [...unique.values()];
    const alerts = new Set<AuctionMonitorSummary['alerts'][number]>();
    for (const current of deduplicated) {
      if (
        current.type === 'PRICE_CHANGED' &&
        current.previousValue !== undefined &&
        current.currentValue !== undefined &&
        Number.isFinite(Number(current.previousValue)) &&
        Number(current.currentValue) > Number(current.previousValue)
      ) {
        alerts.add('PRICE_INCREASE');
      }
      if (current.type === 'DEADLINE_CHANGED') alerts.add('DEADLINE_NEAR');
      if (current.type === 'TERMS_CHANGED') alerts.add('TERMS_CHANGED');
      if (current.type === 'REMOVED') alerts.add('LOT_REMOVED');
    }
    return auctionMonitorSummarySchema.parse({
      lotExternalId: deduplicated[0]?.lotExternalId ?? 'unknown',
      events: deduplicated,
      latestSequence: deduplicated.reduce(
        (latest, current) => Math.max(latest, current.sequence),
        0,
      ),
      alerts: [...alerts].sort(),
    });
  }
}

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
