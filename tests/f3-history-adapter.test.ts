import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseRestListingRepository } from '@scout/database/listings';

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
});
