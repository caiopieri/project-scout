import type { ListingIngestionRepository } from '@scout/domain';
import {
  listingIngestionResultSchema,
  normalizedListingInputSchema,
  rawObjectReferenceSchema,
} from '@scout/schemas';
import type { SupabaseRestConfig } from './SupabaseRestResearchProjectRepository';

interface IngestionRow {
  listing_id: string;
  created: boolean;
  updated: boolean;
}

export class SupabaseRestListingIngestionRepository implements ListingIngestionRepository {
  constructor(private readonly config: SupabaseRestConfig) {}

  async ingest(input: Parameters<ListingIngestionRepository['ingest']>[0]) {
    const listing = normalizedListingInputSchema.parse(input.listing);
    const rawObject = rawObjectReferenceSchema.parse(input.rawObject);
    const response = await fetch(
      `${this.config.baseUrl}/rest/v1/rpc/ingest_normalized_ebay_listing`,
      {
        method: 'POST',
        headers: {
          apikey: this.config.anonKey,
          Authorization: `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_project_id: input.projectId,
          p_source_id: input.sourceId,
          p_listing: listing,
          p_raw_object_key: rawObject.key,
          p_raw_content_hash: rawObject.contentHash,
          p_raw_schema_version: rawObject.schemaVersion,
        }),
      },
    );
    if (!response.ok) throw new Error(`Supabase listing ingestion failed (${response.status}).`);
    const rows = (await response.json()) as IngestionRow[];
    if (!rows[0]) throw new Error('Supabase listing ingestion returned no result.');
    return listingIngestionResultSchema.parse({
      listingId: rows[0].listing_id,
      created: rows[0].created,
      updated: rows[0].updated,
    });
  }
}
