import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ListingIngestionService } from '@scout/collection';
import type { ListingIngestionRepository } from '@scout/domain';
import { EBAY_MOCK_FIXTURES, EbayListingMapper } from '@scout/ebay-connector';
import {
  normalizedListingInputSchema,
  rawListingRecordSchema,
  type ListingIngestionResult,
} from '@scout/schemas';
import { R2RawListingObjectStore } from '../apps/worker/src/R2RawListingObjectStore';

const officialItem = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'tests/fixtures/ebay/browse-item.json'), 'utf8'),
) as Record<string, unknown>;

const officialRecord = rawListingRecordSchema.parse({
  preview: {
    externalId: 'v1|145000000001|0',
    url: 'https://www.ebay.com/itm/145000000001',
    title: 'Apple iPhone 13 128GB cracked screen for parts',
    price: { amountMinor: 29999, currency: 'USD' },
    imageUrl: 'https://i.ebayimg.com/images/g/example1/s-l1600.jpg',
    sellerExternalId: 'repair-seller',
  },
  payload: officialItem,
});
const identityHashSecret = 'test-only-identity-hash-secret-32-chars';

class MemoryIngestionRepository implements ListingIngestionRepository {
  private readonly hashes = new Map<string, { id: string; hash: string }>();

  async ingest(input: Parameters<ListingIngestionRepository['ingest']>[0]) {
    const existing = this.hashes.get(input.listing.externalId);
    if (!existing) {
      const result: ListingIngestionResult = {
        listingId: '22222222-2222-4222-a222-222222222222',
        created: true,
        updated: false,
      };
      this.hashes.set(input.listing.externalId, {
        id: result.listingId,
        hash: input.rawObject.contentHash,
      });
      return result;
    }
    const updated = existing.hash !== input.rawObject.contentHash;
    this.hashes.set(input.listing.externalId, {
      id: existing.id,
      hash: input.rawObject.contentHash,
    });
    return { listingId: existing.id, created: false, updated };
  }
}

describe('Milestone 6 normalization and deduplication', () => {
  it('maps official eBay fields into exact normalized values', () => {
    const listing = new EbayListingMapper(() => new Date('2026-07-29T12:00:00.000Z')).map(
      officialRecord,
    );
    expect(listing).toMatchObject({
      externalId: 'v1|145000000001|0',
      condition: 'For parts or not working',
      currency: 'USD',
      priceMinor: 29999,
      shippingCostMinor: 1550,
      totalVisibleCostMinor: 31549,
      rawDataMetadata: {
        landedCost: expect.objectContaining({ status: 'known', totalMinor: 31549 }),
      },
      location: 'Austin, TX, 78701, US',
      status: 'active',
      seller: {
        externalId: 'repair-seller',
        reviewCount: 842,
        positiveFeedbackPercentage: 99.4,
      },
      inferredProduct: { brand: 'Apple', model: 'iPhone 13', variant: '128 GB' },
    });
    expect(listing.images).toHaveLength(2);
    expect(listing.specifications['Storage Capacity']).toBe('128 GB');
  });

  it('keeps unknown shipping explicit and rejects inconsistent totals', () => {
    const listing = new EbayListingMapper().map(EBAY_MOCK_FIXTURES[0]);
    expect(listing.shippingCostMinor).toBeNull();
    expect(listing.totalVisibleCostMinor).toBe(listing.priceMinor);
    expect(listing.rawDataMetadata.shippingCostKnown).toBe(false);
    expect(listing.rawDataMetadata.landedCost).toMatchObject({
      status: 'indeterminate',
      totalMinor: null,
      missing: ['shipping'],
      components: {
        itemPrice: { amountMinor: listing.priceMinor, origin: 'informado' },
        shipping: { amountMinor: null, origin: 'desconhecido' },
      },
    });
    expect(() =>
      normalizedListingInputSchema.parse({
        ...listing,
        totalVisibleCostMinor: listing.priceMinor + 1,
      }),
    ).toThrow();
  });

  it('stores canonical raw JSON under a content-addressed R2 key', async () => {
    const put = vi.fn(async () => undefined);
    const store = new R2RawListingObjectStore({ put } as never, identityHashSecret);
    const first = await store.put(officialRecord);
    const reordered = rawListingRecordSchema.parse({
      ...officialRecord,
      payload: Object.fromEntries(Object.entries(officialRecord.payload).reverse()),
    });
    const second = await store.put(reordered);
    expect(first).toEqual(second);
    expect(first.key).toContain(encodeURIComponent(officialRecord.preview.externalId));
    expect(first.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(put).toHaveBeenCalledTimes(2);
  });

  it('counts create, unchanged redelivery and changed-content update idempotently', async () => {
    const store = new R2RawListingObjectStore(
      { put: vi.fn(async () => undefined) } as never,
      identityHashSecret,
    );
    const service = new ListingIngestionService(
      new EbayListingMapper(),
      store,
      new MemoryIngestionRepository(),
    );
    const base = {
      projectId: '33333333-3333-4333-a333-333333333333',
      sourceId: '00000000-0000-4000-a000-000000000001',
      result: { items: [officialRecord], pagesFetched: 1, provider: 'ebay-api-sandbox-v1' },
    };
    const listingIds = ['22222222-2222-4222-a222-222222222222'];
    await expect(service.ingest(base)).resolves.toEqual({
      itemsCreated: 1,
      itemsUpdated: 0,
      listingIds,
      listingIdsByExternalId: { [officialRecord.preview.externalId]: listingIds[0] },
    });
    await expect(service.ingest(base)).resolves.toEqual({
      itemsCreated: 0,
      itemsUpdated: 0,
      listingIds,
      listingIdsByExternalId: { [officialRecord.preview.externalId]: listingIds[0] },
    });
    const changed = rawListingRecordSchema.parse({
      ...officialRecord,
      payload: { ...officialRecord.payload, description: 'Updated seller description.' },
    });
    await expect(
      service.ingest({ ...base, result: { ...base.result, items: [changed] } }),
    ).resolves.toEqual({
      itemsCreated: 0,
      itemsUpdated: 1,
      listingIds,
      listingIdsByExternalId: { [officialRecord.preview.externalId]: listingIds[0] },
    });
  });
});
