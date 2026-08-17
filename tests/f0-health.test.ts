import { describe, expect, it } from 'vitest';
import { buildCollectorHealth, buildDegradedCollectorHealth } from '@scout/collection';
import { ConnectorError } from '@scout/domain';

const runId = '11111111-1111-4111-8111-111111111111';
const sourceId = '22222222-2222-4222-8222-222222222222';
const checkedAt = new Date('2026-08-11T12:00:00.000Z');

describe('F0 semantic collector health', () => {
  it('marks a non-empty validated result as NORMAL and complete', () => {
    const health = buildCollectorHealth(
      runId,
      1,
      sourceId,
      {
        provider: 'ebay-mock-v1',
        pagesFetched: 1,
        items: [
          {
            preview: {
              externalId: 'item-1',
              url: 'https://www.ebay.com/itm/item-1',
              title: 'Fixture',
              price: { amountMinor: 100, currency: 'USD' },
            },
            payload: {},
          },
        ],
      },
      1,
      checkedAt,
    );
    expect(health).toMatchObject({
      collectionRunId: runId,
      attemptNumber: 1,
      state: 'NORMAL',
      completeness: { listingIdPercent: 100, pricePercent: 100, titlePercent: 100 },
    });
  });

  it('marks an empty valid result as EMPTY_RESULTS without claiming completeness', () => {
    const health = buildCollectorHealth(
      runId,
      1,
      sourceId,
      { provider: 'ebay-mock-v1', pagesFetched: 1, items: [] },
      1,
      checkedAt,
    );
    expect(health).toMatchObject({
      state: 'EMPTY_RESULTS',
      completeness: { listingIdPercent: 0, pricePercent: 0, titlePercent: 0 },
    });
  });

  it.each([
    ['EBAY_RATE_LIMITED', 'RATE_LIMITED'],
    ['EBAY_OAUTH_REJECTED', 'LOGIN_REQUIRED'],
    ['EBAY_UNAUTHORIZED', 'LOGIN_REQUIRED'],
    ['EBAY_SEARCH_INVALID_RESPONSE', 'CONTENT_CHANGED'],
    ['EBAY_INVALID_JSON', 'CONTENT_CHANGED'],
    ['EBAY_PAGINATION_INVALID', 'CONTENT_CHANGED'],
    ['CURSOR_LOOP', 'CONTENT_CHANGED'],
    ['EBAY_API_UNAVAILABLE', 'ERROR'],
  ] as const)('maps sanitized error code %s to %s', (code, expectedState) => {
    const health = buildDegradedCollectorHealth(
      runId,
      2,
      sourceId,
      'ebay-api-production-v1',
      1,
      new ConnectorError('Safe internal message.', 'transient', code),
      checkedAt,
    );
    expect(health.state).toBe(expectedState);
    expect(health.diagnostics).toEqual([code]);
    expect(JSON.stringify(health)).not.toContain('Safe internal message.');
  });
});
