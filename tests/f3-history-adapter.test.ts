import { afterEach, describe, expect, it, vi } from 'vitest';
import { LISTING_ID_BATCH_SIZE, SupabaseRestListingRepository } from '@scout/database/listings';

afterEach(() => vi.unstubAllGlobals());

describe('F3 persisted price history adapter', () => {
  it('reads and validates price history through the Supabase REST boundary', async () => {
    let requestedUrl = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        requestedUrl = String(input);
        return Response.json([
          {
            id: '44444444-4444-4444-a444-444444444444',
            listing_id: '11111111-1111-4111-a111-111111111111',
            price: '1000.00',
            shipping_cost: '25.00',
            status: 'active',
            collected_at: '2026-08-01T00:00:00.000Z',
          },
        ]);
      }),
    );

    const history = await new SupabaseRestListingRepository({
      baseUrl: 'http://supabase.local',
      anonKey: 'service',
      accessToken: 'service',
    }).getPriceHistory('11111111-1111-4111-a111-111111111111');

    expect(requestedUrl).toContain('/rest/v1/price_history?listing_id=eq.');
    expect(history[0]).toMatchObject({
      price: 1000,
      shippingCost: 25,
      status: 'active',
      listingId: '11111111-1111-4111-a111-111111111111',
    });
    expect(history[0].collectedAt).toEqual(new Date('2026-08-01T00:00:00.000Z'));
  });

  it('rejects an unsupported persisted status instead of feeding it to valuation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json([
          {
            id: '44444444-4444-4444-a444-444444444444',
            listing_id: '11111111-1111-4111-a111-111111111111',
            price: 1000,
            shipping_cost: 0,
            status: 'unknown-status',
            collected_at: '2026-08-01T00:00:00.000Z',
          },
        ]),
      ),
    );

    await expect(
      new SupabaseRestListingRepository({
        baseUrl: 'http://supabase.local',
        anonKey: 'service',
        accessToken: 'service',
      }).getPriceHistory('11111111-1111-4111-a111-111111111111'),
    ).rejects.toThrow();
  });

  it('rejects a malformed listing id before making a REST request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new SupabaseRestListingRepository({
        baseUrl: 'http://supabase.local',
        anonKey: 'service',
        accessToken: 'service',
      }).getPriceHistory('not-a-uuid'),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads listing ids in sequential batches and restores project-link order', async () => {
    const ids = Array.from(
      { length: 123 },
      (_, index) => `11111111-1111-4111-a111-${(index + 1).toString(16).padStart(12, '0')}`,
    );
    const listingUrls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/research_project_listings'))
          return Response.json(ids.map((listing_id) => ({ listing_id })));
        listingUrls.push(url);
        const batch = url.match(/id=in\.\(([^)]+)\)/)?.[1]?.split(',') ?? [];
        return Response.json(
          [...batch].reverse().map((id) => ({
            id,
            source_id: '22222222-2222-4222-a222-222222222222',
            external_id: id,
            url: `https://www.ebay.com/itm/${id}`,
            title: `Fixture ${id}`,
            description: 'Fixture description',
            condition: 'used',
            currency: 'USD',
            price: '100.00',
            shipping_cost: '0.00',
            total_visible_cost: '100.00',
            seller_id: null,
            location: null,
            status: 'active',
            published_at: null,
            first_collected_at: '2026-08-01T00:00:00.000Z',
            last_updated_at: '2026-08-01T00:00:00.000Z',
            specifications: {},
            inferred_product: null,
            raw_data_path: `raw/${id}`,
            raw_content_hash: null,
            raw_schema_version: null,
            raw_data_metadata: {},
          })),
        );
      }),
    );

    const listings = await new SupabaseRestListingRepository({
      baseUrl: 'http://supabase.local',
      anonKey: 'service',
      accessToken: 'service',
    }).findByProjectId('33333333-3333-4333-a333-333333333333');

    expect(listingUrls).toHaveLength(3);
    expect(
      listingUrls.every(
        (url) =>
          (url.match(/id=in\.\(([^)]+)\)/)?.[1] ?? '').split(',').length <= LISTING_ID_BATCH_SIZE,
      ),
    ).toBe(true);
    expect(listings.map(({ id }) => id)).toEqual(ids);
  });
});
