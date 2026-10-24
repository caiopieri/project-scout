import {
  ConnectorError,
  type ListingMapper,
  type ScrapingProvider,
  type SourceConnector,
} from '@scout/domain';
import {
  connectorSearchInputSchema,
  jsonObjectSchema,
  normalizedListingInputSchema,
  rawListingRecordSchema,
  type ConnectorSearchInput,
  type RawListingRecord,
} from '@scout/schemas';
import { SWAPPA_CONNECTOR_MANIFEST } from './manifest';
import { DEFAULT_SWAPPA_SELECTORS, type SwappaSelectorMap } from './selectors';

export { SWAPPA_CONNECTOR_MANIFEST } from './manifest';
export * from './selectors';
export * from './sandbox';

export const SWAPPA_BASE_URL = 'https://swappa.com';

const decode = (value: string) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

const text = (html: string) =>
  decode(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

export interface SwappaCard {
  code: string;
  priceMinor: number;
  sku: string;
  productName: string;
  brand: string;
  grade: string | null;
  storage: string | null;
  batteryHealth: string | null;
  color: string | null;
  carrier: string | null;
  location: string | null;
  sellerProfile: string | null;
  imageUrl: string | null;
  alt: string | null;
}

const attributeOf = (tag: string, names: string[]) => {
  for (const name of names) {
    const value = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
    if (value !== undefined) return value;
  }
  return undefined;
};

const hasClass = (tag: string, classes: string[]) => {
  const tokens = /\sclass="([^"]*)"/.exec(tag)?.[1].split(/\s+/) ?? [];
  return classes.some((name) => tokens.includes(name));
};

/** True when the page still carries the listings container, even with zero cards. */
export const hasSwappaListingsContainer = (
  html: string,
  selectors: SwappaSelectorMap = DEFAULT_SWAPPA_SELECTORS,
) =>
  [...html.matchAll(/<[a-z][^>]*>/gi)].some((match) =>
    hasClass(match[0], selectors.containerClass),
  );

/**
 * Parses the listing cards of a Swappa product listings page. Which tags are cards and which
 * attributes carry the code and price comes from the selector map; everything else is
 * schema.org microdata, which Swappa does not own.
 */
export const parseSwappaListingsPage = (
  html: string,
  selectors: SwappaSelectorMap = DEFAULT_SWAPPA_SELECTORS,
): SwappaCard[] => {
  const starts = [...html.matchAll(/<[a-z][^>]*>/gi)].flatMap((match) => {
    const tag = match[0];
    if (!hasClass(tag, selectors.cardClass)) return [];
    const code = attributeOf(tag, selectors.codeAttribute);
    const price = attributeOf(tag, selectors.priceAttribute);
    if (!code || !/^[A-Z0-9]{4,20}$/.test(code) || !price || !/^\d+(\.\d{1,2})?$/.test(price))
      return [];
    return [{ index: match.index ?? 0, code, price }];
  });
  return starts.map((start, index) => {
    const card = html.slice(start.index, starts[index + 1]?.index ?? html.length);
    const plain = text(card);
    const meta = (name: string) =>
      new RegExp(`itemprop="${name}" content="([^"]*)"`).exec(card)?.[1] ?? null;
    const alt = /itemprop="image"[^>]*alt="([^"]*)"/.exec(card)?.[1] ?? null;
    const altParts = alt
      ? decode(alt)
          .split(' - ')[1]
          ?.split(',')
          .map((part) => part.trim())
      : undefined;
    const [dollars, cents = '0'] = start.price.split('.');
    return {
      code: start.code,
      priceMinor: Number(dollars) * 100 + Number(cents.padEnd(2, '0').slice(0, 2)),
      sku: meta('sku') ?? 'unknown',
      productName: decode(meta('description') ?? ''),
      brand: decode(
        /itemprop="brand"[\s\S]*?itemprop="name" content="([^"]*)"/.exec(card)?.[1] ?? '',
      ),
      grade: /\b(New|Mint|Good|Fair)\s+condition\b/.exec(plain)?.[1] ?? null,
      storage: /Storage:\s*(\d+\s?[GT]B)/i.exec(plain)?.[1] ?? null,
      batteryHealth: /Battery Health:\s*(\d{1,3}%)/i.exec(plain)?.[1] ?? null,
      color: altParts?.[2] ?? /Color:\s*([A-Za-z]+)/.exec(plain)?.[1] ?? null,
      carrier: altParts?.[0] ?? null,
      location:
        /Ratings\s+([A-Z][a-zA-Z.]+(?: [A-Z][a-zA-Z.]+)*, [A-Z]{2})\b/.exec(plain)?.[1] ??
        /\b([A-Z][a-zA-Z.]+(?: [A-Z][a-zA-Z.]+)*, [A-Z]{2})\b/.exec(plain)?.[1] ??
        null,
      sellerProfile: /itemprop="url" content="(\/user\/[^"]+)"/.exec(card)?.[1] ?? null,
      imageUrl: /itemprop="image" src="([^"]+)"/.exec(card)?.[1] ?? null,
      alt: alt ? decode(alt) : null,
    };
  });
};

/** "Apple iPhone 13" + brand "Apple" → "iPhone 13". */
const modelFrom = (productName: string, brand: string) =>
  productName.startsWith(`${brand} `) ? productName.slice(brand.length + 1) : productName;

export const swappaProductSlug = (input: ConnectorSearchInput) => {
  const brand = input.criteria.brands[0];
  const model = input.criteria.models[0];
  if (!brand || !model)
    throw new ConnectorError(
      'Swappa search needs a brand and a model to resolve the product page.',
      'permanent',
      'SWAPPA_PRODUCT_UNRESOLVED',
    );
  return `${brand} ${model}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
};

export type SwappaMode = 'disabled' | 'fixture' | 'live';

/**
 * Layer-4 connector. Search reads one product listings page; details come from the same card,
 * so a sweep costs one request. Live mode refuses to run while the manifest's live policy says
 * no; fixture mode only accepts a loopback base URL serving recorded pages.
 */
export class SwappaConnector implements SourceConnector {
  readonly source = 'swappa';
  readonly provider: string;
  readonly manifest = SWAPPA_CONNECTOR_MANIFEST;
  private readonly cards = new Map<string, SwappaCard>();
  private requestsUsed = 0;
  /** Raw HTML of the last page fetched, kept so canaries can store it for diagnosis. */
  lastPage: string | null = null;

  constructor(
    private readonly scraper: ScrapingProvider,
    private readonly mode: SwappaMode,
    private readonly baseUrl = SWAPPA_BASE_URL,
    // A map, or a loader for the active one, resolved on the first search only.
    private readonly selectorSource:
      SwappaSelectorMap | (() => Promise<SwappaSelectorMap>) = DEFAULT_SWAPPA_SELECTORS,
  ) {
    this.provider = `swappa-html-${mode}`;
  }

  private assertRunnable() {
    if (this.mode === 'disabled')
      throw new ConnectorError('Swappa connector is disabled.', 'permanent', 'SOURCE_DISABLED');
    if (this.mode === 'live' && !this.manifest.livePolicy?.allowed)
      throw new ConnectorError(
        `Live collection is not permitted: ${this.manifest.livePolicy?.reason ?? 'no policy'}`,
        'permanent',
        'SOURCE_LIVE_NOT_PERMITTED',
      );
    if (
      this.mode === 'fixture' &&
      !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(this.baseUrl)
    )
      throw new ConnectorError(
        'Fixture mode needs a loopback base URL.',
        'permanent',
        'SOURCE_FIXTURE_URL_INVALID',
      );
  }

  getRequestMetrics() {
    return { requestsUsed: this.requestsUsed, requestBudget: this.manifest.limits.maxPages };
  }

  async search(rawInput: ConnectorSearchInput) {
    this.assertRunnable();
    const input = connectorSearchInputSchema.parse(rawInput);
    if (input.cursor) return { items: [] };
    const slug = swappaProductSlug(input);
    this.requestsUsed += 1;
    const page = await this.scraper.fetchPage({ url: `${this.baseUrl}/listings/${slug}` });
    this.lastPage = page.content;
    const selectors =
      typeof this.selectorSource === 'function' ? await this.selectorSource() : this.selectorSource;
    const cards = parseSwappaListingsPage(page.content, selectors);
    if (!cards.length && !hasSwappaListingsContainer(page.content, selectors))
      throw new ConnectorError('Swappa page layout changed.', 'permanent', 'CONTENT_CHANGED');
    for (const card of cards) this.cards.set(card.code, card);
    return {
      items: cards.slice(0, input.limit).map((card) => ({
        externalId: card.code,
        url: `${SWAPPA_BASE_URL}/listing/view/${card.code}`,
        title: card.alt ?? `${card.productName} ${card.storage ?? ''} ${card.grade ?? ''}`.trim(),
        price: { amountMinor: card.priceMinor, currency: 'USD' as const },
        imageUrl: card.imageUrl ?? undefined,
        sellerExternalId: card.sellerProfile?.split('/')[2],
      })),
    };
  }

  async fetchDetails(externalId: string): Promise<RawListingRecord> {
    const card = this.cards.get(externalId);
    if (!card)
      throw new ConnectorError(
        'Swappa card not found in the current sweep.',
        'permanent',
        'DETAIL_NOT_FOUND',
      );
    return rawListingRecordSchema.parse({
      preview: {
        externalId: card.code,
        url: `${SWAPPA_BASE_URL}/listing/view/${card.code}`,
        title: card.alt ?? card.productName,
        price: { amountMinor: card.priceMinor, currency: 'USD' },
        imageUrl: card.imageUrl ?? undefined,
        sellerExternalId: card.sellerProfile?.split('/')[2],
      },
      payload: { source: 'swappa', card: { ...card } },
    });
  }
}

/** Swappa vocabulary stays here: grades become the listing condition, fields become specs. */
export class SwappaListingMapper implements ListingMapper {
  map(input: RawListingRecord) {
    const record = rawListingRecordSchema.parse(input);
    const payload = jsonObjectSchema.parse(record.payload);
    const card = (payload.card ?? {}) as Partial<SwappaCard>;
    const brand = card.brand || 'unknown';
    const specifications = Object.fromEntries(
      [
        ['storage', card.storage],
        ['batteryHealth', card.batteryHealth],
        ['color', card.color],
        ['carrier', card.carrier],
        ['sku', card.sku],
      ].filter(([, value]) => typeof value === 'string' && value),
    ) as Record<string, string>;
    return normalizedListingInputSchema.parse({
      externalId: record.preview.externalId,
      url: record.preview.url,
      title: record.preview.title,
      description: Object.entries(specifications)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n'),
      condition: card.grade ? `Used - ${card.grade}` : 'Unknown',
      currency: record.preview.price.currency,
      priceMinor: record.preview.price.amountMinor,
      // Shipping is not shown on the listings page; unknown stays unknown, never zero.
      shippingCostMinor: null,
      totalVisibleCostMinor: record.preview.price.amountMinor,
      location: card.location ?? undefined,
      status: 'active',
      specifications,
      images: record.preview.imageUrl ? [{ url: record.preview.imageUrl, position: 0 }] : [],
      inferredProduct:
        card.productName && brand !== 'unknown'
          ? { brand, model: modelFrom(card.productName, brand), confidence: 0.9 }
          : null,
      rawDataMetadata: { mapper: 'swappa-v1', shippingCostKnown: false },
    });
  }
}
