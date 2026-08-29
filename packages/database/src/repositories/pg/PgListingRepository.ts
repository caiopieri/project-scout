import { Listing, ListingRepository, ListingSnapshot, PriceHistory } from '@scout/domain';
import { SqlExecutor } from '../../sql/SqlExecutor';

export class PgListingRepository implements ListingRepository {
  constructor(private sql: SqlExecutor) {}

  async findById(id: string): Promise<Listing | null> {
    const res = await this.sql.query<Listing>(
      `SELECT id, source_id as "sourceId", external_id as "externalId", url, title, description, condition,
              currency, price, shipping_cost as "shippingCost", total_visible_cost as "totalVisibleCost",
              seller_id as "sellerId", location, status, published_at as "publishedAt",
              first_collected_at as "firstCollectedAt", last_updated_at as "lastUpdatedAt",
              specifications, inferred_product as "inferredProduct", raw_data_path as "rawDataPath",
              raw_content_hash as "rawContentHash", raw_schema_version as "rawSchemaVersion",
              raw_data_metadata as "rawDataMetadata"
       FROM listings WHERE id = $1`,
      [id],
    );
    return res.rows.length > 0 ? res.rows[0] : null;
  }

  async findBySourceAndExternalId(sourceId: string, externalId: string): Promise<Listing | null> {
    const res = await this.sql.query<Listing>(
      `SELECT id, source_id as "sourceId", external_id as "externalId", url, title, description, condition,
              currency, price, shipping_cost as "shippingCost", total_visible_cost as "totalVisibleCost",
              seller_id as "sellerId", location, status, published_at as "publishedAt",
              first_collected_at as "firstCollectedAt", last_updated_at as "lastUpdatedAt",
              specifications, inferred_product as "inferredProduct", raw_data_path as "rawDataPath",
              raw_content_hash as "rawContentHash", raw_schema_version as "rawSchemaVersion",
              raw_data_metadata as "rawDataMetadata"
       FROM listings WHERE source_id = $1 AND external_id = $2`,
      [sourceId, externalId],
    );
    return res.rows.length > 0 ? res.rows[0] : null;
  }

  async upsertListing(
    listing: Omit<Listing, 'id' | 'firstCollectedAt' | 'lastUpdatedAt'> & { id?: string },
  ): Promise<Listing> {
    const res = await this.sql.query<Listing>(
      `INSERT INTO listings (source_id, external_id, url, title, description, condition, currency, price, shipping_cost, total_visible_cost, seller_id, location, status, specifications, inferred_product, raw_data_path, raw_content_hash, raw_schema_version, raw_data_metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       ON CONFLICT (source_id, external_id) DO UPDATE
       SET title = EXCLUDED.title,
           description = EXCLUDED.description,
           price = EXCLUDED.price,
           shipping_cost = EXCLUDED.shipping_cost,
           total_visible_cost = EXCLUDED.total_visible_cost,
           status = EXCLUDED.status,
           raw_content_hash = EXCLUDED.raw_content_hash,
           last_updated_at = NOW()
       RETURNING id, source_id as "sourceId", external_id as "externalId", url, title, description, condition,
                 currency, price, shipping_cost as "shippingCost", total_visible_cost as "totalVisibleCost",
                 seller_id as "sellerId", location, status, published_at as "publishedAt",
                 first_collected_at as "firstCollectedAt", last_updated_at as "lastUpdatedAt",
                 specifications, inferred_product as "inferredProduct", raw_data_path as "rawDataPath",
                 raw_content_hash as "rawContentHash", raw_schema_version as "rawSchemaVersion",
                 raw_data_metadata as "rawDataMetadata"`,
      [
        listing.sourceId,
        listing.externalId,
        listing.url,
        listing.title,
        listing.description,
        listing.condition,
        listing.currency || 'USD',
        listing.price,
        listing.shippingCost || 0,
        listing.totalVisibleCost,
        listing.sellerId || null,
        listing.location || null,
        listing.status || 'active',
        JSON.stringify(listing.specifications || {}),
        listing.inferredProduct ? JSON.stringify(listing.inferredProduct) : null,
        listing.rawDataPath,
        listing.rawContentHash || null,
        listing.rawSchemaVersion || '1.0',
        JSON.stringify(listing.rawDataMetadata || {}),
      ],
    );
    return res.rows[0];
  }

  async addSnapshot(
    snapshot: Omit<ListingSnapshot, 'id' | 'collectedAt'>,
  ): Promise<ListingSnapshot> {
    const res = await this.sql.query<ListingSnapshot>(
      `INSERT INTO listing_snapshots (listing_id, title, price, shipping_cost, status, raw_object_key, raw_content_hash, raw_schema_version, payload_summary)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, listing_id as "listingId", title, price, shipping_cost as "shippingCost", status,
                 raw_object_key as "rawObjectKey", raw_content_hash as "rawContentHash",
                 raw_schema_version as "rawSchemaVersion", payload_summary as "payloadSummary", collected_at as "collectedAt"`,
      [
        snapshot.listingId,
        snapshot.title,
        snapshot.price,
        snapshot.shippingCost,
        snapshot.status,
        snapshot.rawObjectKey,
        snapshot.rawContentHash,
        snapshot.rawSchemaVersion || '1.0',
        JSON.stringify(snapshot.payloadSummary || {}),
      ],
    );
    return res.rows[0];
  }

  async addPriceHistory(history: Omit<PriceHistory, 'id' | 'collectedAt'>): Promise<PriceHistory> {
    const res = await this.sql.query<PriceHistory>(
      `INSERT INTO price_history (listing_id, price, shipping_cost, status)
       VALUES ($1, $2, $3, $4)
       RETURNING id, listing_id as "listingId", price, shipping_cost as "shippingCost", status, collected_at as "collectedAt"`,
      [history.listingId, history.price, history.shippingCost || 0, history.status],
    );
    return res.rows[0];
  }

  async getPriceHistory(listingId: string): Promise<PriceHistory[]> {
    const res = await this.sql.query<PriceHistory>(
      `SELECT id, listing_id as "listingId", price, shipping_cost as "shippingCost", status, collected_at as "collectedAt"
       FROM price_history WHERE listing_id = $1 ORDER BY collected_at ASC`,
      [listingId],
    );
    return res.rows;
  }
}
