import { SupabaseRestListingRepository } from '@scout/database';
import { calculateUsToUsLandedCost } from '@scout/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';

const projectId = '33333333-3333-4333-a333-333333333333';
const listingId = '11111111-1111-4111-a111-111111111111';

const listingRow = (rawDataMetadata: unknown) => ({
  id: listingId,
  source_id: '00000000-0000-4000-a000-000000000001',
  external_id: 'ebay-1',
  url: 'https://www.ebay.com/itm/ebay-1',
  title: 'Fixture',
  description: 'Description',
  condition: 'Used',
  currency: 'USD',
  price: '299.99',
  shipping_cost: '15.50',
  total_visible_cost: '315.49',
  seller_id: null,
  location: null,
  status: 'active',
  published_at: null,
  first_collected_at: '2026-08-30T12:00:00.000Z',
  last_updated_at: '2026-08-30T12:00:00.000Z',
  specifications: {},
  inferred_product: null,
  raw_data_path: 'raw/ebay.json',
  raw_content_hash: null,
  raw_schema_version: null,
  raw_data_metadata: rawDataMetadata,
});

const repository = (metadata: unknown) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes('/research_project_listings?'))
        return Response.json([{ listing_id: listingId }]);
      if (url.includes('/listings?')) return Response.json([listingRow(metadata)]);
      throw new Error(`Unexpected fixture request: ${url}`);
    }),
  );
  return new SupabaseRestListingRepository({
    baseUrl: 'https://supabase.fixture',
    anonKey: 'anon-key-fixture',
    accessToken: 'access-token-fixture',
  });
};

const known = calculateUsToUsLandedCost({
  itemPriceMinor: 29999,
  shippingCostMinor: 1550,
  currency: 'USD',
});

afterEach(() => vi.unstubAllGlobals());

describe('S3.1a listing transport landed cost', () => {
  it('exposes validated metadata', async () => {
    const listing = (
      await repository({ shippingCostKnown: true, landedCost: known }).findByProjectId(projectId)
    )[0];
    expect(listing.landedCost).toEqual(known);
  });

  it('derives known cost only from an explicit signal', async () => {
    const listing = (await repository({ shippingCostKnown: true }).findByProjectId(projectId))[0];
    expect(listing.landedCost).toMatchObject({ status: 'known', totalMinor: 31549 });
    expect(listing.landedCost?.components.shipping).toMatchObject({
      amountMinor: 1550,
      origin: 'informado',
    });
  });

  it('fails closed when the signal is absent or inconsistent', async () => {
    const absent = (await repository({}).findByProjectId(projectId))[0];
    expect(absent.landedCost).toMatchObject({
      status: 'indeterminate',
      totalMinor: null,
      missing: ['shipping'],
    });

    await expect(
      repository({ shippingCostKnown: false, landedCost: known }).findByProjectId(projectId),
    ).rejects.toThrow();
  });

  it('rejects malformed persisted metadata', async () => {
    await expect(
      repository({
        shippingCostKnown: true,
        landedCost: { ...known, totalMinor: 1 },
      }).findByProjectId(projectId),
    ).rejects.toThrow();
  });
});
