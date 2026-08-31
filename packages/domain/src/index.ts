import {
  Profile,
  ResearchProject,
  ResearchProjectCriteria,
  Source,
  CollectionRun,
  Seller,
  ListingImage,
  InferredProduct,
  Listing,
  ListingSnapshot,
  PriceHistory,
  Product,
  ListingProductMatch,
  AnalysisRun,
  Evidence,
  EvidenceType,
  AssessmentKind,
  EvidenceSourceType,
  EvidenceFunctionalStatus,
  DefectSeverity,
  Defect,
  DefectStatus,
  ScoreFactors,
  ListingScore,
  UserListingAction,
  PurchaseOutcome,
  CreateResearchProject,
  UpdateResearchProject,
  ResearchCriteria,
  ConnectorSearchInput,
  ConnectorSearchPage,
  RawListingRecord,
  RawListingPreview,
  CollectionResult,
  CollectionProgressSnapshot,
  CollectionRequestMetrics,
  NormalizedListingInput,
  RawObjectReference,
  ListingIngestionResult,
  CollectionPersistenceSummary,
  TextAnalysisInput,
  TextAnalysisResult,
  TextAnalysisJob,
  ObservationEvent,
  ObservationEventType,
  CollectorHealth,
  CollectorHealthState,
  ConnectorLayer,
  ConnectorFallback,
  ConnectorLimits,
  ConnectorManifest,
  SearchQueryKind,
  SearchQuery,
  SearchTermObservation,
  SearchTermObservationTransport,
  SearchQueryFamily,
  ValuationInput,
  ValuationOutput,
  ValuationPolicy,
  ValuationMarketContext,
  ValuationObservationSignals,
  OpportunityValuation,
  CheapFilterResult,
  ProductIdentity,
  InvestigationDecision,
  ListingTriageDecision,
  ListingTriageDecisionTransport,
  ListingTriageReviewTransport,
  CrossSourceIdentityDecision,
  CrossSourceIdentityCandidateTransport,
} from '@scout/schemas';

export type {
  Profile,
  ResearchProject,
  ResearchProjectCriteria,
  Source,
  CollectionRun,
  Seller,
  ListingImage,
  InferredProduct,
  Listing,
  ListingSnapshot,
  PriceHistory,
  Product,
  ListingProductMatch,
  AnalysisRun,
  Evidence,
  EvidenceType,
  AssessmentKind,
  EvidenceSourceType,
  EvidenceFunctionalStatus,
  DefectSeverity,
  Defect,
  DefectStatus,
  ScoreFactors,
  ListingScore,
  UserListingAction,
  PurchaseOutcome,
  CreateResearchProject,
  UpdateResearchProject,
  ResearchCriteria,
  ConnectorSearchInput,
  ConnectorSearchPage,
  RawListingRecord,
  RawListingPreview,
  CollectionResult,
  CollectionProgressSnapshot,
  CollectionRequestMetrics,
  NormalizedListingInput,
  RawObjectReference,
  ListingIngestionResult,
  CollectionPersistenceSummary,
  TextAnalysisInput,
  TextAnalysisResult,
  TextAnalysisJob,
  ObservationEvent,
  ObservationEventType,
  CollectorHealth,
  CollectorHealthState,
  ConnectorLayer,
  ConnectorFallback,
  ConnectorLimits,
  ConnectorManifest,
  SearchQueryKind,
  SearchQuery,
  SearchTermObservation,
  SearchTermObservationTransport,
  SearchQueryFamily,
  ValuationInput,
  ValuationOutput,
  ValuationPolicy,
  ValuationMarketContext,
  ValuationObservationSignals,
  OpportunityValuation,
  CheapFilterResult,
  ProductIdentity,
  InvestigationDecision,
  ListingTriageDecision,
  ListingTriageDecisionTransport,
  ListingTriageReviewTransport,
  CrossSourceIdentityDecision,
  CrossSourceIdentityCandidateTransport,
};

export { calculateUsToUsLandedCost } from './landed-cost';
export { calculateMarketMetrics } from './market-metrics';
export type { UsToUsLandedCostInput } from '@scout/schemas';
export type { LandedCost, LandedCostComponent, LandedCostComponentOrigin } from '@scout/schemas';
export type { MarketMetricObservation, MarketMetrics, MarketMetricSegment } from '@scout/schemas';

// Repository Ports

export interface ResearchProjectRepository {
  findById(id: string, userId: string): Promise<ResearchProject | null>;
  findByUserId(userId: string, includeDeleted?: boolean): Promise<ResearchProject[]>;
  create(userId: string, project: CreateResearchProject): Promise<ResearchProject>;
  update(id: string, userId: string, data: UpdateResearchProject): Promise<ResearchProject>;
  archive(id: string, userId: string): Promise<ResearchProject>;
  restore(id: string, userId: string): Promise<ResearchProject>;
  softDelete(id: string, userId: string): Promise<void>;
}

export interface ListingRepository {
  findById(id: string): Promise<Listing | null>;
  findBySourceAndExternalId(sourceId: string, externalId: string): Promise<Listing | null>;
  upsertListing(
    listing: Omit<Listing, 'id' | 'firstCollectedAt' | 'lastUpdatedAt'> & { id?: string },
  ): Promise<Listing>;
  addSnapshot(snapshot: Omit<ListingSnapshot, 'id' | 'collectedAt'>): Promise<ListingSnapshot>;
  addPriceHistory(history: Omit<PriceHistory, 'id' | 'collectedAt'>): Promise<PriceHistory>;
  getPriceHistory(listingId: string): Promise<PriceHistory[]>;
}

export interface SellerRepository {
  findById(id: string): Promise<Seller | null>;
  findBySourceAndExternalId(sourceId: string, externalId: string): Promise<Seller | null>;
  upsertSeller(seller: Omit<Seller, 'id' | 'firstSeenAt'> & { id?: string }): Promise<Seller>;
}

export interface AnalysisRepository {
  saveAnalysisRun(run: Omit<AnalysisRun, 'id' | 'createdAt'>): Promise<AnalysisRun>;
  saveEvidences(evidences: Omit<Evidence, 'id' | 'createdAt'>[]): Promise<Evidence[]>;
  saveDefects(defects: Omit<Defect, 'id' | 'createdAt'>[]): Promise<Defect[]>;
  saveScore(score: ListingScore): Promise<ListingScore>;
  getEvidencesByListingId(listingId: string): Promise<Evidence[]>;
  getDefectsByListingId(listingId: string): Promise<Defect[]>;
  getScoreByListingId(listingId: string): Promise<ListingScore | null>;
}

export interface UserListingActionRepository {
  setAction(
    action: Omit<UserListingAction, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<UserListingAction>;
  getAction(
    userId: string,
    listingId: string,
    projectId: string,
  ): Promise<UserListingAction | null>;
  getUserActionsForProject(userId: string, projectId: string): Promise<UserListingAction[]>;
}

export type CollectionErrorKind = 'transient' | 'permanent';

export class ConnectorError extends Error {
  constructor(
    message: string,
    readonly kind: CollectionErrorKind,
    readonly code: string,
  ) {
    super(message);
    this.name = 'ConnectorError';
  }
}

export interface SourceConnector {
  readonly source: string;
  readonly provider: string;
  readonly manifest: ConnectorManifest;
  search(input: ConnectorSearchInput): Promise<ConnectorSearchPage>;
  fetchDetails(externalId: string): Promise<RawListingRecord>;
  getRequestMetrics?(): CollectionRequestMetrics;
}

export interface FetchPageInput {
  url: string;
  useProxy?: boolean;
  jsRendering?: boolean;
  cacheTtlSeconds?: number;
}

export interface RawPage {
  content: string;
  statusCode: number;
  url: string;
  fetchedAt: Date;
}

export interface ScrapingProvider {
  fetchPage(input: FetchPageInput): Promise<RawPage>;
}

export interface CollectionGateway {
  readonly provider: string;
  readonly ingestionLayer?: number;
  collect(
    criteria: ResearchCriteria,
    limit?: number,
    query?: string,
    options?: CollectionCollectOptions,
  ): Promise<CollectionResult>;
}

export type CollectionPreviewFilter = (
  preview: RawListingPreview,
  criteria: ResearchCriteria,
) => CheapFilterResult;

export interface CollectionCollectOptions {
  previewFilter?: CollectionPreviewFilter;
  excludeExternalIds?: ReadonlySet<string>;
  onProgress?: (snapshot: CollectionProgressSnapshot) => Promise<void> | void;
}

export interface CollectionGatewayResolver {
  resolve(sourceId: string): CollectionGateway;
}

export interface SearchQueryFamilyProvider {
  getFamily(input: {
    projectId: string;
    criteria: ResearchCriteria;
  }): SearchQueryFamily | Promise<SearchQueryFamily>;
}

export interface SearchQueryFamilyRepository {
  findAcceptedObservations(projectId: string): Promise<SearchTermObservation[]>;
  saveFamily(input: {
    projectId: string;
    sourceId: string;
    collectionRunId: string;
    family: SearchQueryFamily;
  }): Promise<void>;
}

export interface SearchTermObservationReviewRepository {
  findByProjectId(projectId: string): Promise<SearchTermObservationTransport[]>;
  review(input: {
    projectId: string;
    observationId: string;
    status: 'accepted' | 'rejected';
  }): Promise<SearchTermObservationTransport>;
}

export interface ListingMapper {
  map(record: RawListingRecord): NormalizedListingInput;
}

export interface RawListingObjectStore {
  put(record: RawListingRecord): Promise<RawObjectReference>;
}

export interface ListingIngestionRepository {
  ingest(input: {
    projectId: string;
    sourceId: string;
    listing: NormalizedListingInput;
    rawObject: RawObjectReference;
  }): Promise<ListingIngestionResult>;
}

export interface ObservationEventRepository {
  append(event: ObservationEvent): Promise<void>;
}

export interface CollectorHealthRepository {
  record(check: CollectorHealth): Promise<void>;
}

export interface OpportunityValuationRepository {
  save(valuation: Omit<OpportunityValuation, 'id' | 'createdAt'>): Promise<OpportunityValuation>;
  findLatestByListingId(listingId: string): Promise<OpportunityValuation | null>;
}

export interface CollectionOpportunityEvaluator {
  evaluate(input: {
    sourceId: string;
    result: CollectionResult;
    persistence: CollectionPersistenceSummary;
    policy: ValuationPolicy;
  }): Promise<void>;
}

export interface ListingObservationReader {
  findByListing(sourceId: string, externalId: string): Promise<ObservationEvent[]>;
}

export type TriageDecisionInput = {
  projectId: string;
  sourceId: string;
  listingId: string;
  filter: CheapFilterResult;
  identity: ProductIdentity;
  investigation: InvestigationDecision;
};

export interface TriageDecisionRepository {
  save(input: TriageDecisionInput): Promise<void>;
  saveMany(inputs: readonly TriageDecisionInput[]): Promise<void>;
}

export interface ListingTriageDecisionReadRepository {
  findByProjectId(projectId: string): Promise<ListingTriageDecisionTransport[]>;
}

export interface ListingTriageReviewRepository {
  findReviewsByProjectId(projectId: string): Promise<ListingTriageReviewTransport[]>;
  review(input: {
    projectId: string;
    listingId: string;
    status: 'accepted' | 'rejected';
  }): Promise<ListingTriageReviewTransport>;
}

export interface CrossSourceIdentityCandidateRepository {
  saveCandidate(input: { projectId: string; decision: CrossSourceIdentityDecision }): Promise<void>;
  findCandidatesByProjectId(projectId: string): Promise<CrossSourceIdentityCandidateTransport[]>;
  reviewCandidate(input: {
    projectId: string;
    candidateId: string;
    status: 'accepted' | 'rejected';
  }): Promise<CrossSourceIdentityCandidateTransport>;
}

export interface CollectionTriageProcessor {
  process(input: {
    projectId: string;
    sourceId: string;
    criteria: ResearchCriteria;
    result: CollectionResult;
    persistence: CollectionPersistenceSummary;
  }): Promise<void>;
}

export interface CollectionResultIngestor {
  ingest(input: {
    projectId: string;
    sourceId: string;
    result: CollectionResult;
  }): Promise<CollectionPersistenceSummary>;
}

export interface TextAnalyzer {
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
  analyze(input: TextAnalysisInput): Promise<TextAnalysisResult>;
}

export type TextAnalysisBatchItem =
  { listingId: string; result: TextAnalysisResult } | { listingId: string; error: AnalysisError };

export interface TextBatchAnalyzer extends TextAnalyzer {
  analyzeBatch(inputs: TextAnalysisInput[]): Promise<TextAnalysisBatchItem[]>;
}

export type AnalysisErrorKind = 'transient' | 'permanent';

export class AnalysisError extends Error {
  constructor(
    message: string,
    readonly kind: AnalysisErrorKind,
    readonly code: string,
  ) {
    super(message);
    this.name = 'AnalysisError';
  }
}

export interface TextAnalysisRunRepository {
  request(input: {
    listingId: string;
    provider: string;
    model: string;
    promptVersion: string;
  }): Promise<{ analysisRunId: string; shouldQueue: boolean }>;
  markQueued(analysisRunId: string): Promise<void>;
  claim(analysisRunId: string): Promise<TextAnalysisJob | null>;
  complete(analysisRunId: string, result: TextAnalysisResult): Promise<void>;
  releaseForRetry(analysisRunId: string, error: AnalysisError): Promise<void>;
  fail(analysisRunId: string, error: AnalysisError): Promise<void>;
}

export interface TextAnalysisScheduler {
  schedule(listingIds: string[]): Promise<void>;
}

export interface CreateCollectionRunInput {
  projectId: string;
  idempotencyKey: string;
}

export interface CollectionRunRepository {
  createOrFind(input: CreateCollectionRunInput): Promise<{ run: CollectionRun; created: boolean }>;
  findById(id: string, projectId: string): Promise<CollectionRun | null>;
  findByRunId(id: string): Promise<CollectionRun | null>;
  markQueued(id: string): Promise<CollectionRun>;
  claim(id: string, expectedAttemptCount: number, startedAt?: Date): Promise<CollectionRun | null>;
  setProvider(id: string, provider: string): Promise<CollectionRun>;
  updateProgress?(id: string, progress: CollectionProgressSnapshot): Promise<CollectionRun>;
  getProjectCriteria(projectId: string): Promise<ResearchCriteria | null>;
  complete(
    id: string,
    result: CollectionResult,
    persistence?: CollectionPersistenceSummary,
    health?: CollectorHealth,
  ): Promise<CollectionRun>;
  releaseForRetry(
    id: string,
    error: ConnectorError,
    health?: CollectorHealth,
  ): Promise<CollectionRun>;
  fail(id: string, error: ConnectorError, health?: CollectorHealth): Promise<CollectionRun>;
}

export const DOMAIN_PACKAGE_STATUS = {
  package: '@scout/domain',
  initialized: true,
};
