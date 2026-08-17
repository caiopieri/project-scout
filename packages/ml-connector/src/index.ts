import { ConnectorError, SourceConnector } from '@scout/domain';
import {
  connectorSearchInputSchema,
  rawListingRecordSchema,
  type RawListingRecord,
} from '@scout/schemas';
import { MERCADO_LIVRE_CONNECTOR_MANIFEST } from './manifest';

export * from './api-schemas';
export * from './manifest';
export * from './MercadoLivreApiAdapter';
export * from './oauth';
export * from './query';

const FIXTURE_DATA: readonly [string, string, number, string][] = [
  ['mock-mlb-1001', 'Apple iPhone 13 128GB tela quebrada', 1450, 'seller-ml-1'],
  ['mock-mlb-1002', 'Apple iPhone 13 128GB para peças', 980, 'seller-ml-2'],
  ['mock-mlb-1003', 'Apple iPhone 13 bloqueado para reparo', 720, 'seller-ml-3'],
];

const FIXTURES: RawListingRecord[] = FIXTURE_DATA.map(
  ([externalId, title, amountReais, sellerExternalId]) =>
    rawListingRecordSchema.parse({
      preview: {
        externalId,
        url: `https://produto.mercadolivre.com.br/${externalId}`,
        title,
        price: { amountMinor: amountReais * 100, currency: 'BRL' },
        imageUrl: `https://http2.mlstatic.com/${externalId}.jpg`,
        sellerExternalId,
      },
      payload: {
        fixture: true,
        site_id: 'MLB',
        condition: 'used',
        description: title,
      },
    }),
);

export type MockMercadoLivreFailurePoint = 'search' | 'details';

export class MockMercadoLivreConnector implements SourceConnector {
  readonly source = 'mercadolivre' as const;
  readonly provider = 'mercadolivre-mock-v1';
  readonly manifest = MERCADO_LIVRE_CONNECTOR_MANIFEST;

  constructor(private readonly failurePoint?: MockMercadoLivreFailurePoint) {}

  async search(rawInput: Parameters<SourceConnector['search']>[0]) {
    if (this.failurePoint === 'search') {
      throw new ConnectorError(
        'Injected mock search failure.',
        'transient',
        'ML_MOCK_SEARCH_UNAVAILABLE',
      );
    }
    const input = connectorSearchInputSchema.parse(rawInput);
    const offset = input.cursor ? Number(input.cursor) : 0;
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new ConnectorError('Invalid mock cursor.', 'permanent', 'ML_INVALID_CURSOR');
    }
    const items = FIXTURES.slice(offset, offset + Math.min(5, input.limit)).map(
      ({ preview }) => preview,
    );
    const nextOffset = offset + items.length;
    return { items, nextCursor: nextOffset < FIXTURES.length ? String(nextOffset) : undefined };
  }

  async fetchDetails(externalId: string) {
    if (this.failurePoint === 'details') {
      throw new ConnectorError(
        'Injected mock detail failure.',
        'permanent',
        'ML_MOCK_DETAIL_INVALID',
      );
    }
    const item = FIXTURES.find(({ preview }) => preview.externalId === externalId);
    if (!item) {
      throw new ConnectorError('Mock listing not found.', 'permanent', 'ML_LISTING_NOT_FOUND');
    }
    return structuredClone(item);
  }
}

export class UnavailableMercadoLivreConnector implements SourceConnector {
  readonly source = 'mercadolivre' as const;
  readonly provider = 'mercadolivre-unavailable-v1';
  readonly manifest = MERCADO_LIVRE_CONNECTOR_MANIFEST;

  async search(): Promise<never> {
    throw new ConnectorError(
      'Mercado Livre live integration is not configured.',
      'permanent',
      'ML_CONFIGURATION_MISSING',
    );
  }

  async fetchDetails(): Promise<never> {
    throw new ConnectorError(
      'Mercado Livre live integration is not configured.',
      'permanent',
      'ML_CONFIGURATION_MISSING',
    );
  }
}

export const ML_MOCK_FIXTURES = FIXTURES.map((fixture) => structuredClone(fixture));
export const ML_CONNECTOR_MARKER = '@scout/ml-connector';
