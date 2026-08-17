import {
  CollectionGateway,
  CollectionRunRepository,
  CollectionGatewayResolver,
  ConnectorError,
  type ConnectorManifest,
  SourceConnector,
} from '@scout/domain';
import {
  collectionResultSchema,
  collectionTaskSchema,
  collectorHealthSchema,
  connectorSearchPageSchema,
  connectorManifestSchema,
  rawListingRecordSchema,
  type CollectionTask,
  type ResearchCriteria,
} from '@scout/schemas';

export * from './ListingIngestionService';
export * from './GenericListingMapper';
export * from './FailureClassifier';
export * from './RepairProposalBuilder';
export * from './RepairSandboxRunner';

export class SourceCollectionGatewayRegistry implements CollectionGatewayResolver {
  private readonly gateways: ReadonlyMap<string, CollectionGateway>;

  constructor(entries: ReadonlyArray<readonly [string, CollectionGateway]>) {
    this.gateways = new Map(entries);
  }

  resolve(sourceId: string): CollectionGateway {
    const gateway = this.gateways.get(sourceId);
    if (!gateway) {
      throw new ConnectorError(
        'No collection gateway is configured for the source.',
        'permanent',
        'SOURCE_GATEWAY_NOT_CONFIGURED',
      );
    }
    return gateway;
  }
}

export interface CollectionLimits {
  maxPages: number;
  pageSize: number;
  maxItems: number;
  maxQueries?: number;
}

export const SAFE_COLLECTION_LIMITS: CollectionLimits = {
  maxPages: 1,
  pageSize: 5,
  maxItems: 5,
  maxQueries: 1,
};

export const createConnectorManifest = (input: ConnectorManifest): ConnectorManifest =>
  connectorManifestSchema.parse(input);

export class DefaultCollectionGateway implements CollectionGateway {
  readonly provider: string;
  readonly ingestionLayer: number;
  readonly manifest: ConnectorManifest;

  constructor(
    private readonly connector: SourceConnector,
    limits?: CollectionLimits,
    ingestionLayer?: number,
  ) {
    this.manifest = connectorManifestSchema.parse(connector.manifest);
    if (this.manifest.source !== connector.source) {
      throw new ConnectorError(
        'Connector manifest source does not match connector source.',
        'permanent',
        'CONNECTOR_MANIFEST_SOURCE_MISMATCH',
      );
    }
    this.provider = connector.provider;
    this.limits = limits ?? this.manifest.limits ?? SAFE_COLLECTION_LIMITS;
    this.ingestionLayer = ingestionLayer ?? this.manifest.primaryLayer;
  }

  private readonly limits: CollectionLimits;

  async collect(criteria: ResearchCriteria, limit = this.limits.maxItems, query?: string) {
    const effectiveLimit = Math.min(limit, this.limits.maxItems);
    const items = [];
    let cursor: string | undefined;
    let pagesFetched = 0;
    const seenCursors = new Set<string>();

    do {
      const remaining = effectiveLimit - items.length;
      const page = connectorSearchPageSchema.parse(
        await this.connector.search({
          criteria,
          limit: Math.min(this.limits.pageSize, remaining),
          cursor,
          query,
        }),
      );
      pagesFetched += 1;
      for (const preview of page.items.slice(0, remaining)) {
        const details = rawListingRecordSchema.parse(
          await this.connector.fetchDetails(preview.externalId),
        );
        if (details.preview.externalId !== preview.externalId) {
          throw new ConnectorError(
            'Connector detail identifier mismatch.',
            'permanent',
            'DETAIL_ID_MISMATCH',
          );
        }
        items.push(details);
      }
      if (page.nextCursor && (page.nextCursor === cursor || seenCursors.has(page.nextCursor))) {
        throw new ConnectorError(
          'Connector returned a repeated cursor.',
          'permanent',
          'CURSOR_LOOP',
        );
      }
      if (cursor) seenCursors.add(cursor);
      cursor = page.nextCursor;
    } while (cursor && items.length < effectiveLimit && pagesFetched < this.limits.maxPages);

    return collectionResultSchema.parse({ items, pagesFetched, provider: this.connector.provider });
  }
}

export class BoundedCollectionQueryRunner {
  constructor(
    private readonly gateway: CollectionGateway,
    private readonly maxQueries = 1,
    private readonly maxItems = 5,
  ) {}

  async collect(criteria: ResearchCriteria, queries: readonly string[], limit = this.maxItems) {
    const boundedQueries = queries.length > 0 ? queries.slice(0, this.maxQueries) : [undefined];
    const items: import('@scout/schemas').RawListingRecord[] = [];
    const seenExternalIds = new Set<string>();
    let pagesFetched = 0;
    for (const query of boundedQueries) {
      const remaining = limit - items.length;
      if (remaining <= 0) break;
      const result = await this.gateway.collect(criteria, remaining, query);
      pagesFetched += result.pagesFetched;
      for (const item of result.items) {
        if (!seenExternalIds.has(item.preview.externalId)) {
          seenExternalIds.add(item.preview.externalId);
          items.push(item);
        }
      }
    }
    return collectionResultSchema.parse({
      items: items.slice(0, limit),
      pagesFetched: Math.max(1, pagesFetched),
      provider: this.gateway.provider,
    });
  }
}

export const buildCollectorHealth = (
  collectionRunId: string,
  attemptNumber: number,
  sourceId: string,
  result: import('@scout/schemas').CollectionResult,
  ingestionLayer: number,
  checkedAt = new Date(),
) => {
  const hasResults = result.items.length > 0;
  const completeness = hasResults ? 100 : 0;
  return collectorHealthSchema.parse({
    collectionRunId,
    attemptNumber,
    sourceId,
    provider: result.provider,
    checkedAt,
    state: hasResults ? 'NORMAL' : 'EMPTY_RESULTS',
    ingestionLayer,
    completeness: {
      listingIdPercent: completeness,
      pricePercent: completeness,
      titlePercent: completeness,
    },
    diagnostics: hasResults ? [] : ['Source returned no listings.'],
  });
};

export const buildDegradedCollectorHealth = (
  collectionRunId: string,
  attemptNumber: number,
  sourceId: string,
  provider: string,
  ingestionLayer: number,
  error: ConnectorError,
  checkedAt = new Date(),
) => {
  const state = error.code.includes('RATE_LIMITED')
    ? 'RATE_LIMITED'
    : error.code.includes('OAUTH') ||
        error.code.includes('AUTH') ||
        error.code.includes('CONFIGURATION') ||
        error.code.includes('UNAUTHORIZED')
      ? 'LOGIN_REQUIRED'
      : error.code.includes('INVALID_RESPONSE') ||
          error.code.includes('INVALID_JSON') ||
          error.code.includes('MAPPING_INVALID') ||
          error.code.includes('PAGINATION_INVALID') ||
          error.code.includes('CURSOR_LOOP')
        ? 'CONTENT_CHANGED'
        : 'ERROR';
  return collectorHealthSchema.parse({
    collectionRunId,
    attemptNumber,
    sourceId,
    provider,
    checkedAt,
    state,
    ingestionLayer,
    completeness: { listingIdPercent: 0, pricePercent: 0, titlePercent: 0 },
    diagnostics: [error.code],
  });
};

export type CollectionTaskOutcome =
  | { action: 'ack'; status: 'completed' | 'ignored' | 'failed' }
  | { action: 'retry'; delaySeconds: number };

export class CollectionTaskProcessor {
  constructor(
    private readonly repository: CollectionRunRepository,
    private readonly gatewayOrResolver: CollectionGateway | CollectionGatewayResolver,
    private readonly maxAttempts = 3,
    private readonly ingestor?: import('@scout/domain').CollectionResultIngestor,
    private readonly analysisScheduler?: import('@scout/domain').TextAnalysisScheduler,
    private readonly queryFamilyProvider?: import('@scout/domain').SearchQueryFamilyProvider,
    private readonly opportunityEvaluator?: import('@scout/domain').CollectionOpportunityEvaluator,
    private readonly triageProcessor?: import('@scout/domain').CollectionTriageProcessor,
    private readonly queryFamilyRepository?: import('@scout/domain').SearchQueryFamilyRepository,
  ) {}

  async process(rawTask: unknown): Promise<CollectionTaskOutcome> {
    const parsed = collectionTaskSchema.safeParse(rawTask);
    if (!parsed.success) return { action: 'ack', status: 'failed' };

    const run = await this.repository.claim(parsed.data.runId);
    if (!run) {
      const existing = await this.repository.findByRunId(parsed.data.runId);
      if (existing?.status === 'running') return { action: 'retry', delaySeconds: 30 };
      return { action: 'ack', status: 'ignored' };
    }

    let gateway: CollectionGateway | undefined;
    try {
      gateway =
        'resolve' in this.gatewayOrResolver
          ? this.gatewayOrResolver.resolve(run.sourceId)
          : this.gatewayOrResolver;
      await this.repository.setProvider(run.id, gateway.provider);
      const criteria = await this.repository.getProjectCriteria(run.projectId);
      if (!criteria)
        throw new ConnectorError(
          'Project criteria not found.',
          'permanent',
          'PROJECT_CRITERIA_MISSING',
        );
      const queryFamily = this.queryFamilyProvider
        ? await this.queryFamilyProvider.getFamily({ projectId: run.projectId, criteria })
        : undefined;
      const result = queryFamily
        ? await new BoundedCollectionQueryRunner(
            gateway,
            gateway instanceof DefaultCollectionGateway
              ? (gateway.manifest.limits.maxQueries ?? 1)
              : 1,
            gateway instanceof DefaultCollectionGateway ? gateway.manifest.limits.maxItems : 5,
          ).collect(
            criteria,
            queryFamily.queries.map(({ query }) => query),
          )
        : await gateway.collect(criteria);
      if (queryFamily && this.queryFamilyRepository) {
        try {
          await this.queryFamilyRepository.saveFamily({
            projectId: run.projectId,
            sourceId: run.sourceId,
            collectionRunId: run.id,
            family: queryFamily,
          });
        } catch (cause) {
          if (cause instanceof ConnectorError) throw cause;
          throw new ConnectorError(
            'Search query family could not be persisted.',
            'transient',
            'QUERY_FAMILY_PERSISTENCE_UNAVAILABLE',
          );
        }
      }
      const health = buildCollectorHealth(
        run.id,
        run.attemptCount,
        run.sourceId,
        result,
        gateway.ingestionLayer ?? 1,
      );
      const persistence = this.ingestor
        ? await this.ingestor.ingest({
            projectId: run.projectId,
            sourceId: run.sourceId,
            result,
          })
        : undefined;
      if (persistence && this.triageProcessor) {
        try {
          await this.triageProcessor.process({
            projectId: run.projectId,
            sourceId: run.sourceId,
            criteria,
            result,
            persistence,
          });
        } catch (cause) {
          if (cause instanceof ConnectorError) throw cause;
          throw new ConnectorError(
            'Listing triage decisions could not be persisted.',
            'transient',
            'TRIAGE_PERSISTENCE_UNAVAILABLE',
          );
        }
      }
      if (persistence && this.analysisScheduler) {
        try {
          await this.analysisScheduler.schedule(persistence.listingIds);
        } catch (cause) {
          if (cause instanceof ConnectorError) throw cause;
          throw new ConnectorError(
            'Text analysis tasks could not be scheduled.',
            'transient',
            'ANALYSIS_QUEUE_UNAVAILABLE',
          );
        }
      }
      if (persistence && criteria.opportunityPolicy && this.opportunityEvaluator) {
        try {
          await this.opportunityEvaluator.evaluate({
            sourceId: run.sourceId,
            result,
            persistence,
            policy: criteria.opportunityPolicy,
          });
        } catch (cause) {
          if (cause instanceof ConnectorError) throw cause;
          throw new ConnectorError(
            'Opportunity valuations could not be persisted.',
            'transient',
            'VALUATION_PERSISTENCE_UNAVAILABLE',
          );
        }
      }
      await this.repository.complete(run.id, result, persistence, health);
      return { action: 'ack', status: 'completed' };
    } catch (cause) {
      const error =
        cause instanceof ConnectorError
          ? cause
          : new ConnectorError(
              'Unexpected collection failure.',
              'permanent',
              'UNEXPECTED_COLLECTION_ERROR',
            );
      if (error.kind === 'transient' && run.attemptCount < this.maxAttempts) {
        await this.repository.releaseForRetry(
          run.id,
          error,
          buildDegradedCollectorHealth(
            run.id,
            run.attemptCount,
            run.sourceId,
            gateway?.provider ?? 'unconfigured',
            gateway?.ingestionLayer ?? 1,
            error,
          ),
        );
        return { action: 'retry', delaySeconds: Math.min(60, 2 ** run.attemptCount) };
      }
      await this.repository.fail(
        run.id,
        error,
        buildDegradedCollectorHealth(
          run.id,
          run.attemptCount,
          run.sourceId,
          gateway?.provider ?? 'unconfigured',
          gateway?.ingestionLayer ?? 1,
          error,
        ),
      );
      return { action: 'ack', status: 'failed' };
    }
  }
}

export const createCollectionTask = (runId: string): CollectionTask =>
  collectionTaskSchema.parse({
    version: '1',
    runId,
  });

export const COLLECTION_PACKAGE_MARKER = '@scout/collection';
