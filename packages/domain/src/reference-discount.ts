import {
  referenceDiscountInputSchema,
  referenceDiscountPolicySchema,
  referenceDiscountSchema,
  type MarketMetrics,
  type ReferenceDiscountInput,
} from '@scout/schemas';

const unknownLabels = ['unknown', 'desconhecido'];
const knownLabel = (value?: string) =>
  Boolean(value?.trim() && !unknownLabels.includes(value.trim().toLowerCase()));
const sameProduct = (
  segment: MarketMetrics['segments'][number],
  product: NonNullable<ReferenceDiscountInput['product']>,
) =>
  segment.product.brand === product.brand?.trim() &&
  segment.product.model === product.model?.trim() &&
  (segment.product.variant ?? '') === (product.variant?.trim() ?? '');

export const calculateReferenceDiscount = (rawInput: ReferenceDiscountInput) => {
  const input = referenceDiscountInputSchema.parse(rawInput);
  const { policy, marketMetrics, landedCost } = input;
  if (
    marketMetrics.windowDays !== policy.windowDays ||
    marketMetrics.minimumObservations !== policy.minimumObservations ||
    marketMetrics.iqrMultiplier !== policy.iqrMultiplier
  )
    throw new Error('Reference-discount policy does not match market metrics.');

  const condition = input.condition.trim();
  const product = input.product;
  const identityKnown =
    Boolean(product) &&
    knownLabel(product?.brand) &&
    knownLabel(product?.model) &&
    (product?.variant === undefined || knownLabel(product.variant)) &&
    knownLabel(condition);
  const sameIdentity = identityKnown
    ? marketMetrics.segments.filter((segment) => sameProduct(segment, product!) && segment.condition === condition)
    : [];
  const segment = sameIdentity.find(({ currency }) => currency === landedCost.currency);
  const missing: Array<'CUSTO_INDETERMINADO' | 'AMOSTRA_INSUFICIENTE' | 'MOEDA_DIVERGENTE'> = [];
  if (landedCost.status !== 'known') missing.push('CUSTO_INDETERMINADO');
  if (!identityKnown) missing.push('AMOSTRA_INSUFICIENTE');
  else if (!segment) missing.push(sameIdentity.length ? 'MOEDA_DIVERGENTE' : 'AMOSTRA_INSUFICIENTE');
  else if (segment.status !== 'known') missing.push('AMOSTRA_INSUFICIENTE');
  if (missing.length)
    return referenceDiscountSchema.parse({
      status: 'NAO_RANQUEAVEL',
      currency: landedCost.currency,
      missing,
      policy,
      referenceTreatment: policy.referenceTreatment,
    });
  return referenceDiscountSchema.parse({
    status: 'known',
    currency: landedCost.currency,
    landedCostMinor: landedCost.totalMinor!,
    referenceMedianMinor: segment!.medianMinor!,
    discountMinor: segment!.medianMinor! - landedCost.totalMinor!,
    market: {
      nRaw: segment!.nRaw,
      nTrimmed: segment!.nTrimmed,
      windowDays: segment!.windowDays,
    },
    policy,
    referenceTreatment: policy.referenceTreatment,
  });
};
