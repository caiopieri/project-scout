import type { RepairProposal, RepairProposalRepository } from '@scout/domain';
import { repairProposalSchema } from '@scout/schemas';
import { SqlExecutor } from '../../sql/SqlExecutor';

interface RepairProposalRow {
  version: string;
  status: string;
  source: string;
  provider: string;
  failure_class: string;
  stable_code: string;
  change_summary: string;
  fixtures: unknown;
  canary_percentage: string | number;
  max_executions: number;
  window_seconds: number;
  rollback_conditions: unknown;
  requires_human_approval: boolean;
  executable: boolean;
}

const repairProposalFilterSchema = repairProposalSchema.pick({ source: true, provider: true });

const mapRow = (row: RepairProposalRow): RepairProposal =>
  repairProposalSchema.parse({
    version: row.version,
    status: row.status,
    source: row.source,
    provider: row.provider,
    failureClass: row.failure_class,
    stableCode: row.stable_code,
    changeSummary: row.change_summary,
    fixtures: row.fixtures,
    canary: { percentage: Number(row.canary_percentage) },
    budget: {
      maxExecutions: row.max_executions,
      windowSeconds: row.window_seconds,
    },
    rollbackConditions: row.rollback_conditions,
    requiresHumanApproval: row.requires_human_approval,
    executable: row.executable,
  });

const selectColumns = `
  version, status, source, provider, failure_class, stable_code,
  change_summary, fixtures, canary_percentage, max_executions,
  window_seconds, rollback_conditions, requires_human_approval, executable`;

export class PgRepairProposalRepository implements RepairProposalRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async save(proposal: RepairProposal): Promise<RepairProposal> {
    const validated = repairProposalSchema.parse(proposal);
    const result = await this.sql.query<RepairProposalRow>(
      `INSERT INTO collector_repair_proposals (
         version, status, source, provider, failure_class, stable_code,
         change_summary, fixtures, canary_percentage, max_executions,
         window_seconds, rollback_conditions, requires_human_approval, executable
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12::jsonb, $13, $14)
       RETURNING ${selectColumns}`,
      [
        validated.version,
        validated.status,
        validated.source,
        validated.provider,
        validated.failureClass,
        validated.stableCode,
        validated.changeSummary,
        JSON.stringify(validated.fixtures),
        validated.canary.percentage,
        validated.budget.maxExecutions,
        validated.budget.windowSeconds,
        JSON.stringify(validated.rollbackConditions),
        validated.requiresHumanApproval,
        validated.executable,
      ],
    );

    if (!result.rows[0]) throw new Error('Repair proposal insert returned no result.');
    return mapRow(result.rows[0]);
  }

  async findBySourceAndProvider(source: string, provider: string): Promise<RepairProposal[]> {
    const validated = repairProposalFilterSchema.parse({ source, provider });
    const result = await this.sql.query<RepairProposalRow>(
      `SELECT ${selectColumns}
       FROM collector_repair_proposals
       WHERE source = $1 AND provider = $2
       ORDER BY created_at ASC, id ASC`,
      [validated.source, validated.provider],
    );
    return result.rows.map(mapRow);
  }
}
