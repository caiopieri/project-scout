import { describe, expect, it } from 'vitest';
import {
  DeterministicAuthorizationEnvelopeBuilder,
  DeterministicAuthorizationEnvelopeValidator,
} from '@scout/valuation';

const request = {
  authorizationId: '6e29d8c4-a818-4c5e-89de-7f2e91188b8d',
  userId: '11111111-1111-4111-a111-111111111111',
  category: 'electronics' as const,
  source: 'ebay' as const,
  externalId: 'ebay-42',
  action: 'BUY' as const,
  currency: 'BRL' as const,
  quantity: 1,
  unitPriceMinor: 50000,
  totalCostMinor: 50000,
  maxTotalCostMinor: 50000,
  issuedAt: '2026-08-15T12:00:00.000Z',
  expiresAt: '2026-08-15T13:00:00.000Z',
  idempotencyKey: 'auth-ebay-42-001',
};

describe('F7.2 authorization gate', () => {
  const envelope = new DeterministicAuthorizationEnvelopeBuilder().build(request);
  const validator = new DeterministicAuthorizationEnvelopeValidator();

  it('keeps an unexpired envelope awaiting human approval', () => {
    expect(
      validator.validate({ envelope, now: '2026-08-15T12:30:00.000Z', alreadyConsumed: false }),
    ).toMatchObject({
      decision: 'AWAITING_HUMAN_APPROVAL',
      requiresHumanApproval: true,
      executable: false,
    });
  });

  it('fails closed for expiry before replay', () => {
    expect(
      validator.validate({ envelope, now: '2026-08-15T13:00:00.000Z', alreadyConsumed: false }),
    ).toMatchObject({ decision: 'EXPIRED', executable: false });
    expect(
      validator.validate({ envelope, now: '2026-08-15T12:30:00.000Z', alreadyConsumed: true }),
    ).toMatchObject({ decision: 'REPLAYED', executable: false });
  });

  it('rejects malformed or action-bearing payloads', () => {
    expect(() =>
      validator.validate({ envelope, now: 'not-a-date', alreadyConsumed: false }),
    ).toThrow();
    expect(() =>
      validator.validate({
        envelope: { ...envelope, humanApproved: true },
        now: '2026-08-15T12:30:00.000Z',
        alreadyConsumed: false,
      }),
    ).toThrow();
    expect(() =>
      validator.validate({
        envelope,
        now: '2026-08-15T12:30:00.000Z',
        alreadyConsumed: false,
        payment: 'pix',
      }),
    ).toThrow();
    expect(() =>
      validator.validate({
        envelope,
        now: '2026-08-15T12:30:00.000Z',
        alreadyConsumed: false,
        command: 'buy',
      }),
    ).toThrow();
  });
});
