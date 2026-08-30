import { describe, expect, it, vi } from 'vitest';
import {
  DefaultCollectionGateway,
  BoundedCollectionQueryRunner,
  GenericListingMapper,
  SourceCollectionGatewayRegistry,
} from '@scout/collection';
import type { CollectionGateway } from '@scout/domain';
import { MockEbayConnector } from '@scout/ebay-connector';
import { MockMercadoLivreConnector } from '@scout/ml-connector';
import { MockXianyuConnector } from '@scout/xianyu-connector';
import type { CollectionResult, RawListingRecord, ResearchCriteria } from '@scout/schemas';

const criteria: ResearchCriteria = {
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
};

const rawRecord = (externalId: string): RawListingRecord => ({
  preview: {
    externalId,
    url: `https://example.test/${externalId}`,
    title: externalId,
    price: { amountMinor: 100, currency: 'BRL' },
  },
  payload: { fixture: true },
});

const adaptiveGateway = (
  itemsByQuery: Readonly<Record<string, RawListingRecord[]>>,
  calls: Array<{ limit: number; query?: string }>,
): CollectionGateway => ({
  provider: 'adaptive-query-fixture',
  collect: vi.fn(
    async (
      _criteria: ResearchCriteria,
      limit = 5,
      query?: string,
    ): Promise<CollectionResult> => {
      calls.push({ query, limit });
      return {
        items: (itemsByQuery[query ?? ''] ?? []).slice(0, limit),
        pagesFetched: 1,
        provider: 'adaptive-query-fixture',
        truncated: false,
      };
    },
  ),
});

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

  it('lets a single rich query fill the global target', async () => {
    const calls: Array<{ limit: number; query?: string }> = [];
    const result = await new BoundedCollectionQueryRunner(
      adaptiveGateway(
        { q1: Array.from({ length: 5 }, (_, index) => rawRecord(`q1-${index}`)) },
        calls,
      ),
      2,
      5,
    ).collect(criteria, ['q1'], 5);

    expect(result.items).toHaveLength(5);
    expect(calls).toEqual([{ limit: 5, query: 'q1' }]);
  });

  it('does not call the second family query when the first fills the target', async () => {
    const calls: Array<{ limit: number; query?: string }> = [];
    const result = await new BoundedCollectionQueryRunner(
      adaptiveGateway(
        {
          q1: Array.from({ length: 5 }, (_, index) => rawRecord(`q1-${index}`)),
          q2: [rawRecord('q2-0')],
        },
        calls,
      ),
      2,
      5,
    ).collect(criteria, ['q1', 'q2'], 5);

    expect(result.items).toHaveLength(5);
    expect(calls).toEqual([{ limit: 5, query: 'q1' }]);
  });

  it('gives the remaining global target to the next query after the first dries up', async () => {
    const calls: Array<{ limit: number; query?: string }> = [];
    const result = await new BoundedCollectionQueryRunner(
      adaptiveGateway(
        {
          q1: [rawRecord('q1-0'), rawRecord('q1-1')],
          q2: Array.from({ length: 3 }, (_, index) => rawRecord(`q2-${index}`)),
        },
        calls,
      ),
      2,
      5,
    ).collect(criteria, ['q1', 'q2'], 5);

    expect(result.items).toHaveLength(5);
    expect(calls).toEqual([
      { limit: 5, query: 'q1' },
      { limit: 3, query: 'q2' },
    ]);
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
});
