import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import type { RepairProposal } from '@scout/domain';
import { PgRepairProposalRepository, type SqlExecutor, type SqlQueryResult } from '@scout/database';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260815021747_f4_collector_repair_proposals.sql',
);
const dbUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:54322/postgres';

const proposal: RepairProposal = {
  version: 'repair-proposal.v1',
  status: 'PROPOSED',
  source: 'ebay',
  provider: 'ebay-api-mock-v1',
  failureClass: 'network',
  stableCode: 'COLLECTOR_NETWORK_RETRYABLE',
  changeSummary: 'Ajustar a leitura do timeout do provider.',
  fixtures: [{ id: 'network-timeout', description: 'Resposta fixture com timeout.' }],
  canary: { percentage: 25 },
  budget: { maxExecutions: 10, windowSeconds: 3600 },
  rollbackConditions: ['Qualquer aumento de erro na fixture de timeout.'],
  requiresHumanApproval: true,
  executable: false,
};

interface RepairProposalDbRow {
  version: string;
  status: string;
  source: string;
  provider: string;
  failure_class: string;
  stable_code: string;
  change_summary: string;
  fixtures: unknown;
  canary_percentage: number;
  max_executions: number;
  window_seconds: number;
  rollback_conditions: unknown;
  requires_human_approval: boolean;
  executable: boolean;
}

class RecordingSqlExecutor implements SqlExecutor {
  readonly calls: Array<{ sql: string; params: unknown[] }> = [];

  constructor(private readonly rows: RepairProposalDbRow[]) {}

  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<SqlQueryResult<T>> {
    this.calls.push({ sql, params });
    return { rows: this.rows as T[], rowCount: this.rows.length };
  }
}

const dbRow: RepairProposalDbRow = {
  version: proposal.version,
  status: proposal.status,
  source: proposal.source,
  provider: proposal.provider,
  failure_class: proposal.failureClass,
  stable_code: proposal.stableCode,
  change_summary: proposal.changeSummary,
  fixtures: proposal.fixtures,
  canary_percentage: proposal.canary.percentage,
  max_executions: proposal.budget.maxExecutions,
  window_seconds: proposal.budget.windowSeconds,
  rollback_conditions: proposal.rollbackConditions,
  requires_human_approval: proposal.requiresHumanApproval,
  executable: proposal.executable,
};

describe('F4.3 repair proposal PostgreSQL adapter', () => {
  it('defines the service-role-only table and forbids privileged escape hatches', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.collector_repair_proposals');
    expect(sql).toContain(
      'canary_percentage NUMERIC NOT NULL CHECK (canary_percentage BETWEEN 0 AND 25)',
    );
    expect(sql).toContain(
      'max_executions INTEGER NOT NULL CHECK (max_executions BETWEEN 1 AND 10)',
    );
    expect(sql).toContain(
      'window_seconds INTEGER NOT NULL CHECK (window_seconds BETWEEN 1 AND 3600)',
    );
    expect(sql).toContain(
      'requires_human_approval BOOLEAN NOT NULL CHECK (requires_human_approval IS TRUE)',
    );
    expect(sql).toContain('executable BOOLEAN NOT NULL CHECK (executable IS FALSE)');
    expect(sql).toContain(
      'REVOKE ALL ON public.collector_repair_proposals FROM PUBLIC, anon, authenticated',
    );
    expect(sql).toContain('GRANT ALL ON public.collector_repair_proposals TO service_role');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).not.toContain('SECURITY DEFINER');
    expect(sql).not.toContain('auth.role');
  });

  it('validates, parameterizes, and maps the complete contract without persistence metadata', async () => {
    const sql = new RecordingSqlExecutor([dbRow]);
    const repository = new PgRepairProposalRepository(sql);

    await expect(repository.save(proposal)).resolves.toEqual(proposal);
    expect(sql.calls[0].sql).toContain(
      'VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12::jsonb, $13, $14)',
    );
    expect(sql.calls[0].sql).not.toContain('patch');
    expect(sql.calls[0].sql).not.toContain('secret');
    expect(sql.calls[0].params).toEqual([
      proposal.version,
      proposal.status,
      proposal.source,
      proposal.provider,
      proposal.failureClass,
      proposal.stableCode,
      proposal.changeSummary,
      JSON.stringify(proposal.fixtures),
      proposal.canary.percentage,
      proposal.budget.maxExecutions,
      proposal.budget.windowSeconds,
      JSON.stringify(proposal.rollbackConditions),
      proposal.requiresHumanApproval,
      proposal.executable,
    ]);
  });

  it('validates filters and every row at the repository boundary', async () => {
    const sql = new RecordingSqlExecutor([dbRow]);
    const repository = new PgRepairProposalRepository(sql);

    await expect(repository.findBySourceAndProvider('Ebay', proposal.provider)).rejects.toThrow();
    expect(sql.calls).toHaveLength(0);

    const malformedSql = new RecordingSqlExecutor([
      { ...dbRow, fixtures: [{ id: 'missing-description' }] },
    ]);
    const malformedRepository = new PgRepairProposalRepository(malformedSql);
    await expect(
      malformedRepository.findBySourceAndProvider(proposal.source, proposal.provider),
    ).rejects.toThrow();
  });
});

describe('F4.3 repair proposal live RLS boundary', () => {
  let client: Client | null = null;
  let available = false;

  beforeAll(async () => {
    client = new Client({ connectionString: dbUrl });
    try {
      await client.connect();
      available = true;
    } catch {
      await client.end().catch(() => undefined);
      client = null;
    }
  });

  afterAll(async () => {
    await client?.query('RESET ROLE').catch(() => undefined);
    await client?.end().catch(() => undefined);
  });

  it('allows service-role write/read and rejects malformed rows after mapping', async (context) => {
    if (!available || !client) {
      context.skip();
      return;
    }

    const provider = `test-${crypto.randomUUID().slice(0, 8)}`;
    const serviceSql: SqlExecutor = {
      query: async <T = Record<string, unknown>>(
        sql: string,
        params: unknown[] = [],
      ): Promise<SqlQueryResult<T>> => {
        if (!client) throw new Error('Database client is unavailable.');
        const result = await client.query(sql, params);
        return {
          rows: result.rows as T[],
          rowCount: result.rowCount ?? 0,
        };
      },
    };
    const repository = new PgRepairProposalRepository(serviceSql);

    try {
      await client.query('SET ROLE service_role');
      const saved = await repository.save({ ...proposal, provider });
      expect(saved.provider).toBe(provider);
      expect(await repository.findBySourceAndProvider(proposal.source, provider)).toEqual([saved]);

      await client.query(
        `INSERT INTO collector_repair_proposals (
           version, status, source, provider, failure_class, stable_code,
           change_summary, fixtures, canary_percentage, max_executions,
           window_seconds, rollback_conditions, requires_human_approval, executable
         ) VALUES ('repair-proposal.v1', 'PROPOSED', 'ebay', $1, 'network',
                   'COLLECTOR_NETWORK_RETRYABLE', 'malformed fixture',
                   $2::jsonb, 0, 1, 1, '["rollback"]'::jsonb, true, false)`,
        [provider, JSON.stringify([{ id: 'missing-description' }])],
      );
      await expect(repository.findBySourceAndProvider(proposal.source, provider)).rejects.toThrow();

      await client.query('RESET ROLE');
      for (const role of ['anon', 'authenticated'] as const) {
        await client.query(`SET ROLE ${role}`);
        await expect(
          client.query('SELECT id FROM collector_repair_proposals WHERE provider = $1', [provider]),
        ).rejects.toThrow();
        await expect(
          client.query(
            `INSERT INTO collector_repair_proposals (
               version, status, source, provider, failure_class, stable_code,
               change_summary, fixtures, canary_percentage, max_executions,
               window_seconds, rollback_conditions, requires_human_approval, executable
             ) VALUES ('repair-proposal.v1', 'PROPOSED', 'ebay', $1, 'network',
                       'COLLECTOR_NETWORK_RETRYABLE', 'forbidden',
                       '[{"id":"fixture","description":"forbidden"}]'::jsonb,
                       0, 1, 1, '["rollback"]'::jsonb, true, false)`,
            [provider],
          ),
        ).rejects.toThrow();
        await client.query('RESET ROLE');
      }
    } finally {
      await client.query('SET ROLE service_role');
      await client.query('DELETE FROM collector_repair_proposals WHERE provider = $1', [provider]);
      await client.query('RESET ROLE');
    }
  });

  it('enforces SQL limits for canary and executability', async (context) => {
    if (!available || !client) {
      context.skip();
      return;
    }

    await client.query('SET ROLE service_role');
    try {
      await expect(
        client.query(
          `INSERT INTO collector_repair_proposals (
             version, status, source, provider, failure_class, stable_code,
             change_summary, fixtures, canary_percentage, max_executions,
             window_seconds, rollback_conditions, requires_human_approval, executable
           ) VALUES ('repair-proposal.v1', 'PROPOSED', 'ebay', 'sql-limit-test', 'network',
                     'COLLECTOR_NETWORK_RETRYABLE', 'invalid canary',
                     '[{"id":"fixture","description":"invalid"}]'::jsonb,
                     26, 1, 1, '["rollback"]'::jsonb, true, false)`,
        ),
      ).rejects.toThrow();
      await expect(
        client.query(
          `INSERT INTO collector_repair_proposals (
             version, status, source, provider, failure_class, stable_code,
             change_summary, fixtures, canary_percentage, max_executions,
             window_seconds, rollback_conditions, requires_human_approval, executable
           ) VALUES ('repair-proposal.v1', 'PROPOSED', 'ebay', 'sql-executable-test', 'network',
                     'COLLECTOR_NETWORK_RETRYABLE', 'invalid executable',
                     '[{"id":"fixture","description":"invalid"}]'::jsonb,
                     0, 1, 1, '["rollback"]'::jsonb, true, true)`,
        ),
      ).rejects.toThrow();
    } finally {
      await client.query('RESET ROLE');
    }
  });
});
