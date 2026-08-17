import type { RepairSandboxRun, RepairSandboxRunRepository } from '@scout/domain';
import { repairSandboxRunResultSchema, repairSandboxRunSchema } from '@scout/schemas';
import { SqlExecutor } from '../../sql/SqlExecutor';

interface RepairSandboxRunRow {
  id: string;
  proposal_version: string;
  proposal_source: string;
  proposal_provider: string;
  status: string;
  environment: string;
  fixture_results: unknown;
  executed_count: number;
  passed_count: number;
  failed_count: number;
  canary_used: string | number;
  rollback_applied: boolean;
  executable: boolean;
  created_at: string;
}

const mapRow = (row: RepairSandboxRunRow): RepairSandboxRun =>
  repairSandboxRunSchema.parse({
    id: row.id,
    proposalVersion: row.proposal_version,
    proposalSource: row.proposal_source,
    proposalProvider: row.proposal_provider,
    status: row.status,
    environment: row.environment,
    fixtureResults: row.fixture_results,
    executedCount: row.executed_count,
    passedCount: row.passed_count,
    failedCount: row.failed_count,
    canaryUsed: Number(row.canary_used),
    rollbackApplied: row.rollback_applied,
    executable: row.executable,
    createdAt: new Date(row.created_at),
  });

const columns = `
  id, proposal_version, proposal_source, proposal_provider, status,
  environment, fixture_results, executed_count, passed_count, failed_count,
  canary_used, rollback_applied, executable, created_at`;

export class PgRepairSandboxRunRepository implements RepairSandboxRunRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async save(run: Omit<RepairSandboxRun, 'id' | 'createdAt'>): Promise<RepairSandboxRun> {
    const validated = repairSandboxRunResultSchema.parse({
      status: run.status,
      environment: run.environment,
      fixtureResults: run.fixtureResults,
      executedCount: run.executedCount,
      passedCount: run.passedCount,
      failedCount: run.failedCount,
      canaryUsed: run.canaryUsed,
      rollbackApplied: run.rollbackApplied,
      executable: run.executable,
    });
    const result = await this.sql.query<RepairSandboxRunRow>(
      `INSERT INTO collector_repair_runs (
         proposal_version, proposal_source, proposal_provider, status,
         environment, fixture_results, executed_count, passed_count, failed_count,
         canary_used, rollback_applied, executable
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12)
       RETURNING ${columns}`,
      [
        run.proposalVersion,
        run.proposalSource,
        run.proposalProvider,
        validated.status,
        validated.environment,
        JSON.stringify(validated.fixtureResults),
        validated.executedCount,
        validated.passedCount,
        validated.failedCount,
        validated.canaryUsed,
        validated.rollbackApplied,
        validated.executable,
      ],
    );
    if (!result.rows[0]) throw new Error('Repair sandbox run insert returned no result.');
    return mapRow(result.rows[0]);
  }

  async findBySourceAndProvider(source: string, provider: string): Promise<RepairSandboxRun[]> {
    const result = await this.sql.query<RepairSandboxRunRow>(
      `SELECT ${columns}
       FROM collector_repair_runs
       WHERE proposal_source = $1 AND proposal_provider = $2
       ORDER BY created_at ASC, id ASC`,
      [source, provider],
    );
    return result.rows.map(mapRow);
  }
}
