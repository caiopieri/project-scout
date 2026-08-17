import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';

describe('F2 human review database boundary', () => {
  let client: Client | null = null;
  let available = false;
  const projectId = '33333333-3333-4333-a333-333333333333';
  const sourceId = '00000000-0000-4000-a000-000000000001';
  const runId = crypto.randomUUID();
  const familyId = crypto.randomUUID();
  const observationId = crypto.randomUUID();

  beforeAll(async () => {
    client = new Client({
      connectionString:
        process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:54322/postgres',
    });
    try {
      await client.connect();
      available = true;
      await client.query('SET ROLE service_role');
      await client.query(
        `INSERT INTO collection_runs (id, project_id, source_id, idempotency_key, provider)
         VALUES ($1, $2, $3, $4, 'f2-review-test')`,
        [runId, projectId, sourceId, `f2-review:${runId}`],
      );
      await client.query(
        `INSERT INTO search_query_families (id, project_id, source_id, collection_run_id, version, base_query, queries)
         VALUES ($1, $2, $3, $4, 'test.v1', 'iPhone 13', '[]')`,
        [familyId, projectId, sourceId, runId],
      );
      await client.query(
        `INSERT INTO search_term_observations
         (id, project_id, family_id, term, normalized_term, kind, status, evidence, source)
         VALUES ($1, $2, $3, 'iphone revisado', 'iphone revisado', 'learned', 'candidate', '["test"]', 'f2-review-test')`,
        [observationId, projectId, familyId],
      );
      await client.query('RESET ROLE');
    } catch {
      available = false;
      await client.end().catch(() => {});
      client = null;
    }
  });

  afterAll(async () => {
    if (!client || !available) return;
    await client.query('RESET ROLE');
    await client.query('SET ROLE service_role');
    await client.query('DELETE FROM search_query_families WHERE id = $1', [familyId]);
    await client.query('DELETE FROM collection_runs WHERE id = $1', [runId]);
    await client.end();
  });

  it('allows owner status review but blocks cross-tenant reads and other-column writes', async (ctx) => {
    if (!available || !client) {
      ctx.skip();
      return;
    }

    await client.query('SET ROLE authenticated');
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [
      '11111111-1111-4111-a111-111111111111',
    ]);
    expect(
      (
        await client.query('SELECT status FROM search_term_observations WHERE id = $1', [
          observationId,
        ])
      ).rows[0].status,
    ).toBe('candidate');
    expect(
      (
        await client.query(
          'UPDATE search_term_observations SET status = $1 WHERE id = $2 RETURNING status',
          ['accepted', observationId],
        )
      ).rows[0].status,
    ).toBe('accepted');
    await expect(
      client.query('UPDATE search_term_observations SET term = $1 WHERE id = $2', [
        'forged term',
        observationId,
      ]),
    ).rejects.toThrow();

    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [
      '99999999-9999-4999-a999-999999999999',
    ]);
    expect(
      (await client.query('SELECT id FROM search_term_observations WHERE id = $1', [observationId]))
        .rows,
    ).toHaveLength(0);
    expect(
      (
        await client.query('UPDATE search_term_observations SET status = $1 WHERE id = $2', [
          'rejected',
          observationId,
        ])
      ).rowCount,
    ).toBe(0);
    await client.query('RESET ROLE');
  });
});
