import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';

describe('Milestone 2: Live PostgreSQL Integration Suite', () => {
  let client: Client | null = null;
  let isDbAvailable = false;

  beforeAll(async () => {
    const dbUrl =
      process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:54322/postgres';
    try {
      client = new Client({ connectionString: dbUrl });
      await client.connect();
      isDbAvailable = true;
    } catch {
      isDbAvailable = false;
      if (client) {
        await client.end().catch(() => {});
      }
      client = null;
    }
  });

  afterAll(async () => {
    if (client) {
      await client.end().catch(() => {});
    }
  });

  it('Live PostgreSQL Database Seed, Constraints & Strict RLS Isolation', async (ctx) => {
    if (!isDbAvailable || !client) {
      console.warn(
        '[SKIP NOTICE] Live PostgreSQL database connection failed at localhost:54322 (Docker daemon is unreachable/stopped). Real integration tests skipped.',
      );
      ctx.skip();
      return;
    }

    // 1. Verify seed loaded 2 profiles, iPhone 13 project, and 5+ listings
    const profilesRes = await client.query(`SELECT COUNT(*) FROM profiles`);
    expect(Number(profilesRes.rows[0].count)).toBeGreaterThanOrEqual(2);

    const projectsRes = await client.query(
      `SELECT id FROM research_projects WHERE id = '33333333-3333-4333-a333-333333333333'`,
    );
    expect(projectsRes.rows.length).toBe(1);

    const listingsRes = await client.query(`SELECT COUNT(*) FROM listings`);
    expect(Number(listingsRes.rows[0].count)).toBeGreaterThanOrEqual(5);

    // 2. Foreign Key constraint check (invalid seller_id)
    const invalidFkQuery = `
      INSERT INTO listings (source_id, external_id, url, title, description, condition, currency, price, shipping_cost, total_visible_cost, seller_id, status, specifications, raw_data_path)
      VALUES ('00000000-0000-4000-a000-000000000001', 'ext_invalid_fk', 'https://ebay.com/invalid', 'Title', 'Desc', 'For parts', 'USD', 50, 0, 50, 'ffffffff-ffff-4fff-afff-ffffffffffff', 'active', '{}', 'raw/path')
    `;
    await expect(client.query(invalidFkQuery)).rejects.toThrow();

    // 3. Range check constraints (price < 0 and score > 100)
    const negativePriceQuery = `
      INSERT INTO listings (source_id, external_id, url, title, description, condition, currency, price, shipping_cost, total_visible_cost, status, specifications, raw_data_path)
      VALUES ('00000000-0000-4000-a000-000000000001', 'ext_neg_price', 'https://ebay.com/neg', 'Title', 'Desc', 'For parts', 'USD', -10, 0, -10, 'active', '{}', 'raw/path')
    `;
    await expect(client.query(negativePriceQuery)).rejects.toThrow();

    const invalidScoreQuery = `
      INSERT INTO scores (listing_id, query_match_score, technical_risk_score, fraud_risk_score, evidence_quality_score, price_score, opportunity_score, explanation)
      VALUES ('22222222-2222-4222-a222-222222222222', 150, 10, 10, 10, 10, 150, 'Invalid high score')
    `;
    await expect(client.query(invalidScoreQuery)).rejects.toThrow();

    // 4. Uniqueness constraint on (source_id, external_id) for sellers and listings
    const duplicateSellerQuery = `
      INSERT INTO sellers (source_id, external_id, name)
      VALUES ('00000000-0000-4000-a000-000000000001', 'seller_ebay_pro_us', 'Duplicate Seller')
    `;
    await expect(client.query(duplicateSellerQuery)).rejects.toThrow();

    // 5. RLS User A vs User B Isolation and cross-tenant action denial
    await client.query(`SET ROLE authenticated`);
    await client.query(
      `SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-a111-111111111111', false)`,
    );

    const userAProject = await client.query(
      `SELECT id FROM research_projects WHERE user_id = '11111111-1111-4111-a111-111111111111'`,
    );
    expect(userAProject.rows.length).toBeGreaterThan(0);

    const userAActions = await client.query(
      `SELECT id FROM user_listing_actions WHERE user_id = '11111111-1111-4111-a111-111111111111'`,
    );
    expect(userAActions.rows.length).toBeGreaterThan(0);

    // User B must not read User A's project or private listing actions.
    await client.query(
      `SELECT set_config('request.jwt.claim.sub', '99999999-9999-4999-a999-999999999999', false)`,
    );
    const userBCannotReadUserAProject = await client.query(
      `SELECT id FROM research_projects WHERE id = '33333333-3333-4333-a333-333333333333'`,
    );
    expect(userBCannotReadUserAProject.rows).toHaveLength(0);

    const userBCannotReadUserAActions = await client.query(
      `SELECT id FROM user_listing_actions WHERE user_id = '11111111-1111-4111-a111-111111111111'`,
    );
    expect(userBCannotReadUserAActions.rows).toHaveLength(0);

    await client.query(
      `SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-a111-111111111111', false)`,
    );

    // Attempt by User A to record an action on User B's project (must be rejected by RLS WITH CHECK)
    const unauthorizedActionQuery = `
      INSERT INTO user_listing_actions (user_id, listing_id, project_id, favorite, decision)
      VALUES ('11111111-1111-4111-a111-111111111111', '22222222-2222-4222-a222-222222222222', '44444444-4444-4444-a444-444444444444', true, 'approved')
    `;
    await expect(client.query(unauthorizedActionQuery)).rejects.toThrow();

    // 6. The internal MVP does not expose marketplace data to anonymous callers.
    await client.query(`RESET ROLE`);
    await client.query(`SET ROLE anon`);
    await expect(client.query(`SELECT id FROM listings LIMIT 1`)).rejects.toThrow();
    await client.query(`RESET ROLE`);

    // 7. Service Role Operations Authorized for shared data
    await client.query(`SET ROLE service_role`);

    const dynamicExternalId = `service_role_seller_${Date.now()}`;
    const serviceRoleInsert = `
      INSERT INTO sellers (source_id, external_id, name)
      VALUES ('00000000-0000-4000-a000-000000000001', '${dynamicExternalId}', 'Service Role Seller')
    `;
    const serviceRoleRes = await client.query(serviceRoleInsert);
    expect(serviceRoleRes.rowCount).toBe(1);

    await client.query(`RESET ROLE`);
  });

  it('Milestone 3 migration supports lifecycle metadata and preserves RLS on updates', async (ctx) => {
    if (!isDbAvailable || !client) {
      ctx.skip();
      return;
    }
    const id = crypto.randomUUID();
    await client.query(`SET ROLE authenticated`);
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [
      '11111111-1111-4111-a111-111111111111',
    ]);
    const inserted = await client.query(
      `INSERT INTO research_projects (
         id, user_id, name, category, natural_language_query, structured_query, status,
         taxonomy_version, interpreter_provider, interpreter_model, interpreter_version,
         interpreted_at, interpretation_confidence
       ) VALUES ($1,$2,$3,'smartphone',$4,$5,'draft','1.0.0','deterministic','rules-pt-BR','1.0.0',NOW(),0.8)
       RETURNING status, interpretation_confidence`,
      [
        id,
        '11111111-1111-4111-a111-111111111111',
        'M3 integration fixture',
        'iPhone 13 128 GB até R$ 1.800.',
        JSON.stringify({ category: 'smartphone', models: ['iPhone 13'] }),
      ],
    );
    expect(inserted.rows[0].status).toBe('draft');
    expect(Number(inserted.rows[0].interpretation_confidence)).toBe(0.8);

    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [
      '99999999-9999-4999-a999-999999999999',
    ]);
    const crossTenantUpdate = await client.query(
      `UPDATE research_projects SET name='forbidden' WHERE id=$1`,
      [id],
    );
    expect(crossTenantUpdate.rowCount).toBe(0);

    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [
      '11111111-1111-4111-a111-111111111111',
    ]);
    expect(
      (
        await client.query(
          `UPDATE research_projects SET status='archived' WHERE id=$1 RETURNING status`,
          [id],
        )
      ).rows[0].status,
    ).toBe('archived');
    expect(
      (
        await client.query(
          `UPDATE research_projects SET status='active' WHERE id=$1 RETURNING status`,
          [id],
        )
      ).rows[0].status,
    ).toBe('active');
    expect(
      (
        await client.query(
          `UPDATE research_projects SET status='deleted', deleted_at=NOW() WHERE id=$1 RETURNING deleted_at`,
          [id],
        )
      ).rows[0].deleted_at,
    ).toBeTruthy();

    await client.query(`RESET ROLE`);
    await expect(
      client.query(
        `INSERT INTO research_projects (user_id,name,category,natural_language_query,structured_query,status,interpretation_confidence)
       VALUES ($1,'invalid confidence','smartphone','valid query','{}','draft',1.1)`,
        ['11111111-1111-4111-a111-111111111111'],
      ),
    ).rejects.toThrow();
  });

  it('Milestone 4 enforces idempotent runs, tenant RLS and atomic service-role claims', async (ctx) => {
    if (!isDbAvailable || !client) {
      ctx.skip();
      return;
    }
    const key = `integration:${crypto.randomUUID()}`;
    await client.query(`SET ROLE authenticated`);
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [
      '11111111-1111-4111-a111-111111111111',
    ]);
    const inserted = await client.query(
      `SELECT id, status, started_at, attempt_count
       FROM request_ebay_collection_run('33333333-3333-4333-a333-333333333333', $1)`,
      [key],
    );
    expect(inserted.rows[0]).toMatchObject({
      status: 'pending',
      started_at: null,
      attempt_count: 0,
    });
    const runId = inserted.rows[0].id;
    expect(
      (
        await client.query(
          `SELECT id FROM request_ebay_collection_run('33333333-3333-4333-a333-333333333333', $1)`,
          [key],
        )
      ).rows[0].id,
    ).toBe(runId);
    await expect(
      client.query(
        `INSERT INTO collection_runs (project_id, source_id, idempotency_key, provider)
       VALUES ('33333333-3333-4333-a333-333333333333', '00000000-0000-4000-a000-000000000001', $1, 'forged-provider')`,
        [`forged:${crypto.randomUUID()}`],
      ),
    ).rejects.toThrow();

    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [
      '99999999-9999-4999-a999-999999999999',
    ]);
    expect(
      (await client.query(`SELECT id FROM collection_runs WHERE id=$1`, [runId])).rows,
    ).toHaveLength(0);
    expect(
      (
        await client.query(
          `SELECT id FROM request_ebay_collection_run('33333333-3333-4333-a333-333333333333', $1)`,
          [`foreign:${crypto.randomUUID()}`],
        )
      ).rows,
    ).toHaveLength(0);
    await expect(client.query(`SELECT * FROM claim_collection_run($1)`, [runId])).rejects.toThrow();

    await client.query(`RESET ROLE`);
    await client.query(`SET ROLE service_role`);
    const claimed = await client.query(
      `SELECT status, attempt_count FROM claim_collection_run($1)`,
      [runId],
    );
    expect(claimed.rows[0]).toMatchObject({ status: 'running', attempt_count: 1 });
    expect(
      (await client.query(`SELECT id FROM claim_collection_run($1)`, [runId])).rows,
    ).toHaveLength(0);
    await client.query(
      `UPDATE collection_runs SET status='completed', finished_at=NOW(), lease_expires_at=NULL WHERE id=$1`,
      [runId],
    );
    expect(
      (await client.query(`SELECT status FROM collection_runs WHERE id=$1`, [runId])).rows[0]
        .status,
    ).toBe('completed');
    await client.query(`RESET ROLE`);
  });

  it('Milestone 6 transactionally ingests and deduplicates normalized eBay listings', async (ctx) => {
    if (!isDbAvailable || !client) {
      ctx.skip();
      return;
    }
    const externalId = `m6-${crypto.randomUUID()}`;
    const listing = {
      externalId,
      url: `https://www.ebay.com/itm/${externalId}`,
      title: 'Apple iPhone 13 128GB cracked screen',
      description: 'Powers on.',
      condition: 'For parts or not working',
      currency: 'USD',
      priceMinor: 29999,
      shippingCostMinor: 1550,
      totalVisibleCostMinor: 31549,
      seller: {
        externalId: `seller-${externalId}`,
        name: `seller-${externalId}`,
        reviewCount: 42,
        positiveFeedbackPercentage: 99.5,
        accountType: 'unknown',
      },
      status: 'active',
      specifications: { Model: 'Apple iPhone 13', Storage: '128 GB' },
      images: [{ url: `https://i.ebayimg.com/${externalId}.jpg`, position: 0 }],
      inferredProduct: { brand: 'Apple', model: 'iPhone 13', confidence: 0.95 },
      rawDataMetadata: { shippingCostKnown: true },
    };
    const ingest = (value: typeof listing, hash: string) =>
      client!.query(
        `SELECT listing_id, created, updated
         FROM ingest_normalized_ebay_listing($1,$2,$3,$4,$5,$6)`,
        [
          '33333333-3333-4333-a333-333333333333',
          '00000000-0000-4000-a000-000000000001',
          JSON.stringify(value),
          `raw/ebay/${externalId}/${hash}.json`,
          hash,
          'ebay-raw-v1',
        ],
      );

    await client.query(`SET ROLE authenticated`);
    await expect(ingest(listing, 'a'.repeat(64))).rejects.toThrow();
    await client.query(`RESET ROLE`);
    await client.query(`SET ROLE service_role`);

    expect((await ingest(listing, 'a'.repeat(64))).rows[0]).toMatchObject({
      created: true,
      updated: false,
    });
    expect((await ingest(listing, 'a'.repeat(64))).rows[0]).toMatchObject({
      created: false,
      updated: false,
    });
    const descriptionChanged = { ...listing, description: 'Powers on and reaches setup.' };
    expect((await ingest(descriptionChanged, 'b'.repeat(64))).rows[0]).toMatchObject({
      created: false,
      updated: true,
    });
    const priceChanged = {
      ...descriptionChanged,
      priceMinor: 28999,
      totalVisibleCostMinor: 30549,
    };
    const listingId = (await ingest(priceChanged, 'c'.repeat(64))).rows[0].listing_id;
    expect(
      Number(
        (await client.query(`SELECT COUNT(*) FROM listings WHERE external_id=$1`, [externalId]))
          .rows[0].count,
      ),
    ).toBe(1);
    expect(
      Number(
        (
          await client.query(`SELECT COUNT(*) FROM listing_snapshots WHERE listing_id=$1`, [
            listingId,
          ])
        ).rows[0].count,
      ),
    ).toBe(3);
    expect(
      Number(
        (await client.query(`SELECT COUNT(*) FROM price_history WHERE listing_id=$1`, [listingId]))
          .rows[0].count,
      ),
    ).toBe(4);
    expect(
      Number(
        (await client.query(`SELECT COUNT(*) FROM listing_images WHERE listing_id=$1`, [listingId]))
          .rows[0].count,
      ),
    ).toBe(1);
    await client.query(`RESET ROLE`);
  });
});
