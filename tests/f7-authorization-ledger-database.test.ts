import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import {
  PgAuthorizationLedgerRepository,
  type SqlExecutor,
  type SqlQueryResult,
} from '@scout/database';
import type { AuthorizationEnvelope } from '@scout/domain';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260815235833_f7_authorization_envelope_ledger.sql',
);
const dbUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:54322/postgres';
const userId = '11111111-1111-4111-a111-111111111111';
const otherUserId = '99999999-9999-4999-a999-999999999999';

const envelope: AuthorizationEnvelope = {
  authorizationVersion: 'authorization-envelope.v1',
  authorizationId: '6e29d8c4-a818-4c5e-89de-7f2e91188b8d',
  userId,
  category: 'electronics',
  source: 'ebay',
  externalId: 'ebay-42',
  action: 'BUY',
  currency: 'BRL',
  quantity: 1,
  unitPriceMinor: 50000,
  totalCostMinor: 50000,
  maxTotalCostMinor: 50000,
  issuedAt: '2026-08-15T12:00:00.000Z',
  expiresAt: '2030-08-15T13:00:00.000Z',
  idempotencyKey: 'auth-ebay-42-001',
  status: 'PENDING_HUMAN_APPROVAL',
  humanApproved: false,
  executable: false,
};

interface LedgerRow {
  id: string;
  user_id: string;
  authorization_id: string;
  idempotency_key: string;
  status: string;
  envelope_snapshot: unknown;
  issued_at: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
}

class RecordingSql implements SqlExecutor {
  readonly calls: Array<{ sql: string; params: unknown[] }> = [];
  private index = 0;
  constructor(private readonly results: SqlQueryResult<LedgerRow>[]) {}

  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<SqlQueryResult<T>> {
    this.calls.push({ sql, params });
    const result = this.results[Math.min(this.index++, this.results.length - 1)];
    return result as SqlQueryResult<T>;
  }
}

const pendingRow: LedgerRow = {
  id: '7b29c1a9-09e4-4d98-94e9-8e2e95d8e4c0',
  user_id: userId,
  authorization_id: envelope.authorizationId,
  idempotency_key: envelope.idempotencyKey,
  status: 'PENDING',
  envelope_snapshot: envelope,
  issued_at: envelope.issuedAt,
  expires_at: envelope.expiresAt,
  consumed_at: null,
  created_at: '2026-08-15T23:58:33.000Z',
};

describe('F7.3 authorization ledger adapter', () => {
  it('defines an owner-readable, service-role-written ledger', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.authorization_envelope_ledger');
    expect(sql).toContain('UNIQUE (user_id, idempotency_key)');
    expect(sql).toContain('UNIQUE (user_id, authorization_id)');
    expect(sql).toContain('GRANT SELECT ON public.authorization_envelope_ledger TO authenticated');
    expect(sql).toContain('GRANT ALL ON public.authorization_envelope_ledger TO service_role');
    expect(sql).toContain('USING ((SELECT auth.uid()) = user_id)');
    expect(sql).not.toContain('SECURITY DEFINER');
  });

  it('validates, parameterizes and maps a pending record', async () => {
    const sql = new RecordingSql([{ rows: [pendingRow], rowCount: 1 }]);
    const repository = new PgAuthorizationLedgerRepository(sql);
    const saved = await repository.record(userId, envelope);
    expect(saved).toMatchObject({ userId, status: 'PENDING', envelope });
    expect(sql.calls[0].sql).toContain('ON CONFLICT DO NOTHING');
    expect(
      sql.calls[0].params.some(
        (param) => typeof param === 'string' && param.includes('authorization-envelope.v1'),
      ),
    ).toBe(true);
  });

  it('returns identical idempotent record and rejects a divergent envelope', async () => {
    const existing = new RecordingSql([
      { rows: [], rowCount: 0 },
      { rows: [pendingRow], rowCount: 1 },
    ]);
    const repository = new PgAuthorizationLedgerRepository(existing);
    await expect(repository.record(userId, envelope)).resolves.toMatchObject({ id: pendingRow.id });

    const divergent = new RecordingSql([
      { rows: [], rowCount: 0 },
      { rows: [pendingRow], rowCount: 1 },
    ]);
    await expect(
      new PgAuthorizationLedgerRepository(divergent).record(userId, {
        ...envelope,
        totalCostMinor: 40000,
        unitPriceMinor: 40000,
        maxTotalCostMinor: 40000,
      }),
    ).rejects.toThrow();
  });
});

describe('F7.3 authorization ledger live RLS boundary', () => {
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

  it('isolates owner reads, supports one service consumption and denies user writes', async (testContext) => {
    if (!available || !client) {
      testContext.skip();
      return;
    }
    const serviceSql: SqlExecutor = {
      query: async <T = Record<string, unknown>>(
        sql: string,
        params: unknown[] = [],
      ): Promise<SqlQueryResult<T>> => {
        if (!client) throw new Error('Database client unavailable.');
        const result = await client.query(sql, params);
        return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
      },
    };
    const repository = new PgAuthorizationLedgerRepository(serviceSql);
    let recordId = '';
    try {
      await client.query('SET ROLE service_role');
      const saved = await repository.record(userId, envelope);
      recordId = saved.id;
      await client.query('SET ROLE authenticated');
      await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [userId]);
      expect(
        (
          await client.query('SELECT id FROM authorization_envelope_ledger WHERE id = $1', [
            recordId,
          ])
        ).rows,
      ).toHaveLength(1);
      await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [otherUserId]);
      expect(
        (
          await client.query('SELECT id FROM authorization_envelope_ledger WHERE id = $1', [
            recordId,
          ])
        ).rows,
      ).toHaveLength(0);
      await expect(
        client.query('UPDATE authorization_envelope_ledger SET status = $1 WHERE id = $2', [
          'CONSUMED',
          recordId,
        ]),
      ).rejects.toThrow();
      await expect(
        client.query('DELETE FROM authorization_envelope_ledger WHERE id = $1', [recordId]),
      ).rejects.toThrow();
      await client.query('SET ROLE service_role');
      const consumed = await repository.markConsumed(userId, envelope.idempotencyKey);
      expect(consumed).toMatchObject({ id: recordId, status: 'CONSUMED' });
      expect(await repository.markConsumed(userId, envelope.idempotencyKey)).toBeNull();
    } finally {
      await client.query('SET ROLE service_role');
      if (recordId)
        await client.query('DELETE FROM authorization_envelope_ledger WHERE id = $1', [recordId]);
      await client.query('RESET ROLE');
    }
  });
});
