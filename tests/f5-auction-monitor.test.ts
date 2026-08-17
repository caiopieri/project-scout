import { describe, expect, it } from 'vitest';
import { DeterministicAuctionMonitorAggregator } from '@scout/valuation';

const event = {
  eventId: 'event-1',
  lotExternalId: 'lot-42',
  source: 'fixture',
  sequence: 1,
  observedAt: '2026-08-15T12:00:00.000Z',
  type: 'PRICE_CHANGED' as const,
  previousValue: '100',
  currentValue: '120',
};

describe('F5.3 deterministic auction monitor', () => {
  const aggregator = new DeterministicAuctionMonitorAggregator();

  it('deduplicates and orders fixture events with alerts', () => {
    const result = aggregator.aggregate([
      event,
      { ...event, eventId: 'event-2', sequence: 2, type: 'TERMS_CHANGED' as const },
      { ...event, eventId: 'event-3', sequence: 3, type: 'REMOVED' as const },
      event,
    ]);

    expect(result.events.map((item) => item.eventId)).toEqual(['event-1', 'event-2', 'event-3']);
    expect(result.latestSequence).toBe(3);
    expect(result.alerts).toEqual(['LOT_REMOVED', 'PRICE_INCREASE', 'TERMS_CHANGED']);
  });

  it('rejects mixed lots and action fields', () => {
    expect(() =>
      aggregator.aggregate([event, { ...event, eventId: 'other', lotExternalId: 'lot-99' }]),
    ).toThrow();
    expect(() => aggregator.aggregate([{ ...event, bid: true }])).toThrow();
  });
});
