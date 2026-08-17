import { describe, expect, it } from 'vitest';
import {
  DeterministicAuthorizationEnvelopeBuilder,
  DeterministicAuthorizationSessionGate,
} from '@scout/valuation';

const envelope = new DeterministicAuthorizationEnvelopeBuilder().build({
  authorizationId: '6e29d8c4-a818-4c5e-89de-7f2e91188b8d',
  userId: '11111111-1111-4111-a111-111111111111',
  category: 'electronics',
  source: 'ebay',
  externalId: 'ebay-42',
  action: 'BUY',
  currency: 'BRL',
  quantity: 1,
  unitPriceMinor: 50000,
  totalCostMinor: 50000,
  maxTotalCostMinor: 50000,
  issuedAt: '2026-08-15T12:00:00.000Z',
  expiresAt: '2030-08-15T13:00:00.000Z',
  idempotencyKey: 'auth-ebay-42-001',
});

const binding = {
  authorizationId: envelope.authorizationId,
  userId: envelope.userId,
  sessionId: '7b29c1a9-09e4-4d98-94e9-8e2e95d8e4c0',
  boundAt: '2026-08-15T12:00:00.000Z',
  expiresAt: '2026-08-15T12:30:00.000Z',
};

describe('F7.4 authorization session gate', () => {
  const gate = new DeterministicAuthorizationSessionGate();
  const input = {
    envelope,
    binding,
    currentUserId: envelope.userId,
    currentSessionId: binding.sessionId,
    now: '2026-08-15T12:15:00.000Z',
  };

  it('matches the bound user/session only inside the binding window', () => {
    expect(gate.validate(input)).toMatchObject({ decision: 'SESSION_MATCH', executable: false });
    expect(gate.validate({ ...input, now: '2026-08-15T12:30:00.000Z' })).toMatchObject({
      decision: 'SESSION_EXPIRED',
      executable: false,
    });
  });

  it('fails closed for user, session or envelope mismatch', () => {
    expect(
      gate.validate({ ...input, currentUserId: '99999999-9999-4999-a999-999999999999' }),
    ).toMatchObject({ decision: 'SESSION_MISMATCH' });
    expect(
      gate.validate({ ...input, currentSessionId: '99999999-9999-4999-a999-999999999999' }),
    ).toMatchObject({ decision: 'SESSION_MISMATCH' });
    expect(() =>
      gate.validate({
        ...input,
        binding: { ...binding, authorizationId: '99999999-9999-4999-a999-999999999999' },
      }),
    ).toThrow();
  });

  it('rejects credentials and action fields', () => {
    expect(() => gate.validate({ ...input, token: 'jwt' })).toThrow();
    expect(() => gate.validate({ ...input, secret: 'key' })).toThrow();
    expect(() => gate.validate({ ...input, command: 'buy' })).toThrow();
    expect(() => gate.validate({ ...input, payment: 'pix' })).toThrow();
  });
});
