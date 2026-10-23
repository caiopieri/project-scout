import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  extractSchemaOrgOffers,
  HttpScrapingProvider,
  parseRobotsTxt,
  robotsDecision,
} from '@scout/collection';
import {
  parseSwappaListingsPage,
  SwappaConnector,
  SwappaListingMapper,
} from '@scout/swappa-connector';

const fixture = readFileSync('tests/fixtures/swappa/listings-apple-iphone-13.html', 'utf8');
const criteria = { brands: ['Apple'], models: ['iPhone 13'] } as never;

const site = (pages: Record<string, Response | (() => Response)>) =>
  vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const page = Object.entries(pages).find(([path]) => url.endsWith(path))?.[1];
    if (!page) return new Response('not found', { status: 404 });
    return typeof page === 'function' ? page() : page.clone();
  });

describe('S5 robots.txt', () => {
  const groups = parseRobotsTxt(
    [
      'User-agent: *',
      'Disallow: /private',
      'Allow: /private/ok',
      'Crawl-delay: 2',
      '',
      'User-agent: ScoutBot',
      'Disallow: /',
    ].join('\n'),
  );

  it('picks the specific group, longest match wins, allow wins ties', () => {
    expect(robotsDecision(groups, 'ScoutBot/0.1', '/anything').allowed).toBe(false);
    expect(robotsDecision(groups, 'OtherBot/1', '/private/x').allowed).toBe(false);
    expect(robotsDecision(groups, 'OtherBot/1', '/private/ok/1')).toEqual({
      allowed: true,
      crawlDelaySeconds: 2,
    });
    expect(
      robotsDecision(parseRobotsTxt('User-agent: *\nDisallow:'), 'ScoutBot', '/x').allowed,
    ).toBe(true);
  });
});

describe('S5 HTTP provider', () => {
  const quick = (fetcher: typeof fetch) =>
    new HttpScrapingProvider({
      fetcher,
      minIntervalMs: 1000,
      now: () => 0,
      sleep: vi.fn(async () => undefined),
    });

  it('refuses paths robots.txt disallows before requesting them', async () => {
    const fetcher = site({ '/robots.txt': new Response('User-agent: *\nDisallow: /listings') });
    await expect(
      quick(fetcher).fetchPage({ url: 'http://127.0.0.1:9/listings/x' }),
    ).rejects.toMatchObject({ code: 'ROBOTS_DISALLOWED' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('identifies itself and paces requests per host', async () => {
    const sleep = vi.fn(async () => undefined);
    const fetcher = site({
      '/robots.txt': new Response(''),
      '/a': () => new Response('<html>a</html>'),
    });
    const provider = new HttpScrapingProvider({
      fetcher,
      minIntervalMs: 4000,
      now: () => 1000,
      sleep,
    });
    await provider.fetchPage({ url: 'http://127.0.0.1:9/a' });
    await provider.fetchPage({ url: 'http://127.0.0.1:9/a' });
    expect(sleep).toHaveBeenCalledWith(4000);
    const headers = (fetcher.mock.calls[1] as unknown as [string, RequestInit])[1]
      .headers as Record<string, string>;
    expect(headers['User-Agent']).toMatch(/^ScoutBot\//);
  });

  it('treats blocks as terminal and never retries around them', async () => {
    for (const [response, code] of [
      [new Response('nope', { status: 403 }), 'SOURCE_BLOCKED'],
      [new Response('slow down', { status: 429 }), 'RATE_LIMITED'],
      [new Response('<html>Please solve the CAPTCHA</html>', { status: 200 }), 'CAPTCHA'],
      [new Response('<html>Just a moment...</html>', { status: 503 }), 'SOURCE_BLOCKED'],
    ] as const) {
      const fetcher = site({ '/robots.txt': new Response(''), '/p': response });
      await expect(quick(fetcher).fetchPage({ url: 'http://127.0.0.1:9/p' })).rejects.toMatchObject(
        { code, kind: 'permanent' },
      );
      expect(fetcher).toHaveBeenCalledTimes(2);
    }
  });
});

describe('S5 Swappa connector on a recorded page', () => {
  it('parses every card with price in minor units and structured fields', () => {
    const cards = parseSwappaListingsPage(fixture);
    expect(cards).toHaveLength(8);
    expect(cards[0]).toMatchObject({
      code: 'LALI60499',
      priceMinor: 19500,
      brand: 'Apple',
      productName: 'Apple iPhone 13',
      grade: 'Fair',
      storage: '128GB',
      batteryHealth: '90%',
      location: 'Morton Grove, IL',
    });
  });

  it('collects through the provider from a loopback fixture and maps without inventing shipping', async () => {
    const fetcher = site({
      '/robots.txt': new Response('User-agent: *\nDisallow: /cgi-bin/'),
      '/listings/apple-iphone-13': new Response(fixture),
    });
    const connector = new SwappaConnector(
      new HttpScrapingProvider({ fetcher, minIntervalMs: 0 }),
      'fixture',
      'http://127.0.0.1:8099',
    );
    const page = await connector.search({ criteria, limit: 50 });
    expect(page.items).toHaveLength(8);
    const record = await connector.fetchDetails(page.items[0].externalId);
    const listing = new SwappaListingMapper().map(record);
    expect(listing).toMatchObject({
      url: 'https://swappa.com/listing/view/LALI60499',
      condition: 'Used - Fair',
      priceMinor: 19500,
      shippingCostMinor: null,
      inferredProduct: { brand: 'Apple', model: 'iPhone 13' },
      rawDataMetadata: { shippingCostKnown: false },
    });
    expect(connector.getRequestMetrics().requestsUsed).toBe(1);
  });

  it('refuses live mode while the live policy forbids it, and non-loopback fixtures', async () => {
    const fetcher = vi.fn();
    const live = new SwappaConnector(new HttpScrapingProvider({ fetcher }), 'live');
    await expect(live.search({ criteria, limit: 5 })).rejects.toMatchObject({
      code: 'SOURCE_LIVE_NOT_PERMITTED',
    });
    const fake = new SwappaConnector(
      new HttpScrapingProvider({ fetcher }),
      'fixture',
      'https://swappa.com',
    );
    await expect(fake.search({ criteria, limit: 5 })).rejects.toMatchObject({
      code: 'SOURCE_FIXTURE_URL_INVALID',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('S5 generic schema.org extraction', () => {
  it('reads JSON-LD offers with price in minor units, skipping malformed blocks', () => {
    const html = `<script type="application/ld+json">{bad json</script>
      <script type="application/ld+json">{"@type":"Product","name":"MacBook Air M2","sku":"MBA-M2","image":"/img/a.jpg",
      "offers":{"@type":"Offer","price":"649.90","priceCurrency":"USD","url":"/p/mba-m2","itemCondition":"https://schema.org/UsedCondition"}}</script>`;
    const [document] = extractSchemaOrgOffers(html, 'https://shop.example');
    expect(document).toMatchObject({
      url: 'https://shop.example/p/mba-m2',
      externalId: 'MBA-M2',
      title: 'MacBook Air M2',
      price: { amountMinor: 64990, currency: 'USD' },
      imageUrls: ['https://shop.example/img/a.jpg'],
      fields: { itemCondition: 'UsedCondition' },
    });
  });
});
