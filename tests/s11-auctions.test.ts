import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Client } from 'pg';
import {
  auctionTermsText,
  calculateAuctionCost,
  evaluateLotMonitor,
  maxBidForUnitCost,
  nextLotCheckAt,
  parseAuctionTerms,
} from '@scout/domain';
import {
  GsaAuctionsClient,
  gsaRawLotSchema,
  isElectronicsLot,
  mapGsaLot,
} from '@scout/gsa-auctions-connector';
import { AuctionSweeper } from '../apps/worker/src/AuctionSweeper';

const fixture = readFileSync('tests/fixtures/gsa/active-auctions.json', 'utf8');
const lots = (JSON.parse(fixture) as { Results: unknown[] }).Results.map((raw) =>
  gsaRawLotSchema.parse(raw),
);
const lot = (saleNo: string, lotNo: string) =>
  mapGsaLot(lots.find((raw) => raw.saleNo === saleNo && raw.lotNo === lotNo)!);

describe('S11 GSA connector', () => {
  it('keeps electronics and drops everything else before storing', () => {
    const kept = lots.filter(isElectronicsLot).map((raw) => raw.itemName.trim());
    expect(kept).toEqual(
      expect.arrayContaining([
        '10 HP Probook Laptop Computers',
        '33 Scrap Laptops',
        'Server Equipment',
      ]),
    );
    for (const dropped of ['Computer Desk', 'Monitor Stand', 'Boat/motor/trailer: One lot'])
      expect(kept).not.toContain(dropped);
  });

  it('maps a lot with money in minor units and terms as plain text', () => {
    const mapped = lot('3-1-QSC-I-27-034', '021');
    expect(mapped).toMatchObject({
      externalId: '3-1-QSC-I-27-034:021',
      title: '10 HP Probook Laptop Computers',
      closesOn: '2026-10-26',
      status: 'active',
      currentBidMinor: 16000,
      bidders: 3,
      incrementMinor: 2000,
      currency: 'USD',
    });
    expect(mapped.termsText).not.toMatch(/<[a-z]/i);
    expect(mapped.termsText).toContain('Hard drives and RAM have been removed');
  });

  it('serves a loopback fixture, refuses live without a key and a non-loopback fixture', async () => {
    const fetcher = vi.fn(async () => new Response(fixture));
    const result = await new GsaAuctionsClient('fixture', {
      baseUrl: 'http://127.0.0.1:8098/gsa',
      fetcher: fetcher as unknown as typeof fetch,
    }).activeLots();
    expect(result.seen).toBe(12);
    expect(result.lots.length).toBeGreaterThanOrEqual(6);
    await expect(new GsaAuctionsClient('live', { fetcher }).activeLots()).rejects.toMatchObject({
      code: 'GSA_CONFIGURATION_MISSING',
    });
    await expect(
      new GsaAuctionsClient('fixture', { baseUrl: 'https://api.gsa.gov', fetcher }).activeLots(),
    ).rejects.toMatchObject({ code: 'SOURCE_FIXTURE_URL_INVALID' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('S11 terms parser on real lots', () => {
  it('reads quantity, removed parts and removal duty, each with its evidence', () => {
    const mapped = lot('3-1-QSC-I-27-034', '021');
    const terms = parseAuctionTerms(mapped.title, mapped.termsText);
    expect(terms.quantity).toMatchObject({ value: 10 });
    expect(terms.quantity?.evidence).toContain('10 HP Probook');
    expect(terms.storageRemoved?.value).toBe(true);
    expect(terms.memoryRemoved?.value).toBe(true);
    expect(terms.buyerRemoves?.value).toBe(true);
    expect(terms.partsMayBeMissing?.value).toBe(true);
    expect(terms.inspectionByAppointment?.value).toBe(true);
    // GSA text says nothing about a buyer's premium or sales tax: they stay unknown.
    expect(terms.buyerPremiumPercent).toBeUndefined();
    expect(terms.salesTaxApplies).toBeUndefined();
  });

  it('does not mistake RAM specs or model numbers for removed RAM or a count', () => {
    const scrap = lot('3-1-QSC-I-27-034', '046');
    const terms = parseAuctionTerms(scrap.title, scrap.termsText);
    expect(terms.quantity).toMatchObject({ value: 33 });
    expect(terms.storageRemoved?.value).toBe(true);
    expect(terms.memoryRemoved).toBeUndefined();
    expect(
      parseAuctionTerms('Laptops', 'Model: ProBook 630 Laptops in used condition.').quantity,
    ).toBeUndefined();
    expect(
      parseAuctionTerms(
        'Laptop Computers',
        'This lot contains 10 Laptops with hard drives and RAM removed.',
      ).quantity,
    ).toMatchObject({ value: 10 });
  });

  it('counts what real GSA titles state, and nothing they do not', () => {
    const quantity = (title: string, text = '') => parseAuctionTerms(title, text).quantity?.value;
    expect(quantity('(7) Dell Laptops & (1) Dell Desktop')).toBe(8);
    expect(quantity('(336) Cisco VOIP Phones 8841')).toBe(336);
    expect(quantity('Cisco Switch, 2 ea')).toBe(2);
    expect(
      quantity('Electronics Equipment', 'Printer Type: 2 inch direct thermal portable printer'),
    ).toBeUndefined();
    expect(
      quantity('MONITORS', 'One lot consists of monitors, keyboards, and assorted cables.'),
    ).toBeUndefined();
    expect(quantity('Monitors, computer', 'One lot consists of 11 Computer monitors.')).toBe(11);
    expect(
      quantity(
        'TANGENT VITA KW22 V4 ALL IN ONE COMPUTERS',
        'This lot contains (2) Tangent all-in-one computers.',
      ),
    ).toBe(2);
    expect(
      quantity('Printers', 'This lot contains (2) printers: one HP unit and one Dell printer.'),
    ).toBe(2);
    expect(quantity('Computer', 'This lot contains nine (9) Tangent computers.')).toBe(9);
    expect(
      quantity(
        'Cisco Cell Phones',
        'Twenty seven used cell phones. Two cell phones unused in box.',
      ),
    ).toBeUndefined();
    expect(quantity('Phones', 'This lot contains twenty-seven used cell phones.')).toBe(27);
    expect(
      quantity('Computer Monitor Lot', 'One Samsung monitor is missing its power cable.'),
    ).toBeUndefined();
    expect(
      quantity(
        'Misc. Electronic Equipment',
        'Includes 49 Dell desktop printers, 4 HP LaserJet printers, 4 Lexmark printers.',
      ),
    ).toBeUndefined();
    expect(
      quantity(
        'ELECTRONICS',
        'This lot contains (68) assorted desktop CPUs, all-in-one computers, and laptops, (17) monitors, and (17) printers.',
      ),
    ).toBe(102);
    expect(
      quantity(
        'ELECTRICAL',
        'This lot contains (62) desktop computers, (96) laptop computers, (34) slit lamps, (27) tonometers.',
      ),
    ).toBeUndefined();
    expect(quantity('One Lot of Laptops (Est 7 ea)')).toBe(7);
    expect(
      quantity(
        'TANGENT COMPUTER',
        'This lot contains nine (9) Tangent all-in-one computers, consisting of six (6) units of model A and three (3) units of model B.',
      ),
    ).toBe(9);
    expect(
      quantity(
        'Cisco Storage',
        'This lot contains (4) Cisco 960GB SSDs, (2) Cisco Catalyst 2960 Series switches, and (75) cables.',
      ),
    ).toBeUndefined();
    expect(
      quantity('IT Network Switches', 'This lot contains (74) Cisco C3850 IT network switches.'),
    ).toBe(74);
    expect(isElectronicsLot({ itemName: 'Printer Toners' })).toBe(false);
    expect(isElectronicsLot({ itemName: '(3) 13.3" Laptop Sleeves' })).toBe(false);
    expect(isElectronicsLot({ itemName: '(5) Riester Vital Sign Monitor' })).toBe(false);
    expect(isElectronicsLot({ itemName: '2 Portable Respiratory Monitor' })).toBe(false);
    expect(isElectronicsLot({ itemName: 'VITAL SIGNS MONITORS' })).toBe(false);
    expect(isElectronicsLot({ itemName: 'SERVER CABINETS' })).toBe(false);
    expect(isElectronicsLot({ itemName: 'Printer Toner' })).toBe(false);
  });

  it('reads payment and removal deadlines', () => {
    const cisco = lot('1-1-QSC-I-27-032', '004');
    const terms = parseAuctionTerms(cisco.title, cisco.termsText);
    expect(terms.paymentDays).toMatchObject({ value: 2 });
    expect(terms.removalDays).toMatchObject({ value: 10 });
  });

  it('reads a Brazilian edital: commission, admin fee, as-is', () => {
    const text = auctionTermsText(
      '<p>Lote 12: 20 notebooks Dell. Comissão do leiloeiro de 5% sobre o valor do arremate.</p><p>Taxa administrativa: R$ 150,00. Bens vendidos no estado em que se encontram. O arrematante é responsável pela retirada em até 5 dias.</p>',
    );
    const terms = parseAuctionTerms('Lote 12 notebooks', text);
    expect(terms.quantity).toMatchObject({ value: 20 });
    expect(terms.buyerPremiumPercent).toMatchObject({ value: 5 });
    expect(terms.adminFeeMinor).toMatchObject({ value: 15000 });
    expect(terms.asIs?.value).toBe(true);
    expect(terms.buyerRemoves?.value).toBe(true);
    expect(terms.removalDays).toMatchObject({ value: 5 });
  });
});

describe('S11 auction cost', () => {
  const terms = parseAuctionTerms(
    '10 HP Probook Laptop Computers',
    'Buyer is responsible for all aspects of removal.',
  );

  it('names every unknown leg instead of guessing', () => {
    const cost = calculateAuctionCost({ hammerMinor: 16000, currency: 'USD', terms });
    expect(cost.status).toBe('indeterminate');
    expect(cost.totalMinor).toBeNull();
    expect(cost.missing).toEqual(['buyerPremium', 'salesTax', 'removal']);
    expect(cost.components.removal.basis).toBe('buyer removes and ships at own cost');
  });

  it('computes an assumed total and cost per useful unit from explicit premises', () => {
    const cost = calculateAuctionCost({
      hammerMinor: 16000,
      currency: 'USD',
      terms,
      premises: {
        buyerPremiumPercent: 0,
        salesTaxPercent: 8,
        removalMinor: 12000,
        usefulRatio: 0.7,
      },
    });
    expect(cost).toMatchObject({
      status: 'assumed',
      totalMinor: 16000 + 0 + 0 + 1280 + 12000,
      usefulUnits: 7,
      unitsOrigin: 'assumed',
      costPerUsefulUnitMinor: Math.round(29280 / 7),
    });
  });

  it('is known only when the terms state everything', () => {
    const stated = parseAuctionTerms(
      '5 iPads',
      "No buyer's premium. Not subject to sales tax. Administrative fee of $25.00.",
    );
    const cost = calculateAuctionCost({
      hammerMinor: 50000,
      currency: 'USD',
      terms: stated,
      premises: { removalMinor: 0 },
    });
    expect(cost.status).toBe('assumed');
    expect(cost.totalMinor).toBe(52500);
    expect(cost.unitsOrigin).toBe('stated');
  });

  it('finds the highest bid that keeps the unit cost on target', () => {
    const premises = {
      buyerPremiumPercent: 10,
      salesTaxPercent: 8,
      removalMinor: 12000,
      usefulRatio: 0.7,
    };
    const max = maxBidForUnitCost({ targetUnitCostMinor: 6000, terms, premises })!;
    const at = calculateAuctionCost({ hammerMinor: max, currency: 'USD', terms, premises });
    const above = calculateAuctionCost({
      hammerMinor: max + 100,
      currency: 'USD',
      terms,
      premises,
    });
    expect(at.costPerUsefulUnitMinor!).toBeLessThanOrEqual(6000);
    expect(above.costPerUsefulUnitMinor!).toBeGreaterThan(6000);
    expect(maxBidForUnitCost({ targetUnitCostMinor: 6000, terms })).toBeNull();
  });
});

describe('S11 lot monitor', () => {
  const state = {
    id: 'lot-1',
    status: 'active' as const,
    currentBidMinor: 21000,
    closesOn: '2026-10-26',
  };

  it('alerts when the bid passes the limit, on closing day and when closed', () => {
    expect(
      evaluateLotMonitor(state, { maxBidMinor: 20000 }, '2026-10-24').map((alert) => alert.kind),
    ).toEqual(['LOT_BID_ABOVE']);
    expect(evaluateLotMonitor(state, {}, '2026-10-26').map((alert) => alert.kind)).toEqual([
      'LOT_CLOSING',
    ]);
    expect(
      evaluateLotMonitor({ ...state, status: 'closed' }, {}, '2026-10-27').map(
        (alert) => alert.kind,
      ),
    ).toEqual(['LOT_CLOSED']);
    expect(evaluateLotMonitor(state, { maxBidMinor: 30000 }, '2026-10-24')).toEqual([]);
  });

  it('looks more often as the close nears and stops after it', () => {
    const now = new Date('2026-10-20T12:00:00Z');
    const gap = (closesOn: string) =>
      (nextLotCheckAt(closesOn, 'active', now)!.getTime() - now.getTime()) / 60_000;
    expect(gap('2026-10-30')).toBe(360);
    expect(gap('2026-10-22')).toBe(60);
    expect(gap('2026-10-20')).toBe(30);
    expect(nextLotCheckAt('2026-10-20', 'closed', now)).toBeNull();
  });
});

describe('S11 sweep budget', () => {
  const auctions = (sweeps: Array<{ id: string; started_at: string }>) =>
    ({
      sweepsSince: vi.fn(async () => sweeps),
      upsertSweep: vi.fn(async () => ({ kept: 1, bidChanges: 1 })),
      closeMissing: vi.fn(async () => 0),
      recordSweep: vi.fn(async () => undefined),
    }) as never;
  const client = {
    activeLots: vi.fn(async () => ({
      seen: 1,
      lots: [lot('3-1-QSC-I-27-034', '021')],
      activeIds: ['3-1-QSC-I-27-034:021'],
      invalid: 0,
    })),
  };
  const now = () => new Date('2026-10-24T12:00:00Z');

  it('skips without calling the source when the daily budget is used or the last sweep is recent', async () => {
    const used = new AuctionSweeper({
      sourceId: 'gsa',
      client: client as never,
      auctions: auctions(
        Array.from({ length: 40 }, (_, i) => ({ id: `${i}`, started_at: '2026-10-24T11:00:00Z' })),
      ),
      dailyBudget: 40,
      minIntervalMinutes: 360,
      now,
    });
    expect((await used.sweep('cron')).status).toBe('skipped');
    const recent = new AuctionSweeper({
      sourceId: 'gsa',
      client: client as never,
      auctions: auctions([{ id: '1', started_at: '2026-10-24T10:00:00Z' }]),
      dailyBudget: 40,
      minIntervalMinutes: 360,
      now,
    });
    expect(await recent.sweep('cron')).toMatchObject({ status: 'skipped' });
    expect(client.activeLots).not.toHaveBeenCalled();
    expect(await recent.sweep('monitors', { minIntervalMinutes: 25 })).toMatchObject({
      status: 'swept',
      bidChanges: 1,
    });
    expect(client.activeLots).toHaveBeenCalledOnce();
  });
});

describe('S11 auctions in the database', () => {
  let db: Client | null = null;
  beforeAll(async () => {
    const candidate = new Client({
      connectionString:
        process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:54322/postgres',
    });
    try {
      await candidate.connect();
      db = candidate;
    } catch {
      await candidate.end().catch(() => {});
    }
  });
  afterAll(async () => {
    if (db) await db.end();
  });

  it('keeps one observation per distinct bid, lets users read lots but never write them', async (ctx) => {
    if (!db) return ctx.skip();
    await db.query('BEGIN');
    try {
      const inserted = await db.query<{ id: string }>(
        `INSERT INTO auction_lots (source_id, external_id, title, url, closes_on)
         VALUES ('00000000-0000-4000-a000-000000000005', 'test:1', '10 Laptops', 'https://example.gov/1', '2026-10-26') RETURNING id`,
      );
      const lotId = inserted.rows[0].id;
      const observe = (bid: number | null, bidders: number | null) =>
        db!.query(
          `INSERT INTO auction_bid_observations (lot_id, high_bid_minor, bidders) VALUES ($1, $2, $3)
           ON CONFLICT ON CONSTRAINT auction_bid_observations_distinct DO NOTHING`,
          [lotId, bid, bidders],
        );
      await observe(null, null);
      await observe(null, null);
      await observe(16000, 3);
      await observe(16000, 3);
      await observe(18000, 4);
      expect(
        (
          await db.query(
            'SELECT count(*)::int AS n FROM auction_bid_observations WHERE lot_id = $1',
            [lotId],
          )
        ).rows[0].n,
      ).toBe(3);
      const owner = await db.query<{ id: string }>('SELECT id FROM profiles LIMIT 1');
      const monitor = await db.query<{ id: string }>(
        `INSERT INTO monitors (user_id, kind, lot_id, cadence_minutes) VALUES ($1, 'lot', $2, 60) RETURNING id`,
        [owner.rows[0].id, lotId],
      );
      await db.query('SAVEPOINT no_target');
      await expect(
        db.query(
          `INSERT INTO alerts (user_id, monitor_id, kind, dedupe_key) VALUES ($1, $2, 'LOT_CLOSED', 'x')`,
          [owner.rows[0].id, monitor.rows[0].id],
        ),
      ).rejects.toThrow(/alerts_target_check/);
      await db.query('ROLLBACK TO SAVEPOINT no_target');
      await db.query(
        `INSERT INTO alerts (user_id, monitor_id, lot_id, kind, dedupe_key) VALUES ($1, $2, $3, 'LOT_CLOSED', 'closed:x')`,
        [owner.rows[0].id, monitor.rows[0].id, lotId],
      );
      await db.query('SET LOCAL ROLE authenticated');
      expect(
        (await db.query('SELECT id FROM auction_lots WHERE id = $1', [lotId])).rows,
      ).toHaveLength(1);
      await expect(
        db.query(`INSERT INTO auction_lots (source_id, external_id, title, url, closes_on)
                  VALUES ('00000000-0000-4000-a000-000000000005', 'test:2', 'x', 'https://example.gov/2', '2026-10-26')`),
      ).rejects.toThrow(/permission denied|row-level security/);
    } finally {
      await db.query('ROLLBACK');
    }
  });
});

describe('S11 lot monitors in the scheduler', () => {
  it('sweeps once for all due lots, schedules by closing date and stops after the close', async () => {
    const { MonitorScheduler } = await import('../apps/worker/src/MonitorScheduler');
    const row = (id: string, lotId: string) => ({
      id,
      user_id: 'u1',
      kind: 'lot' as const,
      project_id: null,
      listing_id: null,
      lot_id: lotId,
      source_id: null,
      cutoff: { maxBidMinor: 20000 },
      baseline: null,
      cadence_minutes: 60,
      active: true,
      next_run_at: '2026-10-24T00:00:00Z',
      last_run_at: null,
      created_at: '2026-10-24T00:00:00Z',
    });
    const inserted: Array<Record<string, unknown>> = [];
    const repository = {
      claimDue: vi.fn(async () => [row('m-open', 'lot-open'), row('m-closed', 'lot-closed')]),
      insertAlerts: vi.fn(async (rows: Array<Record<string, unknown>>) => {
        inserted.push(...rows);
        return rows;
      }),
      scheduleNext: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
    };
    const refreshAuctions = vi.fn(async () => ({ status: 'swept' }));
    const lots: Record<string, unknown> = {
      'lot-open': {
        id: 'lot-open',
        status: 'active',
        currentBidMinor: 24000,
        closesOn: '2026-10-26',
      },
      'lot-closed': {
        id: 'lot-closed',
        status: 'closed',
        currentBidMinor: 9000,
        closesOn: '2026-10-23',
      },
    };
    const results = await new MonitorScheduler({
      monitors: repository as never,
      enrichedProjectListings: vi.fn(),
      findListing: vi.fn(),
      circuitAllows: vi.fn(),
      queueCollection: vi.fn(),
      findLot: async (id) => lots[id] as never,
      refreshAuctions,
      now: () => new Date('2026-10-24T12:00:00Z'),
    }).runDue();
    expect(refreshAuctions).toHaveBeenCalledOnce();
    expect(results.map((result) => [result.monitorId, result.alerts, result.collection])).toEqual([
      ['m-open', 1, null],
      ['m-closed', 1, null],
    ]);
    expect(inserted.map((alert) => [alert.lot_id, alert.kind])).toEqual([
      ['lot-open', 'LOT_BID_ABOVE'],
      ['lot-closed', 'LOT_CLOSED'],
    ]);
    expect(repository.scheduleNext).toHaveBeenCalledWith(
      'm-open',
      new Date('2026-10-24T13:00:00Z'),
    );
    expect(repository.stop).toHaveBeenCalledWith('m-closed');
  });
});
