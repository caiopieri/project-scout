import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import {
  PgNegotiationDraftRepository,
  type SqlExecutor,
  type SqlQueryResult,
} from '@scout/database';
import type { NegotiationContext, NegotiationSuggestion } from '@scout/domain';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260815234302_f6_negotiation_drafts.sql',
);
const dbUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:54322/postgres';
const userId = '11111111-1111-4111-a111-111111111111';
const otherUserId = '99999999-9999-4999-a999-999999999999';

const context: NegotiationContext = {
  contextId: '4b5d1e21-7b4e-4e0b-8d4d-5d9b7d1c3f22',
  category: 'electronics',
  source: 'ebay',
  externalId: 'ebay-42',
  title: 'Latitude 5420',
  currency: 'BRL',
  askingPriceMinor: 150000,
  marketValueMinor: 170000,
  sellerPressure: 'LOW',
  targetPriceMinor: 120000,
  userMaxPriceMinor: 130000,
  evidence: [
    {
      source: 'ebay',
      externalId: 'ebay-42',
      kind: 'LISTING',
      summary: 'fixture',
      observedAt: '2026-08-15T12:00:00.000Z',
    },
  ],
  questions: [],
};

const suggestion: NegotiationSuggestion = {
  contextId: context.contextId,
  source: context.source,
  externalId: context.externalId,
  currency: context.currency,
  suggestedOfferMinor: 120000,
  maxOfferMinor: 130000,
  message: 'Rascunho para revisão humana.',
  requestedQuestions: [],
  evidenceReferences: ['LISTING:ebay:ebay-42'],
  rationale: 'Oferta limitada pelo alvo e pelo máximo explícito.',
  requiresHumanReview: true,
  sent: false,
  executable: false,
};

interface DraftRow {
  id: string;
  user_id: string;
  context_snapshot: unknown;
  suggestion_snapshot: unknown;
  created_at: string;
}

class RecordingSql implements SqlExecutor {
  readonly calls: Array<{ sql: string; params: unknown[] }> = [];
  constructor(private readonly rows: DraftRow[]) {}

  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<SqlQueryResult<T>> {
    this.calls.push({ sql, params });
    return { rows: this.rows as T[], rowCount: this.rows.length };
  }
}

const row: DraftRow = {
  id: '7b29c1a9-09e4-4d98-94e9-8e2e95d8e4c0',
  user_id: userId,
  context_snapshot: context,
  suggestion_snapshot: suggestion,
  created_at: '2026-08-15T23:43:02.000Z',
};

describe('F6.2 negotiation draft adapter', () => {
  it('defines owner-readable, service-role-written storage', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.negotiation_drafts');
    expect(sql).toContain('user_max_price_minor BIGINT NOT NULL CHECK');
    expect(sql).toContain(
      'requires_human_review BOOLEAN NOT NULL CHECK (requires_human_review IS TRUE)',
    );
    expect(sql).toContain('sent BOOLEAN NOT NULL CHECK (sent IS FALSE)');
    expect(sql).toContain('executable BOOLEAN NOT NULL CHECK (executable IS FALSE)');
    expect(sql).toContain('GRANT SELECT ON public.negotiation_drafts TO authenticated');
    expect(sql).toContain('GRANT ALL ON public.negotiation_drafts TO service_role');
    expect(sql).toContain('USING ((SELECT auth.uid()) = user_id)');
    expect(sql).not.toContain('SECURITY DEFINER');
  });

  it('validates snapshots, parameterizes SQL and maps rows', async () => {
    const sql = new RecordingSql([row]);
    const repository = new PgNegotiationDraftRepository(sql);
    const saved = await repository.save(userId, context, suggestion);
    expect(saved).toMatchObject({ userId, context, suggestion });
    expect(sql.calls[0].sql).toContain(
      'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb',
    );
    expect(sql.calls[0].params).toContain(JSON.stringify(context));
    expect(sql.calls[0].params).toContain(JSON.stringify(suggestion));
    await expect(repository.findByUserId('not-a-uuid')).rejects.toThrow();
  });

  it('rejects mismatched context/suggestion and unsafe snapshots', async () => {
    const repository = new PgNegotiationDraftRepository(new RecordingSql([row]));
    await expect(
      repository.save(userId, context, { ...suggestion, externalId: 'other' }),
    ).rejects.toThrow();
    await expect(repository.save(userId, context, { ...suggestion, sent: true })).rejects.toThrow();
  });
});

describe('F6.2 negotiation draft live RLS boundary', () => {
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

  it('isolates owner reads and denies authenticated writes', async (testContext) => {
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
    const repository = new PgNegotiationDraftRepository(serviceSql);
    let draftId = '';
    try {
      await client.query('SET ROLE service_role');
      const saved = await repository.save(userId, context, suggestion);
      draftId = saved.id;
      await client.query('SET ROLE authenticated');
      await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [userId]);
      expect(
        (await client.query('SELECT id FROM negotiation_drafts WHERE id = $1', [draftId])).rows,
      ).toHaveLength(1);
      await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [otherUserId]);
      expect(
        (await client.query('SELECT id FROM negotiation_drafts WHERE id = $1', [draftId])).rows,
      ).toHaveLength(0);
      await expect(
        client.query(
          'INSERT INTO negotiation_drafts (user_id, context_id, source, external_id, currency, asking_price_minor, market_value_minor, target_price_minor, user_max_price_minor, suggested_offer_minor, context_snapshot, suggestion_snapshot, requires_human_review, sent, executable) VALUES ($1, $2, $3, $4, $5, 1, 1, 1, 1, 1, $6, $7, true, false, false)',
          [
            otherUserId,
            context.contextId,
            context.source,
            context.externalId,
            context.currency,
            JSON.stringify(context),
            JSON.stringify(suggestion),
          ],
        ),
      ).rejects.toThrow();
    } finally {
      await client.query('SET ROLE service_role');
      if (draftId) await client.query('DELETE FROM negotiation_drafts WHERE id = $1', [draftId]);
      await client.query('RESET ROLE');
    }
  });
});
