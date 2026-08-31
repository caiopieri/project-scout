import { describe, expect, it } from 'vitest';
import { calculateMarketMetrics } from '@scout/domain';
import { marketMetricsSchema } from '@scout/schemas';

const product = { brand: 'Apple', model: 'iPhone 13' };
const observation = (priceMinor: number, index: number, condition = 'Used') => ({
  product,
  condition,
  currency: 'USD',
  priceMinor,
  observedAt: new Date(`2026-08-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`),
});

describe('S3.2a clean market median', () => {
  it('uses minor units, trims IQR outliers, and exposes counts', () => {
    const result = calculateMarketMetrics({
      observations: [...Array.from({ length: 10 }, (_, index) => observation(30000 + index * 100, index)), observation(100000, 10)],
      windowDays: 30,
      minimumObservations: 10,
      iqrMultiplier: 1.5,
      asOf: new Date('2026-08-31T00:00:00.000Z'),
    });
    expect(result.segments[0]).toMatchObject({ status: 'known', medianMinor: 30450, nRaw: 11, nTrimmed: 10, nDiscarded: 1 });
    expect(marketMetricsSchema.parse(result)).toEqual(result);
  });

  it('fails closed for insufficient, unknown, expired, and mixed-currency observations', () => {
    const result = calculateMarketMetrics({
      observations: [
        ...Array.from({ length: 9 }, (_, index) => observation(30000, index)),
        { ...observation(30000, 9), currency: 'EUR' },
        { ...observation(30000, 10), condition: 'unknown' },
        { ...observation(30000, 11), currency: 'EUR' },
        { ...observation(30000, 12), observedAt: new Date('2026-07-01T00:00:00.000Z') },
      ],
      windowDays: 30,
      minimumObservations: 10,
      iqrMultiplier: 1.5,
      asOf: new Date('2026-08-31T00:00:00.000Z'),
    });
    expect(result.segments).toHaveLength(2);
    expect(result.segments.every((segment) => segment.status === 'AMOSTRA_INSUFICIENTE' && segment.medianMinor === null)).toBe(true);
    expect(result.segments.map((segment) => segment.currency)).toEqual(['USD', 'EUR']);
  });
});
