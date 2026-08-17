import { describe, expect, it } from 'vitest';
import { DeterministicNegotiationFreshnessChecker } from '@scout/valuation';

const context = {
  contextId: '4b5d1e21-7b4e-4e0b-8d4d-5d9b7d1c3f22',
  category: 'electronics' as const,
  source: 'ebay' as const,
  externalId: 'ebay-42',
  title: 'Latitude 5420',
  currency: 'BRL' as const,
  askingPriceMinor: 150000,
  marketValueMinor: 170000,
  sellerPressure: 'UNKNOWN' as const,
  targetPriceMinor: 120000,
  userMaxPriceMinor: 130000,
  evidence: [
    {
      source: 'ebay' as const,
      externalId: 'ebay-42',
      kind: 'LISTING' as const,
      summary: 'fixture',
      observedAt: '2026-08-15T12:00:00.000Z',
    },
  ],
  questions: [],
};

describe('F6.3 negotiation freshness', () => {
  const checker = new DeterministicNegotiationFreshnessChecker();

  it('marks context fresh inside the explicit window', () => {
    expect(
      checker.check({ context, now: '2026-08-15T12:30:00.000Z', maxAgeSeconds: 3600 }),
    ).toMatchObject({
      status: 'FRESH',
      ageSeconds: 1800,
      usable: true,
      revalidationRequired: false,
    });
  });

  it('requires revalidation after expiry', () => {
    expect(
      checker.check({ context, now: '2026-08-15T14:01:00.000Z', maxAgeSeconds: 7200 }),
    ).toMatchObject({ status: 'STALE', usable: false, revalidationRequired: true });
  });

  it('fails closed when evidence is in the future or input is incomplete', () => {
    expect(
      checker.check({ context, now: '2026-08-15T11:59:59.000Z', maxAgeSeconds: 3600 }),
    ).toMatchObject({ status: 'INVALID_FUTURE_TIMESTAMP', usable: false });
    expect(() =>
      checker.check({ ...context, now: '2026-08-15T12:00:00.000Z', maxAgeSeconds: 0 }),
    ).toThrow();
    expect(() =>
      checker.check({
        context: { ...context, evidence: [] },
        now: '2026-08-15T12:00:00.000Z',
        maxAgeSeconds: 3600,
      }),
    ).toThrow();
    expect(() =>
      checker.check({
        context,
        now: '2026-08-15T12:00:00.000Z',
        maxAgeSeconds: 3600,
        command: 'send',
      }),
    ).toThrow();
  });
});
