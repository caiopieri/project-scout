import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

const dbUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:54322/postgres';

describe('F3 opportunity valuation database integration', () => {
  let client: Client | null = null;
  let available = false;

  beforeAll(async () => {
    client = new Client({ connectionString: dbUrl });
    try {
      await client.connect();
      available = true;
    } catch {
      await client.end().catch(() => {});
      client = null;
    }
  });

  afterAll(async () => {
    if (client) await client.end();
  });

  it('persists versioned valuation output and exposes it read-only to authenticated users', async (ctx) => {
    if (!available || !client) {
      ctx.skip();
      return;
    }
    const listing = await client.query<{ id: string }>('SELECT id FROM listings LIMIT 1');
    const listingId = listing.rows[0].id;
    await client.query('SET ROLE service_role');
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO opportunity_valuations (
        listing_id, valuation_version, estimated_market_price, max_purchase_price,
        deal_score, trend_score, liquidity_score, seller_pressure_score,
        risk_confidence_score, confidence, comparables_used, outliers_removed,
        evidence, missing, explanation
      ) VALUES ($1, 'valuation-rules.v1', 1550, 945, 48, 60, 78, 80, 85, 0.85, 3, 1,
                '["comparables:3"]', '["days-to-sell observations"]', 'Fixture valuation')
      RETURNING id`,
      [listingId],
    );
    expect(inserted.rows).toHaveLength(1);

    await client.query('SET ROLE authenticated');
    await client.query(
      `SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-a111-111111111111', false)`,
    );
    const readable = await client.query(
      'SELECT valuation_version, max_purchase_price FROM opportunity_valuations WHERE id = $1',
      [inserted.rows[0].id],
    );
    expect(readable.rows[0]).toMatchObject({ valuation_version: 'valuation-rules.v1' });
    await expect(
      client.query(
        `INSERT INTO opportunity_valuations (
          listing_id, valuation_version, estimated_market_price, max_purchase_price,
          deal_score, trend_score, liquidity_score, seller_pressure_score,
          risk_confidence_score, confidence, comparables_used, outliers_removed,
          evidence, missing, explanation
        ) VALUES ($1, 'forged', 1, 1, 1, 1, 1, 1, 1, 0.01, 0, 0, '[]', '[]', 'forged')`,
        [listingId],
      ),
    ).rejects.toThrow();

    await client.query('SET ROLE service_role');
    await client.query('DELETE FROM opportunity_valuations WHERE id = $1', [inserted.rows[0].id]);
  });
});
