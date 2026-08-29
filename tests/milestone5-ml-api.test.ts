import { describe, expect, it, vi } from 'vitest';
import { DefaultCollectionGateway } from '@scout/collection';
import {
  MercadoLivreApiAdapter,
  ML_MOCK_FIXTURES,
  MockMercadoLivreConnector,
  buildMercadoLivreSearchUrl,
} from '@scout/ml-connector';
import type { ResearchCriteria } from '@scout/schemas';

const criteria: ResearchCriteria = {
  category: 'smartphone',
  brands: ['Apple'],
  models: ['iPhone 13'],
  variants: [],
  storageGb: [128],
  memoryGb: [],
  maximumPrice: { amountMinor: 180000, currency: 'BRL' },
  acceptedDefects: ['cracked_screen'],
  rejectedDefects: ['activation_lock'],
  acceptedConditions: ['for_repair'],
  countries: ['BR'],
  regions: [],
  requiredFunctionalStates: [],
  preferredEvidence: [],
  additionalKeywords: [],
  excludedKeywords: [],
};

const apiItem = {
  id: 'MLB123456789',
  title: 'Apple iPhone 13 128GB tela quebrada',
  permalink: 'https://produto.mercadolivre.com.br/MLB-123456789',
  price: 1450,
  currency_id: 'BRL',
  thumbnail: 'https://http2.mlstatic.com/example.jpg',
  seller_id: 123,
  condition: 'used',
  status: 'active',
  available_quantity: 1,
  sold_quantity: 2,
  date_created: '2026-08-01T10:00:00.000Z',
  last_updated: '2026-08-02T10:00:00.000Z',
  pictures: [],
  attributes: [],
};

describe('Mercado Livre connector', () => {
  it('builds the official Brazil search URL with bounded pagination and price', () => {
    const url = buildMercadoLivreSearchUrl({ criteria, limit: 5 });
    expect(url.origin).toBe('https://api.mercadolibre.com');
    expect(url.pathname).toBe('/sites/MLB/search');
    expect(url.searchParams.get('q')).toContain('iPhone 13');
    expect(url.searchParams.get('price')).toBe('until_1800');
    expect(url.searchParams.get('limit')).toBe('5');
  });

  it('maps official search and detail payloads into the raw listing contract', async () => {
    const calls: string[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push(String(input));
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-token');
      if (String(input).includes('/sites/MLB/search')) {
        return Response.json({ results: [apiItem], paging: { total: 1, limit: 5, offset: 0 } });
      }
      return Response.json(apiItem);
    });
    const connector = new MercadoLivreApiAdapter({ accessToken: 'test-token' }, { fetch: fetcher });

    const page = await connector.search({ criteria, limit: 5 });
    const detail = await connector.fetchDetails('MLB123456789');

    expect(page.items[0]).toMatchObject({ externalId: 'MLB123456789', title: apiItem.title });
    expect(detail.preview.price).toEqual({ amountMinor: 145000, currency: 'BRL' });
    expect(calls).toHaveLength(2);
  });

  it('keeps the fixture path network-free and usable by the collection gateway', async () => {
    const network = vi.fn();
    vi.stubGlobal('fetch', network);
    const result = await new DefaultCollectionGateway(new MockMercadoLivreConnector()).collect(
      criteria,
    );

    expect(result.items).toHaveLength(ML_MOCK_FIXTURES.length);
    expect(result.provider).toBe('mercadolivre-mock-v1');
    expect(network).not.toHaveBeenCalled();
  });

  it('fails closed when credentials are missing', () => {
    expect(() => new MercadoLivreApiAdapter({ accessToken: ' ' })).toThrowError(
      'Mercado Livre credentials are not configured.',
    );
  });

  it('refreshes an expired access token once without exposing OAuth credentials downstream', async () => {
    const calls: Array<{ url: string; authorization?: string; body?: string }> = [];
    let searchCalls = 0;
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({
        url,
        authorization: new Headers(init?.headers).get('Authorization') ?? undefined,
        body: typeof init?.body === 'string' ? init.body : undefined,
      });
      if (url.endsWith('/oauth/token'))
        return Response.json({
          access_token: searchCalls === 1 ? 'fresh-token' : 'next-token',
          refresh_token: searchCalls === 1 ? 'rotated-refresh-token' : 'latest-refresh-token',
          expires_in: 21600,
        });
      searchCalls += 1;
      if (searchCalls % 2 === 1) return new Response(null, { status: 401 });
      return Response.json({ results: [apiItem], paging: { total: 1, limit: 5, offset: 0 } });
    });
    const connector = new MercadoLivreApiAdapter(
      {
        accessToken: 'expired-token',
        oauth: {
          clientId: 'client-id',
          clientSecret: 'client-secret',
          refreshToken: 'refresh-token',
        },
      },
      { fetch: fetcher },
    );

    await connector.search({ criteria, limit: 5 });
    await connector.search({ criteria, limit: 5 });

    expect(calls.map((call) => call.url)).toEqual([
      'https://api.mercadolibre.com/sites/MLB/search?q=Apple+iPhone+13+128GB&limit=5&offset=0&price=until_1800',
      'https://api.mercadolibre.com/oauth/token',
      'https://api.mercadolibre.com/sites/MLB/search?q=Apple+iPhone+13+128GB&limit=5&offset=0&price=until_1800',
      'https://api.mercadolibre.com/sites/MLB/search?q=Apple+iPhone+13+128GB&limit=5&offset=0&price=until_1800',
      'https://api.mercadolibre.com/oauth/token',
      'https://api.mercadolibre.com/sites/MLB/search?q=Apple+iPhone+13+128GB&limit=5&offset=0&price=until_1800',
    ]);
    expect(calls[0].authorization).toBe('Bearer expired-token');
    expect(calls[2].authorization).toBe('Bearer fresh-token');
    expect(calls[3].authorization).toBe('Bearer fresh-token');
    expect(calls[5].authorization).toBe('Bearer next-token');
    expect(calls[1].body).toContain('grant_type=refresh_token');
    expect(calls[1].body).toContain('client_id=client-id');
    expect(calls[1].body).toContain('client_secret=client-secret');
    expect(calls[4].body).toContain('refresh_token=rotated-refresh-token');
    expect(calls[0].body).toBeUndefined();
    expect(calls[2].body).toBeUndefined();
  });

  it('does not rotate the refresh token for a policy-level 403', async () => {
    const fetcher = vi.fn(async (input: string | URL) => {
      if (String(input).endsWith('/oauth/token'))
        return Response.json({
          access_token: 'unexpected-token',
          refresh_token: 'unexpected-refresh',
        });
      return Response.json(
        {
          code: 'PA_UNAUTHORIZED_RESULT_FROM_POLICIES',
          status: 403,
          message: 'At least one policy returned UNAUTHORIZED.',
        },
        { status: 403 },
      );
    });
    const connector = new MercadoLivreApiAdapter(
      {
        accessToken: 'valid-but-policy-blocked-token',
        oauth: {
          clientId: 'client-id',
          clientSecret: 'client-secret',
          refreshToken: 'refresh-token',
        },
      },
      { fetch: fetcher },
    );

    await expect(connector.search({ criteria, limit: 5 })).rejects.toMatchObject({
      code: 'ML_POLICY_UNAUTHORIZED',
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
