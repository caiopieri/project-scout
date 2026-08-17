import { ConnectorError, type CollectorFailureClassifier } from '@scout/domain';
import {
  collectorFailureClassificationSchema,
  collectorFailureInputSchema,
  type CollectorFailureClass,
  type CollectorFailureClassification,
  type CollectorFailureInput,
  type CollectorHealthState,
} from '@scout/schemas';

export const COLLECTOR_FAILURE_RULE_VERSION = 'collector-failure-rules.v1';
export const COLLECTOR_FAILURE_RETRY_LIMIT = 2;

const hasCodeToken = (code: string, tokens: readonly string[]): boolean =>
  tokens.some((token) => code.includes(token));

const semanticStableCode = (state: CollectorHealthState): string =>
  state === 'CONTENT_CHANGED'
    ? 'COLLECTOR_SEMANTIC_CONTENT_CHANGED'
    : state === 'MODAL_BLOCKING'
      ? 'COLLECTOR_SEMANTIC_MODAL_BLOCKING'
      : 'COLLECTOR_SEMANTIC_FAILURE';

interface FailureDecision {
  failureClass: CollectorFailureClass;
  retryAllowed: boolean;
  retryLimit: number;
  stableCode: string;
}

const decision = (
  failureClass: CollectorFailureClass,
  stableCode: string,
  input: CollectorFailureInput,
  retryable = false,
): FailureDecision => {
  const retryAllowed = retryable && input.kind === 'transient';
  return {
    failureClass,
    retryAllowed,
    retryLimit: retryAllowed ? COLLECTOR_FAILURE_RETRY_LIMIT : 0,
    stableCode,
  };
};

const decide = (input: CollectorFailureInput): FailureDecision => {
  const code = input.code.toUpperCase();
  const semanticState =
    input.healthState === 'CONTENT_CHANGED' || input.healthState === 'MODAL_BLOCKING'
      ? input.healthState
      : code.includes('MODAL_BLOCKING')
        ? 'MODAL_BLOCKING'
        : code.includes('CONTENT_CHANGED')
          ? 'CONTENT_CHANGED'
          : undefined;

  if (semanticState)
    return decision('semantic', semanticStableCode(semanticState), input);
  if (input.healthState === 'LOGIN_REQUIRED' || input.healthState === 'CAPTCHA')
    return decision('auth', 'COLLECTOR_AUTH_REQUIRED', input);
  if (input.healthState === 'RATE_LIMITED')
    return decision('proxy', 'COLLECTOR_PROXY_RATE_LIMITED', input, true);
  if (
    hasCodeToken(code, [
      'AUTH',
      'LOGIN',
      'OAUTH',
      'CREDENTIAL',
      'TOKEN_EXPIRED',
      'UNAUTHORIZED',
      'FORBIDDEN',
    ])
  )
    return decision('auth', 'COLLECTOR_AUTH_REQUIRED', input);
  if (hasCodeToken(code, ['PROXY', 'RATE_LIMIT', 'RATE-LIMIT']))
    return decision('proxy', 'COLLECTOR_PROXY_RETRYABLE', input, true);
  if (
    hasCodeToken(code, [
      'NETWORK',
      'TIMEOUT',
      'UNAVAILABLE',
      'CONNECTION',
      'FETCH_FAILED',
      'HTTP_5',
    ])
  )
    return decision('network', 'COLLECTOR_NETWORK_RETRYABLE', input, true);
  if (
    hasCodeToken(code, [
      'PARSER',
      'PARSE_',
      'NORMALIZATION',
      'MAPPING',
      'DESERIALIZATION',
      'SCHEMA_INVALID',
    ])
  )
    return decision('parser', 'COLLECTOR_PARSER_INVALID', input);
  return decision('source', 'COLLECTOR_SOURCE_UNCLASSIFIED', input);
};

export class FailureClassifier implements CollectorFailureClassifier {
  constructor(private readonly ruleVersion = COLLECTOR_FAILURE_RULE_VERSION) {}

  classify(rawInput: unknown): CollectorFailureClassification {
    const input = collectorFailureInputSchema.parse(rawInput);
    return collectorFailureClassificationSchema.parse({
      ...decide(input),
      ruleVersion: this.ruleVersion,
    });
  }

  classifyError(
    error: ConnectorError,
    context: Omit<CollectorFailureInput, 'code' | 'kind'>,
  ): CollectorFailureClassification {
    return this.classify({ ...context, code: error.code, kind: error.kind });
  }
}
