import {
  referenceDiscountSchema,
  referencePolicySchema,
  type LandedCost,
  type MarketMetricObservation,
  type ReferenceDiscount,
  type ReferenceDiscountRefusalReason,
  type ReferencePolicy,
} from '@scout/schemas';
import { calculateMarketMetrics } from './market-metrics';

export const REFERENCE_POLICY_V1: ReferencePolicy = referencePolicySchema.parse({
  version: 'reference-discount.v1',
  windowDays: 30,
  minimumObservations: 10,
  iqrMultiplier: 1.5,
});

export interface ReferenceDiscountListing {
  id: string;
  landedCost?: LandedCost;
  segment: {
    product: MarketMetricObservation['product'];
    condition: string;
    currency: string;
  } | null;
}

export interface TaggedMarketObservation {
  listingId: string;
  observation: MarketMetricObservation;
}

const sameSegment = (
  observation: MarketMetricObservation,
  segment: NonNullable<ReferenceDiscountListing['segment']>,
) =>
  observation.product.brand === segment.product.brand &&
  observation.product.model === segment.product.model &&
  (observation.product.variant ?? '') === (segment.product.variant ?? '') &&
  observation.condition === segment.condition &&
  observation.currency === segment.currency;

/**
 * The listing's own observations are excluded from its reference (leave-one-out), so a listing
 * can never pull the median toward itself. The excluded count travels in the result.
 */
export const calculateReferenceDiscount = (
  listing: ReferenceDiscountListing,
  observations: TaggedMarketObservation[],
  rawPolicy: ReferencePolicy,
  asOf: Date,
): ReferenceDiscount => {
  const policy = referencePolicySchema.parse(rawPolicy);
  const reasons: ReferenceDiscountRefusalReason[] = [];
  const cost = listing.landedCost;
  if (!cost || cost.status !== 'known' || cost.totalMinor === null)
    reasons.push('CUSTO_INDETERMINADO');
  const segment = listing.segment;
  if (!segment) {
    reasons.push('SEGMENTO_DESCONHECIDO');
    return referenceDiscountSchema.parse({
      status: 'NAO_RANQUEAVEL',
      policy,
      reasons,
      segment: null,
      sample: null,
    });
  }
  const inSegment = observations.filter(({ observation }) => sameSegment(observation, segment));
  const others = inSegment.filter(({ listingId }) => listingId !== listing.id);
  const metrics = calculateMarketMetrics({
    observations: others.map(({ observation }) => observation),
    windowDays: policy.windowDays,
    minimumObservations: policy.minimumObservations,
    iqrMultiplier: policy.iqrMultiplier,
    asOf,
  });
  // Every observation passed in belongs to this one segment, so at most one segment comes back.
  const metric = metrics.segments[0];
  const sample = {
    windowDays: policy.windowDays,
    nRaw: metric?.nRaw ?? 0,
    nTrimmed: metric?.nTrimmed ?? 0,
    selfObservationsExcluded: inSegment.length - others.length,
  };
  const medianMinor = metric?.status === 'known' && metric.medianMinor ? metric.medianMinor : null;
  if (medianMinor === null) reasons.push('AMOSTRA_INSUFICIENTE');
  if (reasons.length || cost?.totalMinor == null || medianMinor === null)
    return referenceDiscountSchema.parse({
      status: 'NAO_RANQUEAVEL',
      policy,
      reasons,
      segment,
      sample,
    });
  const discountMinor = medianMinor - cost.totalMinor;
  return referenceDiscountSchema.parse({
    status: 'known',
    policy,
    segment,
    sample,
    landedCostMinor: cost.totalMinor,
    referenceMedianMinor: medianMinor,
    discountMinor,
    discountBasisPoints: Math.round((discountMinor * 10_000) / medianMinor),
  });
};
