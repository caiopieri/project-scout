import {
  listingRawDataMetadataSchema,
  listingTransportSchema,
  priceHistorySchema,
  type ListingTransport,
  type PriceHistory,
} from '@scout/schemas';
import { calculateUsToUsLandedCost } from '@scout/domain';
import { z } from 'zod';
import type { SupabaseRestConfig } from './SupabaseRestResearchProjectRepository';

interface ListingRow {
  id: string;
  source_id: string;
  external_id: string;
  url: string;
  title: string;
  description: string;
  condition: string;
  currency: string;
  price: number | string;
  shipping_cost: number | string;
  total_visible_cost: number | string;
  seller_id: string | null;
  location: string | null;
  status: string;
  published_at: string | null;
  first_collected_at: string;
  last_updated_at: string;
  specifications: unknown;
  inferred_product: unknown;
  raw_data_path: string;
  raw_content_hash: string | null;
  raw_schema_version: string | null;
  raw_data_metadata: unknown;
}

interface PriceHistoryRow {
  id: string;
  listing_id: string;
  price: number | string;
  shipping_cost: number | string;
  status: string;
  collected_at: string;
}

const decimalToMinor = (value: number | string): number => {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!match) throw new Error('Persisted monetary value is not a decimal amount.');
  const fraction = match[2] ?? '';
  if (fraction.length > 2 && /[1-9]/.test(fraction.slice(2))) {
    throw new Error('Persisted monetary value has more than two decimal places.');
  }
  const amountMinor = Number(match[1]) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2));
  if (!Number.isSafeInteger(amountMinor)) throw new Error('Persisted monetary value is unsafe.');
  return amountMinor;
};

const deriveLandedCost = (
  row: ListingRow,
  metadata: ReturnType<typeof listingRawDataMetadataSchema.parse>,
) =>
  calculateUsToUsLandedCost({
    itemPriceMinor: decimalToMinor(row.price),
    shippingCostMinor:
      metadata.shippingCostKnown === true ? decimalToMinor(row.shipping_cost) : null,
    currency: row.currency,
  });

const mapListing = (row: ListingRow): ListingTransport => {
  const rawDataMetadata = listingRawDataMetadataSchema.parse(row.raw_data_metadata);
  const landedCost = rawDataMetadata.landedCost ?? deriveLandedCost(row, rawDataMetadata);
  return listingTransportSchema.parse({
    id: row.id,
    sourceId: row.source_id,
    externalId: row.external_id,
    url: row.url,
    title: row.title,
    description: row.description,
    condition: row.condition,
    currency: row.currency,
    price: Number(row.price),
    shippingCost: Number(row.shipping_cost),
    totalVisibleCost: Number(row.total_visible_cost),
    sellerId: row.seller_id ?? undefined,
    location: row.location ?? undefined,
    status: row.status,
    publishedAt: row.published_at ?? undefined,
    firstCollectedAt: row.first_collected_at,
    lastUpdatedAt: row.last_updated_at,
    specifications: row.specifications,
    inferredProduct: row.inferred_product,
    rawDataPath: row.raw_data_path,
    rawContentHash: row.raw_content_hash ?? undefined,
    rawSchemaVersion: row.raw_schema_version ?? undefined,
    rawDataMetadata,
    landedCost,
  });
};

const listingSelect = [
  'id',
  'source_id',
  'external_id',
  'url',
  'title',
  'description',
  'condition',
  'currency',
  'price',
  'shipping_cost',
  'total_visible_cost',
  'seller_id',
  'location',
  'status',
  'published_at',
  'first_collected_at',
  'last_updated_at',
  'specifications',
  'inferred_product',
  'raw_data_path',
  'raw_content_hash',
  'raw_schema_version',
  'raw_data_metadata',
].join(',');

export const LISTING_ID_BATCH_SIZE = 50;

export class SupabaseRestListingRepository {
  constructor(private readonly config: SupabaseRestConfig) {}

  async findById(listingId: string): Promise<ListingTransport | null> {
    const validatedListingId = z.string().uuid().parse(listingId);
    const rows = await this.request<ListingRow[]>(
      `listings?id=eq.${encodeURIComponent(validatedListingId)}&select=${listingSelect}&limit=1`,
    );
    return rows[0] ? mapListing(rows[0]) : null;
  }

  async findByProjectId(projectId: string): Promise<ListingTransport[]> {
    const links = await this.request<Array<{ listing_id: string }>>(
      `research_project_listings?project_id=eq.${encodeURIComponent(projectId)}&select=listing_id&order=added_at.desc`,
    );
    if (!links.length) return [];
    const ids = links.map(({ listing_id }) => listing_id);
    const rows: ListingRow[] = [];
    for (let offset = 0; offset < ids.length; offset += LISTING_ID_BATCH_SIZE) {
      rows.push(
        ...(await this.request<ListingRow[]>(
          `listings?id=in.(${ids.slice(offset, offset + LISTING_ID_BATCH_SIZE).join(',')})&select=${listingSelect}`,
        )),
      );
    }
    const byId = new Map(rows.map((row) => [row.id, mapListing(row)]));
    return ids.flatMap((id) => {
      const listing = byId.get(id);
      return listing ? [listing] : [];
    });
  }

  async isListingInProject(listingId: string, projectId: string): Promise<boolean> {
    const validatedListingId = z.string().uuid().parse(listingId);
    const validatedProjectId = z.string().uuid().parse(projectId);
    const rows = await this.request<Array<{ listing_id: string }>>(
      `research_project_listings?project_id=eq.${encodeURIComponent(validatedProjectId)}&listing_id=eq.${encodeURIComponent(validatedListingId)}&select=listing_id&limit=1`,
    );
    return rows.length > 0;
  }

  async getPriceHistory(listingId: string): Promise<PriceHistory[]> {
    const validatedListingId = z.string().uuid().parse(listingId);
    const rows = await this.request<PriceHistoryRow[]>(
      `price_history?listing_id=eq.${encodeURIComponent(validatedListingId)}&select=id,listing_id,price,shipping_cost,status,collected_at&order=collected_at.asc`,
    );
    return priceHistorySchema.array().parse(
      rows.map((row) => ({
        id: row.id,
        listingId: row.listing_id,
        price: Number(row.price),
        shippingCost: Number(row.shipping_cost),
        status: row.status,
        collectedAt: new Date(row.collected_at),
      })),
    );
  }

  private async request<T>(path: string): Promise<T> {
    const response = await fetch(`${this.config.baseUrl}/rest/v1/${path}`, {
      headers: {
        apikey: this.config.anonKey,
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) throw new Error(`Supabase listing request failed (${response.status}).`);
    return response.json() as Promise<T>;
  }
}
