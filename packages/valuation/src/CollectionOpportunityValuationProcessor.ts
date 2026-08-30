import type {
  CollectionOpportunityEvaluator,
  ListingObservationReader,
  ListingRepository,
  OpportunityValuationRepository,
} from '@scout/domain';
import type {
  CollectionResult,
  CollectionPersistenceSummary,
  ValuationPolicy,
} from '@scout/schemas';
import {
  landedCostSchema,
  listingRawDataMetadataSchema,
  valuationMarketContextSchema,
} from '@scout/schemas';
import { DeterministicValuationEngine } from './index';

type PersistedListingReader = Pick<ListingRepository, 'getPriceHistory'> & {
  findById?: (listingId: string) => Promise<{
    rawDataMetadata: unknown;
    landedCost?: unknown;
  } | null>;
};

const payloadText = (payload: Record<string, unknown>, key: string): string | undefined => {
  const value = payload[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
};

const payloadMarketContext = (payload: Record<string, unknown>) =>
  valuationMarketContextSchema.parse(payload.marketContext ?? {});

export class CollectionOpportunityValuationProcessor implements CollectionOpportunityEvaluator {
  constructor(
    private readonly repository: OpportunityValuationRepository,
    private readonly engine = new DeterministicValuationEngine(),
    private readonly clock: () => Date = () => new Date(),
    private readonly listingRepository?: PersistedListingReader,
    private readonly observationRepository?: ListingObservationReader,
  ) {}

  async evaluate(input: {
    sourceId: string;
    result: CollectionResult;
    persistence: CollectionPersistenceSummary;
    policy: ValuationPolicy;
  }): Promise<void> {
    const observedAt = this.clock().toISOString();
    for (const record of input.result.items) {
      const listingId = input.persistence.listingIdsByExternalId[record.preview.externalId];
      if (!listingId) {
        throw new Error(`Persisted listing is missing for ${record.preview.externalId}.`);
      }
      if (this.listingRepository?.findById) {
        const persistedListing = await this.listingRepository.findById(listingId);
        if (!persistedListing) continue;
        const persistedMetadata = listingRawDataMetadataSchema.parse(
          persistedListing.rawDataMetadata,
        );
        const landedCost = persistedListing.landedCost
          ? landedCostSchema.parse(persistedListing.landedCost)
          : persistedMetadata.landedCost;
        if (
          landedCost?.status === 'indeterminate' ||
          (landedCost?.status === 'known' && persistedMetadata.shippingCostKnown !== true) ||
          (!landedCost && persistedMetadata.shippingCostKnown !== true)
        ) {
          continue;
        }
      }
      const historicalPrices = this.listingRepository
        ? (await this.listingRepository.getPriceHistory(listingId)).map((history) => ({
            priceMinor: Math.round(history.price * 100),
            observedAt: history.collectedAt.toISOString(),
          }))
        : [];
      const observationSignals = this.observationRepository
        ? (
            await this.observationRepository.findByListing(
              input.sourceId,
              record.preview.externalId,
            )
          ).reduce(
            (signals, event) => {
              if (event.type === 'REMOVED') signals.removedCount += 1;
              if (event.type === 'REAPPEARED') signals.reappearedCount += 1;
              if (event.type === 'DESCRIPTION_CHANGED') signals.descriptionChangedCount += 1;
              return signals;
            },
            { removedCount: 0, reappearedCount: 0, descriptionChangedCount: 0 },
          )
        : undefined;
      const comparables = input.result.items
        .filter((candidate) => candidate.preview.externalId !== record.preview.externalId)
        .map((candidate) => ({
          listingId:
            input.persistence.listingIdsByExternalId[candidate.preview.externalId] ??
            candidate.preview.externalId,
          priceMinor: candidate.preview.price.amountMinor,
          currency: candidate.preview.price.currency,
          condition: payloadText(candidate.payload, 'condition') ?? 'unknown',
          observedAt,
          marketContext: payloadMarketContext(candidate.payload),
        }));
      const output = this.engine.evaluate({
        targetPriceMinor: record.preview.price.amountMinor,
        currency: record.preview.price.currency,
        targetCondition: payloadText(record.payload, 'condition'),
        targetMarketContext: payloadMarketContext(record.payload),
        comparables,
        historicalPrices,
        observationSignals: observationSignals ?? {
          removedCount: 0,
          reappearedCount: 0,
          descriptionChangedCount: 0,
        },
        policy: input.policy,
      });
      await this.repository.save({ listingId, ...output });
    }
  }
}
