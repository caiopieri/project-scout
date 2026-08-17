import {
  ConnectorError,
  type CollectionResultIngestor,
  type ListingIngestionRepository,
  type ListingMapper,
  type RawListingObjectStore,
} from '@scout/domain';
import { collectionPersistenceSummarySchema } from '@scout/schemas';

export class ListingIngestionService implements CollectionResultIngestor {
  constructor(
    private readonly mapper: ListingMapper | ReadonlyMap<string, ListingMapper>,
    private readonly objectStore: RawListingObjectStore,
    private readonly repository: ListingIngestionRepository,
  ) {}

  async ingest(input: Parameters<CollectionResultIngestor['ingest']>[0]) {
    let itemsCreated = 0;
    let itemsUpdated = 0;
    const listingIds = new Set<string>();
    const listingIdsByExternalId: Record<string, string> = {};
    const mapper = this.mapper instanceof Map ? this.mapper.get(input.sourceId) : this.mapper;
    if (!mapper) {
      throw new ConnectorError(
        'No listing mapper is configured for the source.',
        'permanent',
        'SOURCE_MAPPER_NOT_CONFIGURED',
      );
    }
    for (const record of input.result.items) {
      let listing;
      try {
        listing = mapper.map(record);
      } catch (cause) {
        if (cause instanceof ConnectorError) throw cause;
        throw new ConnectorError(
          'Collected listing could not be normalized.',
          'permanent',
          'LISTING_NORMALIZATION_INVALID',
        );
      }
      let rawObject;
      try {
        rawObject = await this.objectStore.put(record);
      } catch (cause) {
        if (cause instanceof ConnectorError) throw cause;
        throw new ConnectorError(
          'Raw listing payload could not be stored.',
          'transient',
          'RAW_STORAGE_UNAVAILABLE',
        );
      }
      try {
        const persisted = await this.repository.ingest({
          projectId: input.projectId,
          sourceId: input.sourceId,
          listing,
          rawObject,
        });
        if (persisted.created) itemsCreated += 1;
        else if (persisted.updated) itemsUpdated += 1;
        listingIds.add(persisted.listingId);
        listingIdsByExternalId[listing.externalId] = persisted.listingId;
      } catch (cause) {
        if (cause instanceof ConnectorError) throw cause;
        throw new ConnectorError(
          'Normalized listing could not be persisted.',
          'transient',
          'LISTING_PERSISTENCE_UNAVAILABLE',
        );
      }
    }
    return collectionPersistenceSummarySchema.parse({
      itemsCreated,
      itemsUpdated,
      listingIds: [...listingIds],
      listingIdsByExternalId,
    });
  }
}
