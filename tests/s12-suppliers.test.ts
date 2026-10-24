import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Client } from 'pg';
import { extractSupplierPage } from '@scout/collection';
import {
  buildSupplyLadder,
  checkContact,
  parseSupplierQuotesCsv,
  unitPriceAt,
} from '@scout/domain';
import type { LadderOffer } from '@scout/domain';
import { supplierFromPage, verifyContacts } from '../apps/worker/src/SupplierService';

const page = (name: string) => readFileSync(`tests/fixtures/suppliers/${name}.html`, 'utf8');

describe('S12 supplier page extraction (recorded excerpts)', () => {
  it('reads the seller, its approved-reseller claim with evidence and the offer', () => {
    const extracted = extractSupplierPage(
      page('pimoroni-raspberry-pi-5'),
      'https://shop.pimoroni.com/products/raspberry-pi-5',
    );
    expect(extracted.name).toBe('Pimoroni');
    expect(extracted.website).toBe('https://shop.pimoroni.com');
    expect(extracted.claims).toEqual([
      expect.objectContaining({ claim: 'approved reseller', level: 'reseller' }),
    ]);
    expect(extracted.claims[0].evidence).toContain('Raspberry Pi Approved Reseller');
    expect(extracted.offers[0]).toMatchObject({
      currency: 'GBP',
      sku: 'SC2162',
      tiers: [{ minQuantity: 1, unitPriceMinor: 4320 }],
      declaredMinimum: null,
    });
  });

  it('reads contact points from structured data', () => {
    const extracted = extractSupplierPage(
      page('thepihut-contact'),
      'https://thepihut.com/pages/contact-us',
    );
    expect(extracted.name).toBe('The Pi Hut');
    expect(extracted.contacts).toEqual(
      expect.arrayContaining([
        { kind: 'email', value: 'contact@thepihut.com' },
        expect.objectContaining({ kind: 'phone' }),
      ]),
    );
    expect(extracted.offers).toEqual([]);
  });

  it('builds quantity tiers only when the page declares eligibleQuantity', () => {
    const html = `<script type="application/ld+json">{"@type":"Product","name":"Pi 5 4GB","offers":[
      {"@type":"Offer","price":"39.40","priceCurrency":"GBP","eligibleQuantity":{"@type":"QuantitativeValue","minValue":250}},
      {"@type":"Offer","price":"41.00","priceCurrency":"GBP","eligibleQuantity":{"@type":"QuantitativeValue","minValue":50}}]}</script>
      <p>We are an authorised distributor.</p>`;
    const extracted = extractSupplierPage(html, 'https://distribution.example.com/p');
    expect(extracted.offers[0]).toMatchObject({
      tiers: [
        { minQuantity: 50, unitPriceMinor: 4100 },
        { minQuantity: 250, unitPriceMinor: 3940 },
      ],
      declaredMinimum: 50,
    });
    expect(extracted.claims.map((claim) => claim.level)).toContain('distributor');
  });

  it('records a retail minimum as an assumption and refuses a supplier without a level', () => {
    const pimoroni = extractSupplierPage(
      page('pimoroni-raspberry-pi-5'),
      'https://shop.pimoroni.com/products/raspberry-pi-5',
    );
    const supplier = supplierFromPage(
      pimoroni,
      'raspberry-pi-5',
      'https://shop.pimoroni.com/products/raspberry-pi-5',
    );
    expect('error' in supplier).toBe(false);
    if ('error' in supplier) return;
    expect(supplier.level).toBe('reseller');
    expect(supplier.offers[0].moq).toEqual({
      value: 1,
      origin: 'assumed',
      basis: 'retail storefront with no minimum shown',
    });
    const one = supplierFromPage(
      pimoroni,
      'raspberry-pi-5',
      'https://shop.pimoroni.com/products/raspberry-pi-5',
      undefined,
      'SC2162',
    );
    if (!('error' in one)) expect(one.offers.map((offer) => offer.sku)).toEqual(['SC2162']);
    expect(
      supplierFromPage(
        pimoroni,
        'raspberry-pi-5',
        'https://shop.pimoroni.com/products/raspberry-pi-5',
        undefined,
        'NOPE',
      ),
    ).toEqual({ error: 'This page does not offer SKU NOPE.' });
    const contactPage = supplierFromPage(
      { ...pimoroni, offers: [], contacts: [] },
      'raspberry-pi-5',
      'https://shop.pimoroni.com/pages/contact-us',
    );
    if (!('error' in contactPage))
      expect(contactPage.contacts).toEqual([
        { kind: 'url', value: 'https://shop.pimoroni.com/pages/contact-us' },
      ]);
    const anonymous = { ...pimoroni, claims: [] };
    expect(supplierFromPage(anonymous, 'raspberry-pi-5', 'https://x.example')).toHaveProperty(
      'error',
    );
    const distributor = supplierFromPage(
      anonymous,
      'raspberry-pi-5',
      'https://x.example',
      'distributor',
    );
    if (!('error' in distributor)) expect(distributor.offers[0].moq.origin).toBe('unknown');
  });
});

describe('S12 contact verification (never contacts anyone)', () => {
  it('checks format and whether the contact belongs to the supplier website', () => {
    expect(checkContact('email', 'contact@thepihut.com', 'https://thepihut.com')).toMatchObject({
      format: true,
      domainMatchesWebsite: true,
    });
    expect(
      checkContact('email', 'support@pimoroni.com', 'https://shop.pimoroni.com'),
    ).toMatchObject({ domainMatchesWebsite: true });
    expect(checkContact('email', 'thepihut@gmail.com', 'https://thepihut.com')).toMatchObject({
      domainMatchesWebsite: false,
    });
    expect(checkContact('email', 'not-an-email', 'https://thepihut.com').format).toBe(false);
    expect(checkContact('phone', '01440 510772').format).toBe(true);
    expect(checkContact('phone', '12').format).toBe(false);
  });

  it('looks up mail exchange over DNS-over-HTTPS and records failures as unknown', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes('thepihut.com')) return Response.json({ Status: 0, Answer: [{ type: 15 }] });
      if (url.includes('nomail.example')) return Response.json({ Status: 0 });
      throw new Error('offline');
    });
    const result = await verifyContacts(
      [
        { kind: 'email', value: 'contact@thepihut.com' },
        { kind: 'email', value: 'a@nomail.example' },
        { kind: 'email', value: 'b@down.example' },
      ],
      'https://thepihut.com',
      fetcher as unknown as typeof fetch,
    );
    expect(result.get('email:contact@thepihut.com')).toMatchObject({
      format: true,
      domainMatchesWebsite: true,
      mailExchange: true,
    });
    expect(result.get('email:a@nomail.example')?.mailExchange).toBe(false);
    expect(result.get('email:b@down.example')?.mailExchange).toBeNull();
  });
});

describe('S12 quotes import', () => {
  it('imports valid quotes with their tiers and reports bad rows by number', () => {
    const { suppliers, errors } = parseSupplierQuotesCsv(
      readFileSync('tests/fixtures/suppliers/quotes-raspberry-pi-5.csv', 'utf8'),
    );
    expect(suppliers.map((supplier) => [supplier.name, supplier.level])).toEqual([
      ['Example Licensed Manufacturing Ltd', 'factory'],
      ['Example Electronics Distribution', 'distributor'],
    ]);
    expect(suppliers[1].offers[0]).toMatchObject({
      moq: { value: 50, origin: 'stated' },
      sku: 'SC1110',
      tiers: [
        { minQuantity: 50, unitPriceMinor: 6000 },
        { minQuantity: 250, unitPriceMinor: 5820 },
        { minQuantity: 1000, unitPriceMinor: 5690 },
      ],
      leadTimeDays: 10,
      incoterm: 'DAP',
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].row).toBe(4);
    expect(parseSupplierQuotesCsv('name,price\nx,1').errors[0].error).toMatch(/missing columns/);
  });
});

describe('S12 supply ladder', () => {
  const offer = (
    name: string,
    level: LadderOffer['level'],
    moq: number | null,
    tiers: Array<[number, number]>,
  ): LadderOffer => ({
    supplierId: name,
    supplierName: name,
    level,
    country: 'GB',
    website: null,
    contacts: [],
    title: 'Raspberry Pi 5',
    currency: 'GBP',
    tiers: tiers.map(([minQuantity, unitPriceMinor]) => ({ minQuantity, unitPriceMinor })),
    moq: { value: moq, origin: moq === null ? 'unknown' : 'stated', basis: '' },
    leadTimeDays: null,
    incoterm: null,
    sourceUrl: null,
  });

  it('prices at the volume from tiers', () => {
    const tiers = [
      { minQuantity: 50, unitPriceMinor: 4100 },
      { minQuantity: 250, unitPriceMinor: 3940 },
    ];
    expect(unitPriceAt(tiers, 49)).toBeNull();
    expect(unitPriceAt(tiers, 50)).toBe(4100);
    expect(unitPriceAt(tiers, 300)).toBe(3940);
  });

  it('orders levels down the chain and says who is out of reach at this volume', () => {
    const ladder = buildSupplyLadder(
      [
        offer('Reseller', 'reseller', 1, [[1, 4320]]),
        offer('Factory', 'factory', 1000, [
          [1000, 3650],
          [5000, 3520],
        ]),
        offer('Distributor', 'distributor', 50, [
          [50, 4100],
          [250, 3940],
        ]),
        offer('Unknown MOQ', 'distributor', null, [[1, 4000]]),
      ],
      60,
    );
    expect(ladder.map((group) => group.level)).toEqual(['factory', 'distributor', 'reseller']);
    const [factory, distributor, reseller] = ladder;
    expect(factory.entries[0]).toMatchObject({
      accessible: false,
      reason: 'MOQ 1000 > volume 60',
      unitPriceAtVolumeMinor: null,
      priceRange: { minMinor: 3520, maxMinor: 3650 },
    });
    expect(
      distributor.entries.map((entry) => [
        entry.supplierName,
        entry.accessible,
        entry.unitPriceAtVolumeMinor,
      ]),
    ).toEqual([
      ['Distributor', true, 4100],
      ['Unknown MOQ', null, null],
    ]);
    expect(reseller.entries[0]).toMatchObject({
      accessible: true,
      unitPriceAtVolumeMinor: 4320,
      totalAtVolumeMinor: 4320 * 60,
    });
  });
});

describe('S12 suppliers in the database', () => {
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

  it("keeps a user's suppliers, contacts and offers invisible to other users", async (ctx) => {
    if (!db) return ctx.skip();
    await db.query('BEGIN');
    try {
      const owner = (await db.query<{ id: string }>('SELECT id FROM profiles LIMIT 1')).rows[0].id;
      const supplier = await db.query<{ id: string }>(
        `INSERT INTO suppliers (user_id, name, identity, level, origin) VALUES ($1, 'Quote Co', 'name:quote co', 'factory', 'imported') RETURNING id`,
        [owner],
      );
      await db.query(
        `INSERT INTO supplier_offers (supplier_id, product_key, title, currency, tiers, moq)
         VALUES ($1, 'raspberry-pi-5', 'Pi 5', 'GBP', '[{"minQuantity":1000,"unitPriceMinor":3650}]', '{"value":1000,"origin":"stated","basis":"quote"}')`,
        [supplier.rows[0].id],
      );
      await db.query('SET LOCAL ROLE authenticated');
      await db.query(
        "SELECT set_config('request.jwt.claim.sub', '99999999-9999-4999-a999-999999999999', true)",
      );
      expect(
        (await db.query('SELECT id FROM suppliers WHERE id = $1', [supplier.rows[0].id])).rows,
      ).toEqual([]);
      expect(
        (
          await db.query(
            "SELECT id FROM supplier_offers WHERE product_key = 'raspberry-pi-5' AND supplier_id = $1",
            [supplier.rows[0].id],
          )
        ).rows,
      ).toEqual([]);
      await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [owner]);
      expect(
        (await db.query('SELECT id FROM suppliers WHERE id = $1', [supplier.rows[0].id])).rows,
      ).toHaveLength(1);
    } finally {
      await db.query('ROLLBACK');
    }
  });
});
