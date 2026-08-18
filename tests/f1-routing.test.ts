import { describe, expect, it } from 'vitest';
import {
  DefaultCollectionGateway,
  BoundedCollectionQueryRunner,
  GenericListingMapper,
  SourceCollectionGatewayRegistry,
} from '@scout/collection';
import { MockEbayConnector } from '@scout/ebay-connector';
import { MockMercadoLivreConnector } from '@scout/ml-connector';
import { MockXianyuConnector } from '@scout/xianyu-connector';

const gateways = new SourceCollectionGatewayRegistry([
  ['ebay-source', new DefaultCollectionGateway(new MockEbayConnector())],
  ['ml-source', new DefaultCollectionGateway(new MockMercadoLivreConnector())],
  ['xianyu-source', new DefaultCollectionGateway(new MockXianyuConnector())],
]);

describe('F1 source routing and generic normalization boundary', () => {
  it('resolves each configured source independently', () => {
    expect(gateways.resolve('ebay-source').provider).toBe('ebay-mock-v1');
    expect(gateways.resolve('ml-source').provider).toBe('mercadolivre-mock-v1');
    expect(gateways.resolve('xianyu-source').provider).toBe('xianyu-mock-v1');
  });

  it('fails closed for an unknown source', () => {
    expect(() => gateways.resolve('unknown-source')).toThrowError(
      'No collection gateway is configured for the source.',
    );
  });

  it('normalizes a non-eBay raw record without vendor coupling', () => {
    const normalized = new GenericListingMapper().map({
      preview: {
        externalId: 'MLB123',
        url: 'https://produto.mercadolivre.com.br/MLB123',
        title: 'Notebook usado',
        price: { amountMinor: 100000, currency: 'BRL' },
        sellerExternalId: 'seller-1',
      },
      payload: { description: 'Tela com marcas', condition: 'used' },
    });

    expect(normalized).toMatchObject({
      externalId: 'MLB123',
      priceMinor: 100000,
      currency: 'BRL',
      condition: 'used',
    });
  });

  it('executes a bounded query family and deduplicates external IDs', async () => {
    const result = await new BoundedCollectionQueryRunner(
      new DefaultCollectionGateway(new MockMercadoLivreConnector()),
      3,
    ).collect(
      {
        category: 'smartphone',
        brands: ['Apple'],
        models: ['iPhone 13'],
        variants: [],
        storageGb: [128],
        memoryGb: [],
        acceptedDefects: ['cracked_screen'],
        rejectedDefects: ['activation_lock'],
        acceptedConditions: ['for_repair'],
        countries: [],
        regions: [],
        requiredFunctionalStates: [],
        preferredEvidence: [],
        additionalKeywords: [],
        excludedKeywords: [],
      },
      ['iPhone 13', 'celular iPhone 13', 'iphone 13 quebrado'],
    );

    expect(result.items).toHaveLength(3);
    expect(new Set(result.items.map(({ preview }) => preview.externalId)).size).toBe(3);
  });

  it('executes more than one query when the family has distinct candidates', async () => {
    const queries: string[] = [];
    const result = await new BoundedCollectionQueryRunner(
      {
        provider: 'query-fixture',
        collect: async (_criteria, _limit, query) => {
          queries.push(query ?? '');
          const externalId = `fixture-${queries.length}`;
          return {
            items: [
              {
                preview: {
                  externalId,
                  url: `https://example.com/${externalId}`,
                  title: query ?? externalId,
                  price: { amountMinor: 100, currency: 'USD' },
                },
                payload: { query: query ?? null },
              },
            ],
            pagesFetched: 1,
            provider: 'query-fixture',
          };
        },
      },
      3,
      3,
    ).collect(
      {
        category: 'smartphone',
        brands: [],
        models: [],
        variants: [],
        storageGb: [],
        memoryGb: [],
        maximumPrice: undefined,
        acceptedDefects: [],
        rejectedDefects: [],
        acceptedConditions: [],
        countries: [],
        regions: [],
        requiredFunctionalStates: [],
        preferredEvidence: [],
        additionalKeywords: [],
        excludedKeywords: [],
      },
      ['query-one', 'query-two', 'query-three'],
    );

    expect(queries).toEqual(['query-one', 'query-two', 'query-three']);
    expect(result.items).toHaveLength(3);
  });
});
