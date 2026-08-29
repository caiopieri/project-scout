import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

const EBAY_SOURCE_ID = '00000000-0000-4000-a000-000000000001';
const PROJECT_ID = '33333333-3333-4333-a333-333333333333';
const DEFAULT_DB_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:54322/postgres';

const TEST_EVENT_TYPE = 'PRICE_CHANGED';
const TEST_STATE = 'NORMAL';
const TEST_SCHEMA_VERSION = 'f0.events.v1';
const TEST_PROVIDER = 'ebay-api-sandbox-v1';
const TEST_INGESTION_LAYER = 1;
const TEST_COMPLETENESS = {
  listingIdPercent: 100,
  pricePercent: 96,
  titlePercent: 99,
};

interface ObservationEventFixture {
  eventType: string;
  subjectType: string;
  subjectExternalId: string | null;
  dedupeKey: string;
  observedAt: Date;
  schemaVersion: string;
  payload: Record<string, unknown>;
}

interface CollectorHealthFixture {
  provider: string;
  checkedAt: Date;
  state: string;
  ingestionLayer: number;
  completeness: {
    listingIdPercent: number;
    pricePercent: number;
    titlePercent: number;
  };
  diagnostics: unknown[];
}

function makeObservationEvent(
  overrides: Partial<ObservationEventFixture> = {},
): ObservationEventFixture {
  const suffix = crypto.randomUUID();
  return {
    eventType: TEST_EVENT_TYPE,
    subjectType: 'listing',
    subjectExternalId: `ext-${suffix}`,
    dedupeKey: `ebay:listing:${suffix}:price`,
    observedAt: new Date(),
    schemaVersion: TEST_SCHEMA_VERSION,
    payload: { previousPrice: 500, currentPrice: 450 },
    ...overrides,
  };
}

function makeCollectorHealth(
  overrides: Partial<CollectorHealthFixture> = {},
): CollectorHealthFixture {
  return {
    provider: TEST_PROVIDER,
    checkedAt: new Date(),
    state: TEST_STATE,
    ingestionLayer: TEST_INGESTION_LAYER,
    completeness: TEST_COMPLETENESS,
    diagnostics: [],
    ...overrides,
  };
}

async function insertObservationEvent(
  client: Client,
  fixture: ObservationEventFixture,
): Promise<string> {
  const res = await client.query(
    `INSERT INTO observation_events (
       source_id, event_type, subject_type, subject_external_id, dedupe_key,
       observed_at, schema_version, payload
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     RETURNING id`,
    [
      EBAY_SOURCE_ID,
      fixture.eventType,
      fixture.subjectType,
      fixture.subjectExternalId,
      fixture.dedupeKey,
      fixture.observedAt,
      fixture.schemaVersion,
      JSON.stringify(fixture.payload),
    ],
  );
  return res.rows[0].id as string;
}

async function insertCollectorHealth(
  client: Client,
  fixture: CollectorHealthFixture,
): Promise<string> {
  const res = await client.query(
    `INSERT INTO collector_health_checks (
       source_id, provider, checked_at, state, ingestion_layer,
       listing_id_percent, price_percent, title_percent, diagnostics
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     RETURNING id`,
    [
      EBAY_SOURCE_ID,
      fixture.provider,
      fixture.checkedAt,
      fixture.state,
      fixture.ingestionLayer,
      fixture.completeness.listingIdPercent,
      fixture.completeness.pricePercent,
      fixture.completeness.titlePercent,
      JSON.stringify(fixture.diagnostics),
    ],
  );
  return res.rows[0].id as string;
}

describe('F0 observation events and collector health — live PostgreSQL integration', () => {
  let client: Client | null = null;
  let isDbAvailable = false;
  const createdEventIds: string[] = [];
  const createdHealthIds: string[] = [];
  const createdListingExternalIds: string[] = [];
  const createdRunIds: string[] = [];

  beforeAll(async () => {
    client = new Client({ connectionString: DEFAULT_DB_URL });
    try {
      await client.connect();
      isDbAvailable = true;
    } catch {
      isDbAvailable = false;
      await client.end().catch(() => undefined);
      client = null;
    }
  });

  afterAll(async () => {
    if (client) {
      await client.query('RESET ROLE').catch(() => undefined);
      if (createdRunIds.length > 0) {
        await client
          .query(`DELETE FROM collection_runs WHERE id = ANY($1::uuid[])`, [createdRunIds])
          .catch(() => undefined);
      }
      if (createdListingExternalIds.length > 0) {
        await client
          .query(
            `DELETE FROM listings
             WHERE source_id = $1 AND external_id = ANY($2::text[])`,
            [EBAY_SOURCE_ID, createdListingExternalIds],
          )
          .catch(() => undefined);
        await client
          .query(
            `DELETE FROM observation_events
             WHERE source_id = $1 AND subject_external_id = ANY($2::text[])`,
            [EBAY_SOURCE_ID, createdListingExternalIds],
          )
          .catch(() => undefined);
      }
      if (createdEventIds.length > 0) {
        await client
          .query(`DELETE FROM observation_events WHERE id = ANY($1::uuid[])`, [createdEventIds])
          .catch(() => undefined);
      }
      if (createdHealthIds.length > 0) {
        await client
          .query(`DELETE FROM collector_health_checks WHERE id = ANY($1::uuid[])`, [
            createdHealthIds,
          ])
          .catch(() => undefined);
      }
      await client.end().catch(() => undefined);
    }
  });

  it('service_role inserts a valid observation_event and collector_health_check', async (ctx) => {
    if (!isDbAvailable || !client) {
      console.warn(
        '[SKIP NOTICE] Live PostgreSQL database connection failed at localhost:54322 (Docker daemon is unreachable/stopped). F0 integration tests skipped.',
      );
      ctx.skip();
      return;
    }

    await client.query('SET ROLE service_role');

    const event = makeObservationEvent();
    const eventId = await insertObservationEvent(client, event);
    createdEventIds.push(eventId);
    expect(eventId).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);

    const fetched = await client.query(
      `SELECT event_type, subject_type, subject_external_id, dedupe_key, schema_version
       FROM observation_events WHERE id = $1`,
      [eventId],
    );
    expect(fetched.rows[0]).toMatchObject({
      event_type: event.eventType,
      subject_type: event.subjectType,
      subject_external_id: event.subjectExternalId,
      schema_version: event.schemaVersion,
    });

    const health = makeCollectorHealth();
    const healthId = await insertCollectorHealth(client, health);
    createdHealthIds.push(healthId);
    expect(healthId).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);

    const fetchedHealth = await client.query(
      `SELECT provider, state, ingestion_layer, listing_id_percent, price_percent, title_percent
       FROM collector_health_checks WHERE id = $1`,
      [healthId],
    );
    expect(fetchedHealth.rows[0]).toMatchObject({
      provider: health.provider,
      state: health.state,
      ingestion_layer: health.ingestionLayer,
    });
    expect(Number(fetchedHealth.rows[0].listing_id_percent)).toBe(
      health.completeness.listingIdPercent,
    );

    await client.query('RESET ROLE');
  });

  it('rejects a duplicate (source_id, dedupe_key) observation_event', async (ctx) => {
    if (!isDbAvailable || !client) {
      ctx.skip();
      return;
    }

    await client.query('SET ROLE service_role');

    const event = makeObservationEvent();
    const firstId = await insertObservationEvent(client, event);
    createdEventIds.push(firstId);

    await expect(insertObservationEvent(client, event)).rejects.toThrow();

    const count = await client.query(
      `SELECT COUNT(*) FROM observation_events WHERE source_id = $1 AND dedupe_key = $2`,
      [EBAY_SOURCE_ID, event.dedupeKey],
    );
    expect(Number(count.rows[0].count)).toBe(1);

    await client.query('RESET ROLE');
  });

  it('rejects a listing observation_event without subject_external_id', async (ctx) => {
    if (!isDbAvailable || !client) {
      ctx.skip();
      return;
    }

    await client.query('SET ROLE service_role');

    const event = makeObservationEvent({ subjectExternalId: null });
    await expect(insertObservationEvent(client, event)).rejects.toThrow();

    await client.query('RESET ROLE');
  });

  it('rejects an out-of-range ingestion_layer and impossible completeness on collector_health_checks', async (ctx) => {
    if (!isDbAvailable || !client) {
      ctx.skip();
      return;
    }

    await client.query('SET ROLE service_role');

    const invalidLayer = makeCollectorHealth({ ingestionLayer: 8 });
    await expect(insertCollectorHealth(client, invalidLayer)).rejects.toThrow();

    const invalidCompleteness = makeCollectorHealth({
      completeness: { listingIdPercent: 101, pricePercent: 96, titlePercent: 99 },
    });
    await expect(insertCollectorHealth(client, invalidCompleteness)).rejects.toThrow();

    await client.query('RESET ROLE');
  });

  it('emits idempotent listing lifecycle events transactionally during ingestion', async (ctx) => {
    if (!isDbAvailable || !client) {
      ctx.skip();
      return;
    }

    await client.query('SET ROLE service_role');
    const externalId = `f0-event-${crypto.randomUUID()}`;
    createdListingExternalIds.push(externalId);
    const listing = {
      externalId,
      url: `https://www.ebay.com/itm/${encodeURIComponent(externalId)}`,
      title: 'F0 event integration listing',
      description: 'Initial description',
      condition: 'For parts or not working',
      currency: 'USD',
      priceMinor: 10000,
      shippingCostMinor: 0,
      totalVisibleCostMinor: 10000,
      status: 'active',
      specifications: {},
      images: [],
      inferredProduct: null,
      rawDataMetadata: {},
    };
    const ingest = (value: typeof listing, hash: string) =>
      client!.query('SELECT * FROM ingest_normalized_ebay_listing($1,$2,$3,$4,$5,$6)', [
        PROJECT_ID,
        EBAY_SOURCE_ID,
        JSON.stringify(value),
        `raw/ebay/f0/${externalId}/${hash}.json`,
        hash,
        'f0.test.v1',
      ]);

    await ingest(listing, 'a'.repeat(64));
    await ingest(listing, 'a'.repeat(64));
    expect(
      (
        await client.query(
          `SELECT event_type FROM observation_events
           WHERE source_id = $1 AND subject_external_id = $2 ORDER BY created_at`,
          [EBAY_SOURCE_ID, externalId],
        )
      ).rows.map((row) => row.event_type),
    ).toEqual(['LISTING_DISCOVERED']);

    await ingest(
      {
        ...listing,
        description: 'Updated description',
        priceMinor: 9000,
        totalVisibleCostMinor: 9000,
      },
      'b'.repeat(64),
    );
    await ingest({ ...listing, status: 'out_of_stock' }, 'c'.repeat(64));
    await ingest(listing, 'd'.repeat(64));

    const counts = await client.query(
      `SELECT event_type, COUNT(*)::INTEGER AS count
       FROM observation_events
       WHERE source_id = $1 AND subject_external_id = $2
       GROUP BY event_type`,
      [EBAY_SOURCE_ID, externalId],
    );
    expect(Object.fromEntries(counts.rows.map((row) => [row.event_type, row.count]))).toEqual({
      LISTING_DISCOVERED: 1,
      LISTING_UPDATED: 3,
      PRICE_CHANGED: 2,
      DESCRIPTION_CHANGED: 2,
      REMOVED: 1,
      REAPPEARED: 1,
    });

    await client.query('RESET ROLE');
  });

  it('completes a run and records semantic health atomically and idempotently', async (ctx) => {
    if (!isDbAvailable || !client) {
      ctx.skip();
      return;
    }

    await client.query('SET ROLE service_role');
    const inserted = await client.query(
      `INSERT INTO collection_runs (
         project_id, source_id, status, idempotency_key, provider, attempt_count
       ) VALUES ($1, $2, 'running', $3, 'ebay-mock-v1', 1)
       RETURNING id`,
      [PROJECT_ID, EBAY_SOURCE_ID, `f0-health-${crypto.randomUUID()}`],
    );
    const healthRunId = inserted.rows[0].id as string;
    createdRunIds.push(healthRunId);
    const health = {
      collectionRunId: healthRunId,
      sourceId: EBAY_SOURCE_ID,
      provider: 'ebay-mock-v1',
      checkedAt: new Date().toISOString(),
      state: 'NORMAL',
      ingestionLayer: 1,
      completeness: { listingIdPercent: 100, pricePercent: 100, titlePercent: 100 },
      diagnostics: [],
    };
    const complete = () =>
      client!.query('SELECT * FROM complete_collection_run_with_health($1,$2,$3,$4,$5,$6)', [
        healthRunId,
        5,
        4,
        1,
        'ebay-mock-v1',
        JSON.stringify(health),
      ]);

    expect((await complete()).rows[0]).toMatchObject({
      id: healthRunId,
      status: 'completed',
      items_found: 5,
      items_created: 4,
      items_updated: 1,
    });
    await complete();
    expect(
      Number(
        (
          await client.query(
            `SELECT COUNT(*) FROM collector_health_checks WHERE collection_run_id = $1`,
            [healthRunId],
          )
        ).rows[0].count,
      ),
    ).toBe(1);

    await client.query('RESET ROLE');
  });

  it('does not let a concurrent failure overwrite a completed run', async (ctx) => {
    if (!isDbAvailable || !client) {
      ctx.skip();
      return;
    }

    await client.query('SET ROLE service_role');
    const inserted = await client.query(
      `INSERT INTO collection_runs (
         project_id, source_id, status, idempotency_key, provider, attempt_count
       ) VALUES ($1, $2, 'running', $3, 'ebay-api-production-v1', 1)
       RETURNING id`,
      [PROJECT_ID, EBAY_SOURCE_ID, `f0-terminal-race-${crypto.randomUUID()}`],
    );
    const raceRunId = inserted.rows[0].id as string;
    createdRunIds.push(raceRunId);
    const health = makeCollectorHealth({ provider: 'ebay-api-production-v1' });

    const completed = await client.query(
      `SELECT * FROM complete_collection_run_with_health($1,$2,$3,$4,$5,$6)`,
      [raceRunId, 1, 1, 0, health.provider, JSON.stringify(health)],
    );
    expect(completed.rows[0]).toMatchObject({ id: raceRunId, status: 'completed' });

    const failure = await client.query(
      `SELECT * FROM transition_collection_run_failure_with_health($1,$2,$3,$4,$5,$6)`,
      [
        raceRunId,
        true,
        'Late failure must not overwrite terminal state.',
        'permanent',
        'LATE_FAILURE_IGNORED',
        JSON.stringify(makeCollectorHealth({ provider: health.provider, state: 'ERROR' })),
      ],
    );
    expect(failure.rows).toHaveLength(0);

    const persisted = await client.query(
      `SELECT status, items_found, items_created, error_code
       FROM collection_runs WHERE id = $1`,
      [raceRunId],
    );
    expect(persisted.rows[0]).toEqual({
      status: 'completed',
      items_found: 1,
      items_created: 1,
      error_code: null,
    });

    await client.query('RESET ROLE');
  });

  it('records degraded health atomically for retry and terminal failure attempts', async (ctx) => {
    if (!isDbAvailable || !client) {
      ctx.skip();
      return;
    }

    await client.query('SET ROLE service_role');
    const inserted = await client.query(
      `INSERT INTO collection_runs (
         project_id, source_id, status, idempotency_key, provider, attempt_count
       ) VALUES ($1, $2, 'running', $3, 'ebay-api-production-v1', 1)
       RETURNING id`,
      [PROJECT_ID, EBAY_SOURCE_ID, `f0-degraded-${crypto.randomUUID()}`],
    );
    const degradedRunId = inserted.rows[0].id as string;
    createdRunIds.push(degradedRunId);
    const health = (state: string, attemptNumber: number, code: string) => ({
      collectionRunId: degradedRunId,
      attemptNumber,
      sourceId: EBAY_SOURCE_ID,
      provider: 'ebay-api-production-v1',
      checkedAt: new Date().toISOString(),
      state,
      ingestionLayer: 1,
      completeness: { listingIdPercent: 0, pricePercent: 0, titlePercent: 0 },
      diagnostics: [code],
    });
    const transition = (terminal: boolean, state: string, attempt: number, code: string) =>
      client!.query(
        'SELECT * FROM transition_collection_run_failure_with_health($1,$2,$3,$4,$5,$6)',
        [
          degradedRunId,
          terminal,
          'Sanitized connector failure.',
          terminal ? 'permanent' : 'transient',
          code,
          JSON.stringify(health(state, attempt, code)),
        ],
      );

    expect((await transition(false, 'RATE_LIMITED', 1, 'EBAY_RATE_LIMITED')).rows[0].status).toBe(
      'pending',
    );
    await client.query(
      `UPDATE collection_runs
       SET status = 'running', attempt_count = 2, provider = 'ebay-api-production-v1'
       WHERE id = $1`,
      [degradedRunId],
    );
    expect(
      (await transition(true, 'CONTENT_CHANGED', 2, 'EBAY_SEARCH_INVALID_RESPONSE')).rows[0].status,
    ).toBe('failed');

    const recorded = await client.query(
      `SELECT attempt_number, state, diagnostics
       FROM collector_health_checks
       WHERE collection_run_id = $1 ORDER BY attempt_number`,
      [degradedRunId],
    );
    expect(recorded.rows).toEqual([
      { attempt_number: 1, state: 'RATE_LIMITED', diagnostics: ['EBAY_RATE_LIMITED'] },
      {
        attempt_number: 2,
        state: 'CONTENT_CHANGED',
        diagnostics: ['EBAY_SEARCH_INVALID_RESPONSE'],
      },
    ]);

    await client.query('RESET ROLE');
  });

  it('authenticated role cannot read or mutate internal events and health telemetry', async (ctx) => {
    if (!isDbAvailable || !client) {
      ctx.skip();
      return;
    }

    await client.query('SET ROLE service_role');

    const event = makeObservationEvent({
      subjectType: 'market',
      subjectExternalId: null,
      eventType: 'MARKET_SNAPSHOT_UPDATED',
      dedupeKey: `ebay:market:readonly:${crypto.randomUUID()}`,
    });
    const eventId = await insertObservationEvent(client, event);
    createdEventIds.push(eventId);

    const health = makeCollectorHealth();
    const healthId = await insertCollectorHealth(client, health);
    createdHealthIds.push(healthId);

    await client.query('RESET ROLE');

    await client.query('SET ROLE authenticated');

    await expect(
      client.query(`SELECT id FROM observation_events WHERE id = $1`, [eventId]),
    ).rejects.toThrow();

    await expect(
      client.query(`SELECT id FROM collector_health_checks WHERE id = $1`, [healthId]),
    ).rejects.toThrow();

    const secondEvent = makeObservationEvent();
    await expect(insertObservationEvent(client, secondEvent)).rejects.toThrow();

    const secondHealth = makeCollectorHealth();
    await expect(insertCollectorHealth(client, secondHealth)).rejects.toThrow();

    await expect(
      client.query(`UPDATE observation_events SET event_type = 'REMOVED' WHERE id = $1`, [eventId]),
    ).rejects.toThrow();

    await expect(
      client.query(`UPDATE collector_health_checks SET state = 'ERROR' WHERE id = $1`, [healthId]),
    ).rejects.toThrow();

    await expect(
      client.query(`DELETE FROM observation_events WHERE id = $1`, [eventId]),
    ).rejects.toThrow();

    await expect(
      client.query(`DELETE FROM collector_health_checks WHERE id = $1`, [healthId]),
    ).rejects.toThrow();

    await client.query('RESET ROLE');
  });
});
