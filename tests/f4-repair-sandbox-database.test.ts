import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import {
  PgRepairSandboxRunRepository,
  type SqlExecutor,
  type SqlQueryResult,
} from '@scout/database';
import type { RepairSandboxRun } from '@scout/domain';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260815231107_collector_repair_runs.sql',
);
const dbUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:54322/postgres';
const run: Omit<RepairSandboxRun, 'id' | 'createdAt'> = {
  proposalVersion: 'repair-proposal.v1',
  proposalSource: 'ebay',
  proposalProvider: 'ebay-api-mock-v1',
  status: 'COMPLETED',
  environment: 'sandbox',
  fixtureResults: [{ fixtureId: 'fixture-a', passed: true, durationMs: 2 }],
  executedCount: 1,
  passedCount: 1,
  failedCount: 0,
  canaryUsed: 25,
  rollbackApplied: false,
  executable: false,
};

interface DbRow {
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
  canary_used: number;
  rollback_applied: boolean;
  executable: boolean;
  created_at: string;
}

class RecordingSql implements SqlExecutor {
  readonly calls: Array<{ sql: string; params: unknown[] }> = [];
  constructor(private readonly rows: DbRow[]) {}
  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<SqlQueryResult<T>> {
    this.calls.push({ sql, params });
    return { rows: this.rows as T[], rowCount: this.rows.length };
  }
}

const dbRow: DbRow = {
  id: '11111111-1111-4111-a111-111111111111',
  proposal_version: run.proposalVersion,
  proposal_source: run.proposalSource,
  proposal_provider: run.proposalProvider,
  status: run.status,
  environment: run.environment,
  fixture_results: run.fixtureResults,
  executed_count: run.executedCount,
  passed_count: run.passedCount,
  failed_count: run.failedCount,
  canary_used: run.canaryUsed,
  rollback_applied: run.rollbackApplied,
  executable: run.executable,
  created_at: '2026-08-15T23:11:07.000Z',
};

describe('F4.5 repair sandbox run adapter', () => {
  it('defines service-role-only persistence without executable fields', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.collector_repair_runs');
    expect(sql).toContain("environment TEXT NOT NULL CHECK (environment = 'sandbox')");
    expect(sql).toContain(
      'REVOKE ALL ON public.collector_repair_runs FROM PUBLIC, anon, authenticated',
    );
    expect(sql).toContain('GRANT ALL ON public.collector_repair_runs TO service_role');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).not.toContain('SECURITY DEFINER');
    expect(sql).not.toContain('auth.role');
  });

  it('validates, parameterizes and maps the run contract', async () => {
    const sql = new RecordingSql([dbRow]);
    const repository = new PgRepairSandboxRunRepository(sql);
    await expect(repository.save(run)).resolves.toMatchObject(run);
    expect(sql.calls[0].sql).toContain(
      'VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12)',
    );
    expect(sql.calls[0].params).toEqual([
      run.proposalVersion,
      run.proposalSource,
      run.proposalProvider,
      run.status,
      run.environment,
      JSON.stringify(run.fixtureResults),
      run.executedCount,
      run.passedCount,
      run.failedCount,
      run.canaryUsed,
      run.rollbackApplied,
      run.executable,
    ]);
  });

  it('rejects malformed rows at the schema boundary', async () => {
    const repository = new PgRepairSandboxRunRepository(
      new RecordingSql([{ ...dbRow, fixture_results: [{ fixtureId: 'bad', passed: true }] }]),
    );
    await expect(
      repository.findBySourceAndProvider(run.proposalSource, run.proposalProvider),
    ).rejects.toThrow();
  });
});

describe('F4.5 repair sandbox run live RLS boundary', () => {
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

  it('allows service-role write/read and denies public roles', async (context) => {
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
        return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
      },
    };
    const repository = new PgRepairSandboxRunRepository(serviceSql);
    try {
      await client.query('SET ROLE service_role');
      const saved = await repository.save({ ...run, proposalProvider: provider });
      expect(await repository.findBySourceAndProvider(run.proposalSource, provider)).toEqual([
        saved,
      ]);
      await client.query('RESET ROLE');
      for (const role of ['anon', 'authenticated'] as const) {
        await client.query(`SET ROLE ${role}`);
        await expect(
          client.query('SELECT id FROM collector_repair_runs WHERE proposal_provider = $1', [
            provider,
          ]),
        ).rejects.toThrow();
        await client.query('RESET ROLE');
      }
    } finally {
      await client.query('SET ROLE service_role');
      await client.query('DELETE FROM collector_repair_runs WHERE proposal_provider = $1', [
        provider,
      ]);
      await client.query('RESET ROLE');
    }
  });
});
