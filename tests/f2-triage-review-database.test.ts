import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

describe('F2 triage review database boundary', () => {
  let client: Client | null = null;
  let available = false;
  let listingId = '';
  let reviewId = '';
  const projectId = '33333333-3333-4333-a333-333333333333';

  beforeAll(async () => {
    client = new Client({
      connectionString:
        process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:54322/postgres',
    });
    try {
      await client.connect();
      available = true;
      await client.query('SET ROLE service_role');
      const listing = await client.query<{ listing_id: string }>(
        'SELECT listing_id FROM research_project_listings WHERE project_id = $1 LIMIT 1',
        [projectId],
      );
      if (!listing.rows[0]) throw new Error('Fixture project has no listing.');
      listingId = listing.rows[0].listing_id;
      await client.query('RESET ROLE');
    } catch {
      available = false;
      await client?.end().catch(() => {});
      client = null;
    }
  });

  afterAll(async () => {
    if (!client || !available || !reviewId) return client?.end();
    await client.query('RESET ROLE');
    await client.query('SET ROLE service_role');
    await client.query('DELETE FROM listing_triage_reviews WHERE id = $1', [reviewId]);
    await client.end();
  });

  it('allows owner review, blocks cross-tenant access and blocks non-status writes', async (ctx) => {
    if (!available || !client) {
      ctx.skip();
      return;
    }

    await client.query('SET ROLE authenticated');
    await client.query(
      `SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-a111-111111111111', false)`,
    );
    await expect(
      client.query(
        `INSERT INTO listing_triage_reviews (project_id, listing_id, status)
         VALUES ($1, $2, 'accepted')`,
        [projectId, listingId],
      ),
    ).rejects.toThrow();
    const inserted = await client.query<{ id: string }>(
      `SELECT id FROM public.review_listing_triage($1, $2, 'accepted')`,
      [projectId, listingId],
    );
    reviewId = inserted.rows[0].id;
    expect(
      (await client.query('SELECT status FROM listing_triage_reviews WHERE id = $1', [reviewId]))
        .rows[0].status,
    ).toBe('accepted');
    expect(
      (
        await client.query(
          'UPDATE listing_triage_reviews SET status = $1 WHERE id = $2 RETURNING status',
          ['rejected', reviewId],
        )
      ).rows[0].status,
    ).toBe('rejected');
    await expect(
      client.query('UPDATE listing_triage_reviews SET listing_id = $1 WHERE id = $2', [
        listingId,
        reviewId,
      ]),
    ).rejects.toThrow();

    await client.query(
      `SELECT set_config('request.jwt.claim.sub', '99999999-9999-4999-a999-999999999999', false)`,
    );
    expect(
      (await client.query('SELECT id FROM listing_triage_reviews WHERE id = $1', [reviewId])).rows,
    ).toHaveLength(0);
    expect(
      (
        await client.query('UPDATE listing_triage_reviews SET status = $1 WHERE id = $2', [
          'accepted',
          reviewId,
        ])
      ).rowCount,
    ).toBe(0);
    await client.query('RESET ROLE');
  });
});
