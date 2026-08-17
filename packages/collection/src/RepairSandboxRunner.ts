import { type RepairSandboxRunner as RepairSandboxRunnerPort } from '@scout/domain';
import {
  repairReplayResultSchema,
  repairSandboxRunInputSchema,
  repairSandboxRunResultSchema,
  type RepairProposalFixture,
  type RepairSandboxRunResult,
} from '@scout/schemas';

export class RepairSandboxRunner implements RepairSandboxRunnerPort {
  async run(
    rawInput: unknown,
    replay: (fixture: RepairProposalFixture) => Promise<unknown>,
  ): Promise<RepairSandboxRunResult> {
    const input = repairSandboxRunInputSchema.parse(rawInput);
    if (input.proposal.status !== 'APPROVED') {
      throw new Error('Sandbox replay requires an approved repair proposal.');
    }

    const { fixtures, canary, budget } = input.proposal;
    const selectedCount = Math.min(
      budget.maxExecutions,
      Math.floor((fixtures.length * canary.percentage) / 100),
    );
    const selectedFixtures = fixtures.slice(0, selectedCount);
    const fixtureResults = [];

    for (const fixture of selectedFixtures) {
      let result: ReturnType<typeof repairReplayResultSchema.parse>;
      try {
        result = repairReplayResultSchema.parse(await replay(fixture));
        if (result.fixtureId !== fixture.id) {
          result = { ...result, fixtureId: fixture.id, passed: false };
        }
      } catch {
        result = { fixtureId: fixture.id, passed: false, durationMs: 0 };
      }
      fixtureResults.push(result);
      if (!result.passed) break;
    }

    const passedCount = fixtureResults.filter((result) => result.passed).length;
    const failedCount = fixtureResults.length - passedCount;
    return repairSandboxRunResultSchema.parse({
      status: failedCount > 0 ? 'ROLLED_BACK' : 'COMPLETED',
      environment: 'sandbox',
      fixtureResults,
      executedCount: fixtureResults.length,
      passedCount,
      failedCount,
      canaryUsed: fixtures.length === 0 ? 0 : (fixtureResults.length / fixtures.length) * 100,
      rollbackApplied: failedCount > 0,
      executable: false,
    });
  }
}
