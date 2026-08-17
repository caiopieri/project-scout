import { describe, expect, it } from 'vitest';
import { RepairProposalBuilder } from '@scout/collection';
import { repairProposalSchema } from '@scout/schemas';

const baseInput = {
  source: 'ebay',
  provider: 'ebay-api-mock-v1',
  failureClass: 'network' as const,
  stableCode: 'COLLECTOR_NETWORK_RETRYABLE',
  changeSummary: 'Ajustar a leitura do timeout do provider.',
  fixtures: [{ id: 'network-timeout', description: 'Resposta fixture com timeout.' }],
  canary: { percentage: 25 },
  budget: { maxExecutions: 10, windowSeconds: 3600 },
  rollbackConditions: ['Qualquer aumento de erro na fixture de timeout.'],
};

describe('F4.2 safe repair proposal builder', () => {
  const builder = new RepairProposalBuilder();

  it('builds a deterministic, versioned, proposed and non-executable artifact', () => {
    const first = builder.build(baseInput);
    const second = builder.build(baseInput);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      version: 'repair-proposal.v1',
      status: 'PROPOSED',
      source: 'ebay',
      provider: 'ebay-api-mock-v1',
      failureClass: 'network',
      stableCode: 'COLLECTOR_NETWORK_RETRYABLE',
      requiresHumanApproval: true,
      executable: false,
    });
    expect(() => repairProposalSchema.parse(first)).not.toThrow();
  });

  it.each([
    ['canary above 25%', { canary: { percentage: 25.01 } }],
    ['too many executions', { budget: { maxExecutions: 11, windowSeconds: 3600 } }],
    ['budget window above 3600 seconds', { budget: { maxExecutions: 10, windowSeconds: 3601 } }],
  ])('rejects %s before building a proposal', (_caseName, override) => {
    expect(() => builder.build({ ...baseInput, ...override })).toThrow();
  });

  it('requires at least one fixture and rejects malformed external input', () => {
    expect(() => builder.build({ ...baseInput, fixtures: [] })).toThrow();
    expect(() => builder.build({ ...baseInput, source: '../ebay' })).toThrow();
    expect(() => builder.build({ ...baseInput, stableCode: 'not-a-f4-code' })).toThrow();
  });

  it.each([
    { executable: true },
    { patchBody: 'return true' },
    { shell: 'npm run repair' },
    { secret: 'token' },
    { status: 'APPROVED' },
  ])('rejects unsafe or lifecycle fields supplied by the caller: %s', (unsafeFields) => {
    expect(() => builder.build({ ...baseInput, ...unsafeFields })).toThrow();
  });

  it('preserves the received connector scope and F4.1 stable classification code', () => {
    const proposal = builder.build({
      ...baseInput,
      source: 'mercadolivre',
      provider: 'mercadolivre-mock-v1',
      failureClass: 'auth',
      stableCode: 'COLLECTOR_AUTH_REQUIRED',
    });

    expect(proposal).toMatchObject({
      source: 'mercadolivre',
      provider: 'mercadolivre-mock-v1',
      failureClass: 'auth',
      stableCode: 'COLLECTOR_AUTH_REQUIRED',
      status: 'PROPOSED',
    });
  });
});
