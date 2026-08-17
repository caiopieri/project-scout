import { ConnectorError, SourceConnector } from '@scout/domain';
import {
  connectorSearchInputSchema,
  rawListingRecordSchema,
  type RawListingRecord,
} from '@scout/schemas';
import { EBAY_CONNECTOR_MANIFEST } from './manifest';

export { EBAY_CONNECTOR_MANIFEST } from './manifest';

const FIXTURES: RawListingRecord[] = [
  ['mock-ebay-1001', 'Apple iPhone 13 128GB cracked screen - powers on', 28500, 'repair_shop_1'],
  ['mock-ebay-1002', 'Apple iPhone 13 128GB parts only - not tested', 21000, 'parts_store_2'],
  ['mock-ebay-1003', 'iPhone 13 Activation Lock cracked back glass', 19000, 'seller_3'],
  [
    'mock-ebay-1004',
    'Apple iPhone 13 screen damaged, description says no power',
    24000,
    'seller_4',
  ],
  ['mock-ebay-1005', 'iPhone 13 128GB repair lot - condition unknown', 17500, 'seller_5'],
].map(([externalId, title, amountMinor, sellerExternalId]) =>
  rawListingRecordSchema.parse({
    preview: {
      externalId,
      url: `https://www.ebay.com/itm/${externalId}`,
      title,
      price: { amountMinor, currency: 'USD' },
      imageUrl: `https://i.ebayimg.com/images/g/${externalId}/s-l1600.jpg`,
      sellerExternalId,
    },
    payload: {
      fixture: true,
      conditionId: '7000',
      condition: 'For parts or not working',
      description: title,
    },
  }),
);

export type MockFailurePoint = 'search' | 'details';

export class MockEbayConnector implements SourceConnector {
  readonly source = 'ebay' as const;
  readonly provider = 'ebay-mock-v1';
  readonly manifest = EBAY_CONNECTOR_MANIFEST;

  constructor(private readonly failurePoint?: MockFailurePoint) {}

  async search(rawInput: Parameters<SourceConnector['search']>[0]) {
    if (this.failurePoint === 'search') {
      throw new ConnectorError(
        'Injected mock search failure.',
        'transient',
        'MOCK_SEARCH_UNAVAILABLE',
      );
    }
    const input = connectorSearchInputSchema.parse(rawInput);
    const offset = input.cursor ? Number(input.cursor) : 0;
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new ConnectorError('Invalid mock cursor.', 'permanent', 'INVALID_CURSOR');
    }
    const pageSize = Math.min(5, input.limit);
    const items = FIXTURES.slice(offset, offset + pageSize).map(({ preview }) => preview);
    const nextOffset = offset + items.length;
    return { items, nextCursor: nextOffset < FIXTURES.length ? String(nextOffset) : undefined };
  }

  async fetchDetails(externalId: string) {
    if (this.failurePoint === 'details') {
      throw new ConnectorError('Injected mock detail failure.', 'permanent', 'MOCK_DETAIL_INVALID');
    }
    const item = FIXTURES.find(({ preview }) => preview.externalId === externalId);
    if (!item)
      throw new ConnectorError('Mock listing not found.', 'permanent', 'MOCK_LISTING_NOT_FOUND');
    return structuredClone(item);
  }
}

export const EBAY_MOCK_FIXTURES = FIXTURES.map((fixture) => structuredClone(fixture));
export const EBAY_CONNECTOR_MARKER = '@scout/ebay-connector';

export * from './api-schemas';
export * from './EbayApiAdapter';
export * from './ListingMapper';
export * from './oauth';
export * from './notifications';
export * from './query';
export * from './rate-limit';
