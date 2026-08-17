import { ConnectorError, SourceConnector } from '@scout/domain';
import {
  connectorSearchInputSchema,
  rawListingRecordSchema,
  type RawListingRecord,
} from '@scout/schemas';
import { XIANYU_CONNECTOR_MANIFEST } from './manifest';

export { XIANYU_CONNECTOR_MANIFEST } from './manifest';

const FIXTURE_DATA: readonly [string, string, number, string][] = [
  ['xianyu-fixture-1001', '闲鱼 iPhone 13 128GB 屏幕破损', 980, 'seller-xianyu-1'],
  ['xianyu-fixture-1002', '闲鱼 iPhone 13 配件机', 620, 'seller-xianyu-2'],
];

const FIXTURES: RawListingRecord[] = FIXTURE_DATA.map(
  ([externalId, title, amountYuan, sellerExternalId]) =>
    rawListingRecordSchema.parse({
      preview: {
        externalId,
        url: `https://www.goofish.com/item?id=${externalId}`,
        title,
        price: { amountMinor: amountYuan * 100, currency: 'CNY' },
        imageUrl: `https://img.alicdn.com/${externalId}.jpg`,
        sellerExternalId,
      },
      payload: {
        fixture: true,
        source: 'xianyu',
        description: title,
      },
    }),
);

export class MockXianyuConnector implements SourceConnector {
  readonly source = 'xianyu' as const;
  readonly provider = 'xianyu-mock-v1';
  readonly manifest = XIANYU_CONNECTOR_MANIFEST;

  async search(rawInput: Parameters<SourceConnector['search']>[0]) {
    const input = connectorSearchInputSchema.parse(rawInput);
    const offset = input.cursor ? Number(input.cursor) : 0;
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new ConnectorError('Invalid Xianyu mock cursor.', 'permanent', 'XIANYU_INVALID_CURSOR');
    }
    const items = FIXTURES.slice(offset, offset + Math.min(5, input.limit)).map(
      ({ preview }) => preview,
    );
    const nextOffset = offset + items.length;
    return { items, nextCursor: nextOffset < FIXTURES.length ? String(nextOffset) : undefined };
  }

  async fetchDetails(externalId: string) {
    const item = FIXTURES.find(({ preview }) => preview.externalId === externalId);
    if (!item) {
      throw new ConnectorError(
        'Xianyu mock listing not found.',
        'permanent',
        'XIANYU_LISTING_NOT_FOUND',
      );
    }
    return structuredClone(item);
  }
}

export class UnavailableXianyuConnector implements SourceConnector {
  readonly source = 'xianyu' as const;
  readonly provider = 'xianyu-unavailable-v1';
  readonly manifest = XIANYU_CONNECTOR_MANIFEST;

  async search(): Promise<never> {
    throw new ConnectorError(
      'Xianyu live catalog integration is not available in the MVP.',
      'permanent',
      'XIANYU_CONFIGURATION_MISSING',
    );
  }

  async fetchDetails(): Promise<never> {
    throw new ConnectorError(
      'Xianyu live catalog integration is not available in the MVP.',
      'permanent',
      'XIANYU_CONFIGURATION_MISSING',
    );
  }
}

export const XIANYU_MOCK_FIXTURES = FIXTURES.map((fixture) => structuredClone(fixture));
export const XIANYU_CONNECTOR_MARKER = '@scout/xianyu-connector';
