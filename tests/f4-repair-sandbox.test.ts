import { describe, expect, it } from 'vitest';
import { RepairSandboxRunner } from '@scout/collection';
import type { RepairProposal } from '@scout/domain';

const proposal: RepairProposal = {
  version: 'repair-proposal.v1',
  status: 'APPROVED',
  source: 'ebay',
  provider: 'ebay-api-mock-v1',
  failureClass: 'network',
  stableCode: 'COLLECTOR_NETWORK_RETRYABLE',
  changeSummary: 'Reproduzir timeout no fixture.',
  fixtures: [
    { id: 'fixture-a', description: 'A' },
    { id: 'fixture-b', description: 'B' },
    { id: 'fixture-c', description: 'C' },
    { id: 'fixture-d', description: 'D' },
  ],
  canary: { percentage: 25 },
  budget: { maxExecutions: 10, windowSeconds: 60 },
  rollbackConditions: ['Qualquer falha de replay.'],
  requiresHumanApproval: true,
  executable: false,
};

describe('F4.4 repair sandbox runner', () => {
  const runner = new RepairSandboxRunner();

  it('requires sandbox, explicit approval and APPROVED lifecycle', async () => {
    await expect(
      runner.run({ proposal, environment: 'production', approved: true }, async () => ({
        fixtureId: 'fixture-a',
        passed: true,
        durationMs: 1,
      })),
    ).rejects.toThrow();
    await expect(
      runner.run(
        { proposal: { ...proposal, status: 'PROPOSED' }, environment: 'sandbox', approved: true },
        async () => ({
          fixtureId: 'fixture-a',
          passed: true,
          durationMs: 1,
        }),
      ),
    ).rejects.toThrow();
  });

  it('selects the prefix deterministically and never exceeds the canary', async () => {
    const seen: string[] = [];
    const result = await runner.run(
      { proposal, environment: 'sandbox', approved: true },
      async (fixture) => {
        seen.push(fixture.id);
        return { fixtureId: fixture.id, passed: true, durationMs: 2 };
      },
    );

    expect(seen).toEqual(['fixture-a']);
    expect(result).toMatchObject({
      status: 'COMPLETED',
      executedCount: 1,
      passedCount: 1,
      failedCount: 0,
      canaryUsed: 25,
      rollbackApplied: false,
      executable: false,
    });
  });

  it('also caps replay by the proposal execution budget', async () => {
    const budgetedProposal: RepairProposal = {
      ...proposal,
      fixtures: Array.from({ length: 20 }, (_, index) => ({
        id: `fixture-${index}`,
        description: `Fixture ${index}`,
      })),
      budget: { maxExecutions: 2, windowSeconds: 60 },
    };
    let calls = 0;
    const result = await runner.run(
      { proposal: budgetedProposal, environment: 'sandbox', approved: true },
      async (fixture) => {
        calls += 1;
        return { fixtureId: fixture.id, passed: true, durationMs: 1 };
      },
    );

    expect(calls).toBe(2);
    expect(result.executedCount).toBe(2);
  });

  it('stops on malformed or failed replay and reports rollback without exposing the error', async () => {
    const result = await runner.run(
      { proposal, environment: 'sandbox', approved: true },
      async () => {
        throw new Error('secret shell command must not escape');
      },
    );

    expect(result).toMatchObject({
      status: 'ROLLED_BACK',
      executedCount: 1,
      passedCount: 0,
      failedCount: 1,
      rollbackApplied: true,
      executable: false,
    });
    expect(JSON.stringify(result)).not.toContain('secret shell command');
  });

  it('rejects unsafe fields and does not invoke replay when validation fails', async () => {
    let invoked = false;
    await expect(
      runner.run(
        { proposal, environment: 'sandbox', approved: true, shell: 'rm -rf' },
        async () => {
          invoked = true;
          return { fixtureId: 'fixture-a', passed: true, durationMs: 1 };
        },
      ),
    ).rejects.toThrow();
    expect(invoked).toBe(false);
  });
});
