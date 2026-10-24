import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Client } from 'pg';
import { evaluateListingMonitor, evaluateSearchMonitor, passesSearchCutoff } from '@scout/domain';
import { monitorCreateSchema, type ListingTransport } from '@scout/schemas';
import type { MonitorRow, SupabaseRestMonitorRepository } from '@scout/database/monitors';
import { MonitorScheduler } from '../apps/worker/src/MonitorScheduler';

const listing = (
  id: string,
  overrides: {
    score?: number | null;
    percentBelow?: number | null;
    totalMinor?: number | null;
    status?: string;
    label?: string | null;
  } = {},
) =>
  ({
    id,
    title: `Listing ${id}`,
    currency: 'USD',
    price: 250,
    status: overrides.status ?? 'active',
    sourceId: '00000000-0000-4000-a000-000000000001',
    userAction: overrides.label ? { label: overrides.label } : null,
    score:
      overrides.score === null
        ? { status: 'INCOMPLETO', value: null }
        : { status: 'known', value: overrides.score ?? 70 },
    referenceDiscount:
      overrides.percentBelow === null
        ? { status: 'NAO_RANQUEAVEL' }
        : { status: 'known', discountBasisPoints: (overrides.percentBelow ?? 20) * 100 },
    landedCost:
      overrides.totalMinor === null
        ? { status: 'indeterminate', totalMinor: null }
        : { status: 'known', totalMinor: overrides.totalMinor ?? 25000 },
  }) as unknown as ListingTransport;

describe('S10 search cutoff', () => {
  it('passes only when every cutoff is met, and an unknown leg never passes', () => {
    const cutoff = { minScore: 60, minPercentBelowReference: 15, maxTotalCostMinor: 30000 };
    expect(passesSearchCutoff(listing('a'), cutoff)).toBe(true);
    expect(passesSearchCutoff(listing('b', { score: 59 }), cutoff)).toBe(false);
    expect(passesSearchCutoff(listing('c', { score: null }), cutoff)).toBe(false);
    expect(passesSearchCutoff(listing('d', { percentBelow: null }), cutoff)).toBe(false);
    expect(passesSearchCutoff(listing('e', { totalMinor: null }), cutoff)).toBe(false);
    expect(passesSearchCutoff(listing('f', { totalMinor: 30001 }), cutoff)).toBe(false);
    expect(passesSearchCutoff(listing('g', { status: 'completed' }), cutoff)).toBe(false);
    expect(passesSearchCutoff(listing('h', { label: 'discarded' }), cutoff)).toBe(false);
    // Only the cutoffs a monitor sets apply.
    expect(passesSearchCutoff(listing('i', { score: null }), { maxTotalCostMinor: 30000 })).toBe(
      true,
    );
  });

  it('alerts once per listing per monitor', () => {
    const alerts = evaluateSearchMonitor(
      [listing('a'), listing('b'), listing('c', { score: 10 })],
      { minScore: 60 },
      new Set(['a']),
    );
    expect(alerts.map((alert) => [alert.listingId, alert.kind, alert.dedupeKey])).toEqual([
      ['b', 'NEW_OPPORTUNITY', 'opportunity:b'],
    ]);
    expect(alerts[0].payload).toMatchObject({ score: 70, percentBelowReference: 20 });
  });

  it('refuses a search monitor without any cutoff', () => {
    expect(
      monitorCreateSchema.safeParse({
        kind: 'search',
        projectId: '33333333-3333-4333-a333-333333333333',
        cutoff: {},
      }).success,
    ).toBe(false);
  });
});

describe('S10 listing monitor', () => {
  const base = { priceMinor: 20000, status: 'active' };

  it('alerts on a drop at or above the minimum and moves the baseline', () => {
    const result = evaluateListingMonitor(
      'l1',
      base,
      { priceMinor: 18000, status: 'active' },
      { minPriceDropPercent: 10 },
    );
    expect(result.alerts).toEqual([
      {
        listingId: 'l1',
        kind: 'PRICE_DROP',
        dedupeKey: 'drop:l1:18000',
        payload: { fromMinor: 20000, toMinor: 18000, dropPercent: 10 },
      },
    ]);
    expect(result.nextBaseline).toEqual({ priceMinor: 18000, status: 'active' });
  });

  it('lets small drops add up instead of resetting the baseline', () => {
    const cutoff = { minPriceDropPercent: 10 };
    const first = evaluateListingMonitor(
      'l1',
      base,
      { priceMinor: 19000, status: 'active' },
      cutoff,
    );
    expect(first.alerts).toEqual([]);
    expect(first.nextBaseline.priceMinor).toBe(20000);
    const second = evaluateListingMonitor(
      'l1',
      first.nextBaseline,
      { priceMinor: 17900, status: 'active' },
      cutoff,
    );
    expect(second.alerts.map((alert) => alert.kind)).toEqual(['PRICE_DROP']);
  });

  it('alerts when the listing ends or goes out of stock, and ignores price rises', () => {
    expect(
      evaluateListingMonitor('l1', base, { priceMinor: 20000, status: 'completed' }, {}).alerts.map(
        (alert) => alert.kind,
      ),
    ).toEqual(['ENDED']);
    expect(
      evaluateListingMonitor(
        'l1',
        base,
        { priceMinor: 20000, status: 'out_of_stock' },
        {},
      ).alerts.map((alert) => alert.kind),
    ).toEqual(['GONE']);
    const rise = evaluateListingMonitor('l1', base, { priceMinor: 25000, status: 'active' }, {});
    expect(rise.alerts).toEqual([]);
    expect(rise.nextBaseline.priceMinor).toBe(25000);
  });
});

describe('S10 scheduler', () => {
  const row = (overrides: Partial<MonitorRow> = {}): MonitorRow => ({
    id: 'm1',
    user_id: 'u1',
    kind: 'search',
    project_id: 'p1',
    listing_id: null,
    source_id: null,
    cutoff: { minScore: 60 },
    baseline: null,
    cadence_minutes: 360,
    active: true,
    next_run_at: '2026-10-24T00:00:00Z',
    last_run_at: null,
    created_at: '2026-10-24T00:00:00Z',
    ...overrides,
  });
  const fakeRepository = (
    due: MonitorRow[],
    runStatus = { status: 'pending', queued_at: null },
  ) => {
    const inserted: Array<Record<string, unknown>> = [];
    const repository = {
      claimDue: vi.fn(async () => due),
      alertedListingIds: vi.fn(async () => new Set<string>()),
      insertAlerts: vi.fn(async (rows: Array<Record<string, unknown>>) => {
        inserted.push(...rows);
        return rows;
      }),
      updateBaseline: vi.fn(async () => undefined),
      requestCollection: vi.fn(async () => ({ id: 'run-1', ...runStatus })),
      markQueued: vi.fn(async () => undefined),
    };
    return {
      repository: repository as unknown as SupabaseRestMonitorRepository,
      raw: repository,
      inserted,
    };
  };
  const scheduler = (
    repository: SupabaseRestMonitorRepository,
    options: { allowed?: boolean; failFor?: string } = {},
  ) => {
    const queueCollection = vi.fn(async () => undefined);
    return {
      queueCollection,
      scheduler: new MonitorScheduler({
        monitors: repository,
        enrichedProjectListings: async (_userId, projectId) => {
          if (projectId === options.failFor) throw new Error('boom');
          return [listing('a'), listing('b', { score: 10 })];
        },
        findListing: async () => null,
        circuitAllows: async () => options.allowed ?? true,
        queueCollection,
        now: () => new Date('2026-10-24T12:00:00Z'),
      }),
    };
  };

  it('alerts on what qualifies now and asks for one collection per cadence slot', async () => {
    const fake = fakeRepository([row()]);
    const { scheduler: run, queueCollection } = scheduler(fake.repository);
    const [result] = await run.runDue();
    expect(result).toMatchObject({ monitorId: 'm1', alerts: 1, collection: { runId: 'run-1' } });
    expect(fake.inserted).toEqual([
      expect.objectContaining({
        user_id: 'u1',
        monitor_id: 'm1',
        listing_id: 'a',
        kind: 'NEW_OPPORTUNITY',
      }),
    ]);
    const slot = Math.floor(new Date('2026-10-24T12:00:00Z').getTime() / (360 * 60_000));
    expect(fake.raw.requestCollection).toHaveBeenCalledWith('m1', `monitor:m1:${slot}`);
    expect(queueCollection).toHaveBeenCalledWith('run-1');
  });

  it('does not touch a source whose circuit is open, nor requeue a queued run', async () => {
    const blocked = fakeRepository([row()]);
    const first = scheduler(blocked.repository, { allowed: false });
    expect((await first.scheduler.runDue())[0].collection).toEqual({
      skipped: 'source circuit open',
    });
    expect(blocked.raw.requestCollection).not.toHaveBeenCalled();

    const queued = fakeRepository([row()], {
      status: 'pending',
      queued_at: '2026-10-24T11:00:00Z',
    } as never);
    const second = scheduler(queued.repository);
    await second.scheduler.runDue();
    expect(second.queueCollection).not.toHaveBeenCalled();
  });

  it('keeps going when one monitor fails', async () => {
    const fake = fakeRepository([row({ id: 'bad', project_id: 'broken' }), row({ id: 'good' })]);
    const results = await scheduler(fake.repository, { failFor: 'broken' }).scheduler.runDue();
    expect(results.map((result) => [result.monitorId, result.error ?? 'ok'])).toEqual([
      ['bad', 'boom'],
      ['good', 'ok'],
    ]);
  });

  it('marks what already qualifies at creation as read', async () => {
    const fake = fakeRepository([]);
    await scheduler(fake.repository).scheduler.evaluate(row(), true);
    expect(fake.inserted[0]).toMatchObject({ read_at: '2026-10-24T12:00:00.000Z' });
    expect(fake.inserted[0].payload).toMatchObject({ atCreation: true });
  });
});

describe('S10 monitors in the database', () => {
  let client: Client | null = null;
  beforeAll(async () => {
    const candidate = new Client({
      connectionString:
        process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:54322/postgres',
    });
    try {
      await candidate.connect();
      client = candidate;
    } catch {
      await candidate.end().catch(() => {});
    }
  });
  afterAll(async () => {
    if (client) await client.end();
  });

  it('claims each due monitor once and hides monitors and alerts from other users', async (ctx) => {
    if (!client) return ctx.skip();
    await client.query('BEGIN');
    try {
      const project = await client.query<{ id: string; user_id: string }>(
        "SELECT id, user_id FROM research_projects WHERE status = 'active' LIMIT 1",
      );
      if (!project.rows[0]) return ctx.skip();
      const { id: projectId, user_id: ownerId } = project.rows[0];
      await client.query('DELETE FROM monitors WHERE project_id = $1', [projectId]);
      const monitor = await client.query<{ id: string }>(
        `INSERT INTO monitors (user_id, kind, project_id, cutoff, cadence_minutes, next_run_at)
         VALUES ($1, 'search', $2, '{"minScore": 60}', 60, NOW() - INTERVAL '1 minute') RETURNING id`,
        [ownerId, projectId],
      );
      const listing = await client.query<{ id: string }>('SELECT id FROM listings LIMIT 1');
      await client.query(
        `INSERT INTO alerts (user_id, monitor_id, listing_id, kind, dedupe_key)
         VALUES ($1, $2, $3, 'NEW_OPPORTUNITY', 'opportunity:x')`,
        [ownerId, monitor.rows[0].id, listing.rows[0].id],
      );
      await expect(
        client.query(
          `INSERT INTO alerts (user_id, monitor_id, listing_id, kind, dedupe_key)
           VALUES ($1, $2, $3, 'NEW_OPPORTUNITY', 'opportunity:x')`,
          [ownerId, monitor.rows[0].id, listing.rows[0].id],
        ),
      ).rejects.toThrow(/duplicate key/);
      await client.query('ROLLBACK');
      await client.query('BEGIN');
      await client.query('DELETE FROM monitors WHERE project_id = $1', [projectId]);
      const again = await client.query<{ id: string }>(
        `INSERT INTO monitors (user_id, kind, project_id, cutoff, cadence_minutes, next_run_at)
         VALUES ($1, 'search', $2, '{"minScore": 60}', 60, NOW() - INTERVAL '1 minute') RETURNING id`,
        [ownerId, projectId],
      );
      const claimed = await client.query('SELECT id FROM claim_due_monitors(50)');
      expect(claimed.rows.map((r) => r.id)).toContain(again.rows[0].id);
      const secondClaim = await client.query('SELECT id FROM claim_due_monitors(50)');
      expect(secondClaim.rows.map((r) => r.id)).not.toContain(again.rows[0].id);

      await client.query('SET LOCAL ROLE authenticated');
      await client.query(
        "SELECT set_config('request.jwt.claim.sub', '99999999-9999-4999-a999-999999999999', true)",
      );
      expect(
        (await client.query('SELECT id FROM monitors WHERE id = $1', [again.rows[0].id])).rows,
      ).toEqual([]);
      await expect(client.query('SELECT * FROM claim_due_monitors(1)')).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await client.query('ROLLBACK');
    }
  });
});
