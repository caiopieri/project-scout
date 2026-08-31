import {
  marketMetricSegmentSchema,
  marketMetricsInputSchema,
  marketMetricsSchema,
  type MarketMetricSegment,
} from '@scout/schemas';

const median = (values: number[]) => {
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : Math.round((values[middle - 1] + values[middle]) / 2);
};

export const calculateMarketMetrics = (rawInput: Parameters<typeof marketMetricsInputSchema.parse>[0]) => {
  const input = marketMetricsInputSchema.parse(rawInput);
  const cutoff = input.asOf.getTime() - input.windowDays * 24 * 60 * 60 * 1000;
  const groups = new Map<string, { product: MarketMetricSegment['product']; condition: string; currency: string; prices: number[] }>();
  for (const observation of input.observations) {
    if (observation.observedAt.getTime() < cutoff || observation.observedAt.getTime() > input.asOf.getTime()) continue;
    if ([observation.condition, observation.product.brand, observation.product.model].some((value) => ['unknown', 'desconhecido'].includes(value.trim().toLowerCase()))) continue;
    const product = { ...observation.product };
    const key = [product.brand, product.model, product.variant ?? '', observation.condition, observation.currency].join('\u001f');
    const group = groups.get(key) ?? { product, condition: observation.condition, currency: observation.currency, prices: [] };
    group.prices.push(observation.priceMinor);
    groups.set(key, group);
  }
  const segments = [...groups.values()].map((group) => {
    const prices = group.prices.sort((a, b) => a - b);
    const nRaw = prices.length;
    const segment = { product: group.product, condition: group.condition, currency: group.currency };
    if (nRaw < input.minimumObservations)
      return marketMetricSegmentSchema.parse({ ...segment, windowDays: input.windowDays, nRaw, nTrimmed: nRaw, nDiscarded: 0, status: 'AMOSTRA_INSUFICIENTE', medianMinor: null });
    const q1 = prices[Math.floor((nRaw - 1) / 4)];
    const q3 = prices[Math.floor((nRaw - 1) * 3 / 4)];
    const iqr = q3 - q1;
    const trimmed = prices.filter((price) => 2 * price >= 2 * q1 - 3 * iqr && 2 * price <= 2 * q3 + 3 * iqr);
    return marketMetricSegmentSchema.parse({ ...segment, windowDays: input.windowDays, nRaw, nTrimmed: trimmed.length, nDiscarded: nRaw - trimmed.length, status: 'known', medianMinor: median(trimmed) });
  });
  return marketMetricsSchema.parse({ windowDays: input.windowDays, minimumObservations: input.minimumObservations, iqrMultiplier: input.iqrMultiplier, segments });
};
