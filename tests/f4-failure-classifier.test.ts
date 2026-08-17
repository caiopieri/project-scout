import { describe, expect, it } from 'vitest';
import {
  COLLECTOR_FAILURE_RETRY_LIMIT,
  COLLECTOR_FAILURE_RULE_VERSION,
  FailureClassifier,
} from '@scout/collection';
import { ConnectorError } from '@scout/domain';
import {
  collectorFailureClassificationSchema,
  collectorFailureInputSchema,
} from '@scout/schemas';

const baseFailure = {
  source: 'ebay',
  provider: 'ebay-api-mock-v1',
  kind: 'permanent' as const,
  timestamp: new Date('2026-08-14T12:00:00.000Z'),
};

describe('F4.1 deterministic collector failure classifier', () => {
  const classifier = new FailureClassifier();

  it.each([
    ['PARSER_INVALID_RESPONSE', 'parser', 'COLLECTOR_PARSER_INVALID'],
    ['NETWORK_TIMEOUT', 'network', 'COLLECTOR_NETWORK_RETRYABLE'],
    ['OAUTH_REJECTED', 'auth', 'COLLECTOR_AUTH_REQUIRED'],
    ['PROXY_UNAVAILABLE', 'proxy', 'COLLECTOR_PROXY_RETRYABLE'],
    ['CONTENT_CHANGED', 'semantic', 'COLLECTOR_SEMANTIC_CONTENT_CHANGED'],
    ['UNRECOGNIZED_PROVIDER_FAILURE', 'source', 'COLLECTOR_SOURCE_UNCLASSIFIED'],
  ] as const)('classifies %s as %s with stable code %s', (code, failureClass, stableCode) => {
    const result = classifier.classify({ ...baseFailure, code });

    expect(result).toMatchObject({ failureClass, stableCode });
    expect(result.ruleVersion).toBe(COLLECTOR_FAILURE_RULE_VERSION);
    expect(() => collectorFailureClassificationSchema.parse(result)).not.toThrow();
  });

  it.each([
    ['CONTENT_CHANGED', 'CONTENT_CHANGED'],
    ['MODAL_BLOCKING', 'MODAL_BLOCKING'],
  ] as const)('prioritizes semantic health state %s', (healthState, expectedState) => {
    const result = classifier.classify({
      ...baseFailure,
      code: 'UNKNOWN_PROVIDER_CODE',
      healthState,
    });

    expect(result).toMatchObject({
      failureClass: 'semantic',
      retryAllowed: false,
      retryLimit: 0,
      stableCode: `COLLECTOR_SEMANTIC_${expectedState}`,
    });
  });

  it('allows only the contract retry limit for transient network and proxy failures', () => {
    const network = classifier.classify({
      ...baseFailure,
      code: 'NETWORK_TIMEOUT',
      kind: 'transient',
    });
    const rateLimited = classifier.classify({
      ...baseFailure,
      code: 'RATE_LIMITED',
      kind: 'transient',
    });

    expect(network).toMatchObject({
      failureClass: 'network',
      retryAllowed: true,
      retryLimit: COLLECTOR_FAILURE_RETRY_LIMIT,
    });
    expect(rateLimited).toMatchObject({
      failureClass: 'proxy',
      retryAllowed: true,
      retryLimit: COLLECTOR_FAILURE_RETRY_LIMIT,
    });
  });

  it('does not retry auth, parser, or permanent infrastructure failures', () => {
    for (const input of [
      { ...baseFailure, code: 'LOGIN_REQUIRED', kind: 'transient' as const },
      { ...baseFailure, code: 'PARSER_INVALID', kind: 'transient' as const },
      { ...baseFailure, code: 'NETWORK_TIMEOUT', kind: 'permanent' as const },
    ]) {
      expect(classifier.classify(input)).toMatchObject({
        retryAllowed: false,
        retryLimit: 0,
      });
    }
  });

  it('validates input before classification and does not expose external messages', () => {
    expect(() => classifier.classify({ ...baseFailure, code: '' })).toThrow();
    expect(() => classifier.classify({ ...baseFailure, code: 'x', timestamp: 'not-a-date' })).toThrow();

    const result = classifier.classifyError(
      new ConnectorError('Do not expose this message.', 'permanent', 'LOGIN_REQUIRED'),
      {
        source: baseFailure.source,
        provider: baseFailure.provider,
        timestamp: baseFailure.timestamp,
      },
    );
    expect(JSON.stringify(result)).not.toContain('Do not expose this message.');
    expect(collectorFailureInputSchema.safeParse({ ...baseFailure, code: '' }).success).toBe(false);
  });
});
