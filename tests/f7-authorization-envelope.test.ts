import { describe, expect, it } from 'vitest';
import { DeterministicAuthorizationEnvelopeBuilder } from '@scout/valuation';

const request = {
  authorizationId: '6e29d8c4-a818-4c5e-89de-7f2e91188b8d',
  userId: '11111111-1111-4111-a111-111111111111',
  category: 'electronics' as const,
  source: 'ebay' as const,
  externalId: 'ebay-42',
  action: 'BUY' as const,
  currency: 'BRL' as const,
  quantity: 2,
  unitPriceMinor: 50000,
  totalCostMinor: 100000,
  maxTotalCostMinor: 120000,
  issuedAt: '2026-08-15T12:00:00.000Z',
  expiresAt: '2026-08-15T13:00:00.000Z',
  idempotencyKey: 'auth-ebay-42-001',
};

describe('F7.1 authorization envelope without executor', () => {
  const builder = new DeterministicAuthorizationEnvelopeBuilder();

  it('builds a pending, bounded envelope for allowed actions', () => {
    for (const action of ['BUY', 'BID', 'SEND_MESSAGE'] as const) {
      const envelope = builder.build({ ...request, action });
      expect(envelope).toMatchObject({
        authorizationVersion: 'authorization-envelope.v1',
        action,
        totalCostMinor: 100000,
        status: 'PENDING_HUMAN_APPROVAL',
        humanApproved: false,
        executable: false,
      });
      expect(envelope.authorizationId).toBe(request.authorizationId);
    }
  });

  it('rejects inconsistent cost, limit, expiry and idempotency key', () => {
    expect(() => builder.build({ ...request, totalCostMinor: 90000 })).toThrow();
    expect(() => builder.build({ ...request, maxTotalCostMinor: 90000 })).toThrow();
    expect(() => builder.build({ ...request, expiresAt: request.issuedAt })).toThrow();
    expect(() => builder.build({ ...request, idempotencyKey: 'short' })).toThrow();
    expect(() => builder.build({ ...request, quantity: Number.MAX_SAFE_INTEGER })).toThrow();
  });

  it('rejects unknown sources, non-electronics and dangerous fields', () => {
    expect(() => builder.build({ ...request, source: 'olx' })).toThrow();
    expect(() => builder.build({ ...request, category: 'vehicles' })).toThrow();
    expect(() => builder.build({ ...request, payment: 'pix' })).toThrow();
    expect(() => builder.build({ ...request, secret: 'token' })).toThrow();
    expect(() => builder.build({ ...request, command: 'buy' })).toThrow();
    expect(() => builder.build({ ...request, send: true })).toThrow();
  });
});
