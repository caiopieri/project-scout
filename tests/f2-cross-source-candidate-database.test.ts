import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

const projectId = '33333333-3333-4333-a333-333333333333';
const leftListingId = '22222222-2222-4222-a222-222222222222';
const sourceId = '00000000-0000-4000-a000-000000000099';
const rightListingId = '99999999-9999-4999-a999-999999999998';

describe('F2 cross-source identity candidate database boundary', () => {
  let client: Client | null = null;
  let available = false;
  let candidateId = '';

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
        `INSERT INTO sources (id, name, domain, country, currency, connector_type)
         VALUES ($1, 'F2 candidate test source', 'candidate.test', 'BR', 'BRL', 'mock')
         ON CONFLICT (id) DO NOTHING`,
        [sourceId],
      );
      await client.query(
        `INSERT INTO listings
         (id, source_id, external_id, url, title, description, condition, currency, price,
          shipping_cost, total_visible_cost, raw_data_path)
         VALUES ($1, $2, 'candidate-test-1', 'https://candidate.test/1', 'iPhone 13',
                 'test', 'used', 'BRL', 100, 0, 100, 'raw/f2-candidate-test.json')
         ON CONFLICT (id) DO NOTHING`,
        [rightListingId, sourceId],
      );
      await client
        .query(
          `INSERT INTO cross_source_identity_candidates
         (project_id, left_source_id, left_listing_id, right_source_id, right_listing_id,
          relation, confidence, evidence)
         VALUES ($1, (SELECT source_id FROM listings WHERE id = $2), $2, $3, $4,
                 'REVIEW', 0.78, '["structured-brand-missing"]')
         RETURNING id`,
          [projectId, leftListingId, sourceId, rightListingId],
        )
        .then((result) => {
          candidateId = result.rows[0].id;
        });
      await client.query('RESET ROLE');
    } catch {
      available = false;
      await client?.end().catch(() => {});
      client = null;
    }
  });

  afterAll(async () => {
    if (!client || !available) return client?.end();
    await client.query('RESET ROLE');
    await client.query('SET ROLE service_role');
    await client.query('DELETE FROM cross_source_identity_candidates WHERE id = $1', [candidateId]);
    await client.query('DELETE FROM listings WHERE id = $1', [rightListingId]);
    await client.query('DELETE FROM sources WHERE id = $1', [sourceId]);
    await client.end();
  });

  it('allows owner review through the RPC, while blocking direct writes and cross-tenant access', async (ctx) => {
    if (!available || !client) {
      ctx.skip();
      return;
    }
    await client.query('SET ROLE authenticated');
    await client.query(
      `SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-a111-111111111111', false)`,
    );
    expect(
      (
        await client.query(
          'SELECT review_status FROM cross_source_identity_candidates WHERE id = $1',
          [candidateId],
        )
      ).rows[0].review_status,
    ).toBe('pending');
    await expect(
      client.query(
        `INSERT INTO cross_source_identity_candidates
         (project_id, left_source_id, left_listing_id, right_source_id, right_listing_id, relation, confidence, evidence)
         VALUES ($1, $2, $3, $4, $5, 'REVIEW', 0.5, '[]')`,
        [
          projectId,
          sourceId,
          rightListingId,
          '00000000-0000-4000-a000-000000000001',
          leftListingId,
        ],
      ),
    ).rejects.toThrow();
    const reviewed = await client.query<{ review_status: string }>(
      `SELECT review_status FROM public.review_cross_source_identity_candidate($1, $2, 'accepted')`,
      [projectId, candidateId],
    );
    expect(reviewed.rows[0].review_status).toBe('accepted');
    await expect(
      client.query('UPDATE cross_source_identity_candidates SET evidence = $1 WHERE id = $2', [
        '["forged"]',
        candidateId,
      ]),
    ).rejects.toThrow();
    await client.query(
      `SELECT set_config('request.jwt.claim.sub', '99999999-9999-4999-a999-999999999999', false)`,
    );
    expect(
      (
        await client.query('SELECT id FROM cross_source_identity_candidates WHERE id = $1', [
          candidateId,
        ])
      ).rows,
    ).toHaveLength(0);
    await client.query('RESET ROLE');
  });
});
