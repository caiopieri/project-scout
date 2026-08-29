import { z } from 'zod';

export const uuidSchema = z.string().uuid();

// Base JSON Primaries
export const jsonPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type JsonPrimitive = z.infer<typeof jsonPrimitiveSchema>;

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([jsonPrimitiveSchema, z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]),
);

export const jsonObjectSchema = z.record(z.string(), jsonValueSchema);
export type JsonObject = z.infer<typeof jsonObjectSchema>;

// Profile / User Schema
export const profileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().optional(),
  plan: z.enum(['free', 'personal', 'pro', 'enterprise']).default('free'),
  createdAt: z.date().default(() => new Date()),
});
export type Profile = z.infer<typeof profileSchema>;

// Research Project Structured Query Schema
export const legacyStructuredQuerySchema = z.object({
  category: z.string().min(1),
  models: z.array(z.string()),
  storageGb: z.array(z.number().int().positive()).optional(),
  maximumTotalCostBrl: z.number().positive(),
  acceptedDefects: z.array(z.string()).default([]),
  rejectedDefects: z.array(z.string()).default([]),
  preferredEvidence: z.array(z.string()).default([]),
});
export type StructuredQuery = z.infer<typeof legacyStructuredQuerySchema>;

// Research Project Criteria Schema
export const researchProjectCriteriaSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  acceptedDefects: z.array(z.string()).default([]),
  rejectedDefects: z.array(z.string()).default([]),
  preferredEvidence: z.array(z.string()).default([]),
  maxPriceBrl: z.number().positive(),
  createdAt: z.date().default(() => new Date()),
});
export type ResearchProjectCriteria = z.infer<typeof researchProjectCriteriaSchema>;

// Source Schema
export const sourceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  domain: z.string().min(1),
  country: z.string().length(2),
  currency: z.string().length(3),
  connectorType: z.enum(['official_api', 'scraping_provider', 'mock']),
  status: z.enum(['active', 'maintenance', 'deprecated']).default('active'),
  capabilities: jsonObjectSchema.optional(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});
export type Source = z.infer<typeof sourceSchema>;

// F0: vendor-neutral observation events and semantic collector health
export const observationEventTypeSchema = z.enum([
  'LISTING_DISCOVERED',
  'LISTING_UPDATED',
  'PRICE_CHANGED',
  'DESCRIPTION_CHANGED',
  'REMOVED',
  'REAPPEARED',
  'MARKET_SNAPSHOT_UPDATED',
  'LIQUIDITY_CHANGED',
  'TREND_CHANGED',
  'COLLECTOR_DEGRADED',
  'AUTH_REQUIRED',
  'PROXY_DEGRADED',
  'COLLECTOR_RECOVERED',
]);
export type ObservationEventType = z.infer<typeof observationEventTypeSchema>;

export const observationEventSchema = z
  .object({
    id: z.string().uuid(),
    sourceId: z.string().uuid(),
    type: observationEventTypeSchema,
    subjectType: z.enum(['listing', 'market', 'collector']),
    subjectExternalId: z.string().min(1).optional(),
    dedupeKey: z.string().min(1).max(255),
    observedAt: z.date(),
    schemaVersion: z.string().min(1),
    payload: jsonObjectSchema.default({}),
  })
  .superRefine((event, context) => {
    if (event.subjectType === 'listing' && !event.subjectExternalId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['subjectExternalId'],
        message: 'Listing events require a subject external ID',
      });
    }
  });
export type ObservationEvent = z.infer<typeof observationEventSchema>;

export const collectorHealthStateSchema = z.enum([
  'NORMAL',
  'LOGIN_REQUIRED',
  'CAPTCHA',
  'EMPTY_RESULTS',
  'RATE_LIMITED',
  'ERROR',
  'MODAL_BLOCKING',
  'CONTENT_CHANGED',
]);
export type CollectorHealthState = z.infer<typeof collectorHealthStateSchema>;

export const collectorHealthSchema = z.object({
  collectionRunId: z.string().uuid().optional(),
  attemptNumber: z.number().int().nonnegative().default(0),
  sourceId: z.string().uuid(),
  provider: z.string().min(1),
  checkedAt: z.date(),
  state: collectorHealthStateSchema,
  ingestionLayer: z.number().int().min(1).max(7),
  completeness: z.object({
    listingIdPercent: z.number().min(0).max(100),
    pricePercent: z.number().min(0).max(100),
    titlePercent: z.number().min(0).max(100),
  }),
  diagnostics: z.array(z.string().min(1)).default([]),
});
export type CollectorHealth = z.infer<typeof collectorHealthSchema>;

export const connectorLayerSchema = z.number().int().min(1).max(7);
export type ConnectorLayer = z.infer<typeof connectorLayerSchema>;

export const connectorFallbackSchema = z.object({
  layer: connectorLayerSchema,
  enabled: z.boolean(),
  reason: z.string().min(1).optional(),
});
export type ConnectorFallback = z.infer<typeof connectorFallbackSchema>;

export const connectorLimitsSchema = z.object({
  maxPages: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  maxItems: z.number().int().positive(),
  maxQueries: z.number().int().positive().default(1),
});
export type ConnectorLimits = z.infer<typeof connectorLimitsSchema>;

export const connectorManifestSchema = z.object({
  source: z.string().regex(/^[a-z][a-z0-9-]{1,31}$/),
  primaryLayer: connectorLayerSchema,
  fallbacks: z.array(connectorFallbackSchema),
  limits: connectorLimitsSchema,
  healthStates: z
    .array(collectorHealthStateSchema)
    .min(1)
    .refine(
      (states) => new Set(states).size === states.length,
      'Connector health states must be unique',
    ),
});
export type ConnectorManifest = z.infer<typeof connectorManifestSchema>;

// Collection Run Schema
export const collectionRunStatusSchema = z.enum(['pending', 'running', 'completed', 'failed']);
export const collectionErrorKindSchema = z.enum(['transient', 'permanent']);

export const collectionRunSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  sourceId: z.string().uuid(),
  status: collectionRunStatusSchema.default('pending'),
  idempotencyKey: z.string().min(8).max(128),
  queuedAt: z.date().optional(),
  startedAt: z.date().optional(),
  finishedAt: z.date().optional(),
  leaseExpiresAt: z.date().optional(),
  attemptCount: z.number().int().nonnegative().default(0),
  itemsFound: z.number().int().nonnegative().default(0),
  itemsCreated: z.number().int().nonnegative().default(0),
  itemsUpdated: z.number().int().nonnegative().default(0),
  requestsUsed: z.number().int().nonnegative().optional(),
  requestBudget: z.number().int().positive().optional(),
  truncated: z.boolean().optional(),
  estimatedCost: z.number().nonnegative().default(0),
  provider: z.string().min(1),
  error: z.string().optional(),
  errorKind: collectionErrorKindSchema.optional(),
  errorCode: z.string().optional(),
});
export type CollectionRun = z.infer<typeof collectionRunSchema>;
export const collectionRunTransportSchema = collectionRunSchema.extend({
  queuedAt: z.coerce.date().optional(),
  startedAt: z.coerce.date().optional(),
  finishedAt: z.coerce.date().optional(),
  leaseExpiresAt: z.coerce.date().optional(),
});
export type CollectionRunTransport = z.infer<typeof collectionRunTransportSchema>;

export const collectionRequestMetricsSchema = z.object({
  requestsUsed: z.number().int().nonnegative(),
  requestBudget: z.number().int().positive(),
});
export type CollectionRequestMetrics = z.infer<typeof collectionRequestMetricsSchema>;

export const collectionProgressSnapshotSchema = z.object({
  itemsFound: z.number().int().nonnegative(),
  pagesFetched: z.number().int().nonnegative(),
  requestMetrics: collectionRequestMetricsSchema.optional(),
  truncated: z.boolean().default(false),
});
export type CollectionProgressSnapshot = z.infer<typeof collectionProgressSnapshotSchema>;

// Seller Schema
export const sellerSchema = z.object({
  id: z.string().uuid(),
  sourceId: z.string().uuid(),
  externalId: z.string().min(1),
  name: z.string().min(1),
  rating: z.number().nonnegative().optional(),
  positiveFeedbackPercentage: z.number().min(0).max(100).optional(),
  reviewCount: z.number().int().nonnegative().default(0),
  location: z.string().optional(),
  accountType: z.enum(['private', 'business', 'unknown']).default('unknown'),
  rawDataMetadata: jsonObjectSchema.optional(),
  firstSeenAt: z.date().default(() => new Date()),
});
export type Seller = z.infer<typeof sellerSchema>;

// Listing Image Schema
export const listingImageSchema = z.object({
  id: z.string().uuid(),
  listingId: z.string().uuid(),
  url: z.string().url(),
  storagePath: z.string().optional(),
  position: z.number().int().nonnegative().default(0),
  hash: z.string().optional(),
  createdAt: z
    .date()
    .optional()
    .default(() => new Date()),
});
export type ListingImage = z.infer<typeof listingImageSchema>;

// Inferred Product Schema
export const inferredProductSchema = z.object({
  brand: z.string().optional(),
  model: z.string().optional(),
  variant: z.string().optional(),
  confidence: z.number().min(0).max(1),
  evidenceIds: z.array(z.string().uuid()).default([]),
});
export type InferredProduct = z.infer<typeof inferredProductSchema>;

export const productIdentityAttributesSchema = z
  .object({
    brand: z.string().trim().min(1).max(100).optional(),
    model: z.string().trim().min(1).max(160).optional(),
    variant: z.string().trim().min(1).max(160).optional(),
    storageGb: z.number().int().positive().optional(),
    memoryGb: z.number().int().positive().optional(),
  })
  .default({});
export type ProductIdentityAttributes = z.infer<typeof productIdentityAttributesSchema>;

export const productIdentityMediaSchema = z
  .object({
    imageCount: z.number().int().nonnegative().max(20),
    primaryImagePresent: z.boolean(),
  })
  .default({ imageCount: 0, primaryImagePresent: false });
export type ProductIdentityMedia = z.infer<typeof productIdentityMediaSchema>;

// Listing Schema
export const listingSchema = z.object({
  id: z.string().uuid(),
  sourceId: z.string().uuid(),
  externalId: z.string().min(1),
  url: z.string().url(),
  title: z.string().min(1),
  description: z.string(),
  condition: z.string().min(1),
  currency: z.string().length(3).default('USD'),
  price: z.number().nonnegative(),
  shippingCost: z.number().nonnegative().default(0),
  totalVisibleCost: z.number().nonnegative(),
  sellerId: z.string().uuid().optional(),
  location: z.string().optional(),
  status: z.enum(['active', 'completed', 'out_of_stock']).default('active'),
  publishedAt: z.date().optional(),
  firstCollectedAt: z.date().default(() => new Date()),
  lastUpdatedAt: z.date().default(() => new Date()),
  specifications: z.record(z.string(), z.string()).default({}),
  images: z.array(listingImageSchema).default([]),
  inferredProduct: inferredProductSchema.nullable().default(null),
  rawDataPath: z.string(),
  rawContentHash: z.string().optional(),
  rawSchemaVersion: z.string().optional(),
  rawDataMetadata: jsonObjectSchema.default({}),
});
export type Listing = z.infer<typeof listingSchema>;

export const listingTransportSchema = listingSchema.extend({
  publishedAt: z.coerce.date().optional(),
  firstCollectedAt: z.coerce.date(),
  lastUpdatedAt: z.coerce.date(),
});
export type ListingTransport = z.infer<typeof listingTransportSchema>;

// Listing Snapshot Schema
export const listingSnapshotSchema = z.object({
  id: z.string().uuid(),
  listingId: z.string().uuid(),
  title: z.string().min(1),
  price: z.number().nonnegative(),
  shippingCost: z.number().nonnegative(),
  status: z.string(),
  rawObjectKey: z.string(),
  rawContentHash: z.string(),
  rawSchemaVersion: z.string().optional(),
  payloadSummary: jsonObjectSchema.default({}),
  collectedAt: z.date().default(() => new Date()),
});
export type ListingSnapshot = z.infer<typeof listingSnapshotSchema>;

// Price History Schema
export const priceHistorySchema = z.object({
  id: z.string().uuid(),
  listingId: z.string().uuid(),
  price: z.number().nonnegative(),
  shippingCost: z.number().nonnegative().default(0),
  status: z.enum(['active', 'completed', 'out_of_stock']).default('active'),
  collectedAt: z.date().default(() => new Date()),
});
export type PriceHistory = z.infer<typeof priceHistorySchema>;
export const priceHistoryTransportSchema = priceHistorySchema.extend({
  collectedAt: z.coerce.date(),
});
export type PriceHistoryTransport = z.infer<typeof priceHistoryTransportSchema>;

// Product Catalog Schema
export const productSchema = z.object({
  id: z.string().uuid(),
  category: z.string().min(1),
  brand: z.string().min(1),
  model: z.string().min(1),
  variant: z.string().optional(),
  releaseYear: z.number().int().positive().optional(),
  specifications: jsonObjectSchema.default({}),
  createdAt: z.date().default(() => new Date()),
});
export type Product = z.infer<typeof productSchema>;

// Listing Product Match Schema
export const listingProductMatchSchema = z.object({
  listingId: z.string().uuid(),
  productId: z.string().uuid(),
  confidence: z.number().min(0).max(1),
  extractionSource: z.string().min(1),
  createdAt: z.date().default(() => new Date()),
});
export type ListingProductMatch = z.infer<typeof listingProductMatchSchema>;

// Analysis Run Schema
export const analysisRunSchema = z.object({
  id: z.string().uuid(),
  listingId: z.string().uuid(),
  modelName: z.string().min(1),
  promptVersion: z.string().min(1),
  status: z.enum(['pending', 'completed', 'failed']).default('completed'),
  tokensUsed: z.number().int().nonnegative().default(0),
  error: z.string().optional(),
  createdAt: z.date().default(() => new Date()),
});
export type AnalysisRun = z.infer<typeof analysisRunSchema>;

// Evidence Taxonomies & Schema
export const evidenceTypeSchema = z.enum([
  'functional_state',
  'cosmetic_defect',
  'missing_part',
  'inconsistency',
]);
export type EvidenceType = z.infer<typeof evidenceTypeSchema>;

export const assessmentKindSchema = z.enum(['fact', 'inference', 'unknown']);
export type AssessmentKind = z.infer<typeof assessmentKindSchema>;

export const evidenceSourceTypeSchema = z.enum([
  'seller_declared',
  'title',
  'description',
  'image',
  'structured_data',
  'system_inferred',
  'user_confirmed',
]);
export type EvidenceSourceType = z.infer<typeof evidenceSourceTypeSchema>;

export const evidenceFunctionalStatusSchema = z.enum([
  'confirmed_working',
  'probably_working',
  'possibly_working',
  'unknown',
  'probably_defective',
  'confirmed_defective',
]);
export type EvidenceFunctionalStatus = z.infer<typeof evidenceFunctionalStatusSchema>;

export const defectSeveritySchema = z.enum(['none', 'low', 'medium', 'high', 'critical']);
export type DefectSeverity = z.infer<typeof defectSeveritySchema>;

export const evidenceSchema = z.object({
  id: z.string().uuid(),
  listingId: z.string().uuid(),
  evidenceType: evidenceTypeSchema,
  assessmentKind: assessmentKindSchema,
  sourceType: evidenceSourceTypeSchema,
  sourceReference: z.string().min(1),
  claim: z.string().min(1),
  status: evidenceFunctionalStatusSchema,
  confidence: z.number().min(0).max(1),
  explanation: z.string(),
  limitations: z.array(z.string()).default([]),
  severity: defectSeveritySchema,
  modelName: z.string().optional(),
  promptVersion: z.string().optional(),
  createdAt: z.date().default(() => new Date()),
});
export type Evidence = z.infer<typeof evidenceSchema>;

// Defect Schema
export const defectStatusSchema = z.enum(['declared', 'visible', 'inferred', 'unknown']);
export type DefectStatus = z.infer<typeof defectStatusSchema>;

export const defectSchema = z.object({
  id: z.string().uuid(),
  listingId: z.string().uuid(),
  component: z.string().min(1),
  defectType: z.string().min(1),
  status: defectStatusSchema,
  confidence: z.number().min(0).max(1),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  declared: z.boolean().default(false),
  visible: z.boolean().default(false),
  inferred: z.boolean().default(false),
  estimatedRepairCost: z.number().nonnegative().optional(),
  repairCostCurrency: z.string().length(3).default('BRL'),
  evidenceIds: z.array(z.string().uuid()).optional(),
  createdAt: z.date().default(() => new Date()),
});
export type Defect = z.infer<typeof defectSchema>;

// Milestone 7: provider-neutral textual analysis contract. Listing text is hostile
// external input and is bounded before it reaches deterministic or AI analyzers.
export const TEXT_ANALYSIS_DESCRIPTION_MAX_LENGTH = 50_000;
export const textAnalysisInputSchema = z
  .object({
    listingId: z.string().uuid(),
    title: z.string().min(1).max(500),
    description: z.string().max(TEXT_ANALYSIS_DESCRIPTION_MAX_LENGTH),
    condition: z.string().max(200).optional(),
  })
  .strict();
export type TextAnalysisInput = z.infer<typeof textAnalysisInputSchema>;

const analysisKeySchema = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);
export const textEvidenceSchema = z
  .object({
    key: analysisKeySchema,
    component: z.string().min(1).max(100),
    evidenceType: evidenceTypeSchema,
    assessmentKind: assessmentKindSchema,
    sourceType: z.enum(['title', 'description', 'system_inferred']),
    sourceReference: z.enum(['title', 'description', 'title+description']),
    claim: z.string().min(1).max(1000),
    status: evidenceFunctionalStatusSchema,
    confidence: z.number().min(0).max(1),
    explanation: z.string().min(1).max(2000),
    limitations: z.array(z.string().min(1).max(500)).max(10).default([]),
    severity: defectSeveritySchema,
  })
  .strict();
export type TextEvidence = z.infer<typeof textEvidenceSchema>;

export const textDefectSchema = z
  .object({
    key: analysisKeySchema,
    component: z.string().min(1).max(100),
    defectType: z.string().min(1).max(100),
    status: z.enum(['declared', 'inferred', 'unknown']),
    confidence: z.number().min(0).max(1),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    declared: z.boolean(),
    inferred: z.boolean(),
    evidenceKeys: z.array(analysisKeySchema).min(1).max(20),
  })
  .strict();
export type TextDefect = z.infer<typeof textDefectSchema>;

export const textAnalysisOutputSchema = z
  .object({
    evidences: z.array(textEvidenceSchema).max(50),
    defects: z.array(textDefectSchema).max(30),
    contradictions: z.array(z.string().min(1).max(1000)).max(20).default([]),
  })
  .strict()
  .superRefine((output, context) => {
    const evidenceKeys = new Set(output.evidences.map((evidence) => evidence.key));
    for (const defect of output.defects) {
      for (const key of defect.evidenceKeys) {
        if (!evidenceKeys.has(key))
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Unknown evidence key: ${key}`,
          });
      }
    }
  });
export type TextAnalysisOutput = z.infer<typeof textAnalysisOutputSchema>;

export const textAnalysisResultSchema = z
  .object({
    evidences: z.array(textEvidenceSchema).max(50),
    defects: z.array(textDefectSchema).max(30),
    contradictions: z.array(z.string().min(1).max(1000)).max(20).default([]),
    provider: z.string().min(1).max(100),
    model: z.string().min(1).max(100),
    promptVersion: z.string().min(1).max(50),
    usage: z.object({
      inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
      totalTokens: z.number().int().nonnegative(),
    }),
  })
  .strict()
  .superRefine((result, context) => {
    const evidenceKeys = new Set(result.evidences.map((evidence) => evidence.key));
    for (const defect of result.defects) {
      for (const key of defect.evidenceKeys) {
        if (!evidenceKeys.has(key))
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Unknown evidence key: ${key}`,
          });
      }
    }
  });
export type TextAnalysisResult = z.infer<typeof textAnalysisResultSchema>;

export const textAnalysisTaskSchema = z
  .object({
    kind: z.literal('text-analysis'),
    version: z.literal('1'),
    analysisRunId: z.string().uuid(),
  })
  .strict();
export type TextAnalysisSingleTask = z.infer<typeof textAnalysisTaskSchema>;

export const textAnalysisBatchTaskSchema = z
  .object({
    kind: z.literal('text-analysis-batch'),
    version: z.literal('1'),
    analysisRunIds: z.array(z.string().uuid()).min(1).max(20),
  })
  .strict()
  .superRefine((task, context) => {
    if (new Set(task.analysisRunIds).size !== task.analysisRunIds.length)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['analysisRunIds'],
        message: 'Analysis run IDs must be unique.',
      });
  });
export type TextAnalysisBatchTask = z.infer<typeof textAnalysisBatchTaskSchema>;
export const textAnalysisQueueTaskSchema = z.union([
  textAnalysisTaskSchema,
  textAnalysisBatchTaskSchema,
]);
export type TextAnalysisTask = z.infer<typeof textAnalysisQueueTaskSchema>;
export type TextAnalysisQueueTask = TextAnalysisTask;

export const textAnalysisJobSchema = textAnalysisInputSchema.extend({
  analysisRunId: z.string().uuid(),
  attemptCount: z.number().int().positive(),
});
export type TextAnalysisJob = z.infer<typeof textAnalysisJobSchema>;

// Score Factors Schema
export const scoreFactorsSchema = z.object({
  positive: z.array(z.string()).default([]),
  negative: z.array(z.string()).default([]),
  missing: z.array(z.string()).default([]),
  contradictions: z.array(z.string()).default([]),
});
export type ScoreFactors = z.infer<typeof scoreFactorsSchema>;

// Listing Score Schema
export const listingScoreSchema = z.object({
  id: z.string().uuid().optional(),
  listingId: z.string().uuid(),
  analysisRunId: z.string().uuid().optional(),
  queryMatchScore: z.number().min(0).max(100),
  technicalRiskScore: z.number().min(0).max(100),
  fraudRiskScore: z.number().min(0).max(100),
  evidenceQualityScore: z.number().min(0).max(100),
  priceScore: z.number().min(0).max(100),
  opportunityScore: z.number().min(0).max(100),
  scoreFactors: scoreFactorsSchema,
  formulaVersion: z.string().min(1).default('1.0.0'),
  explanation: z.string(),
  createdAt: z.date().default(() => new Date()),
});
export type ListingScore = z.infer<typeof listingScoreSchema>;

// User Listing Action Schema
export const userListingActionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  listingId: z.string().uuid(),
  projectId: z.string().uuid(),
  favorite: z.boolean().default(false),
  decision: z.enum(['pending', 'approved', 'rejected', 'purchased']).default('pending'),
  notes: z.string().optional(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});
export type UserListingAction = z.infer<typeof userListingActionSchema>;

// Purchase Outcome Schema
export const purchaseOutcomeSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  listingId: z.string().uuid(),
  purchasePrice: z.number().nonnegative(),
  actualDefects: z.array(z.string()).default([]),
  actualRepairCost: z.number().nonnegative().default(0),
  salePrice: z.number().nonnegative().optional(),
  outcome: z.enum(['profit', 'loss', 'break_even', 'kept_personal']).optional(),
  userRating: z.number().int().min(1).max(5).optional(),
  notes: z.string().optional(),
  createdAt: z.date().default(() => new Date()),
});
export type PurchaseOutcome = z.infer<typeof purchaseOutcomeSchema>;

// Milestone 3: user-authored research intent. These identifiers are intentionally
// taxonomy-bound, not free-form strings, so deterministic and future AI providers
// produce the same persisted contract.
export const currencySchema = z.enum(['BRL', 'USD', 'EUR', 'CNY']);
export const intentDefectSchema = z.enum([
  'cracked_screen',
  'broken_back_glass',
  'degraded_battery',
  'activation_lock',
  'icloud_lock',
  'logic_board_failure',
  'no_power',
  'parts_only',
]);
export const researchConditionSchema = z.enum(['used', 'refurbished', 'for_repair', 'parts_only']);
export const functionalRequirementSchema = z.object({
  component: z.enum(['device', 'display', 'battery', 'logic_board']),
  minimumStatus: z.enum(['confirmed_working', 'probably_working', 'possibly_working']),
});
export const moneySchema = z.object({
  amountMinor: z.number().int().nonnegative(),
  currency: currencySchema,
});
export const valuationPolicySchema = z.object({
  processingCostMinor: z.number().int().nonnegative(),
  desiredMarginMinor: z.number().int().nonnegative(),
  repairReserveMinor: z.number().int().nonnegative().default(0),
  transactionCostRate: z.number().min(0).max(1).default(0),
  versionStepRate: z.number().min(0).max(0.5).default(0.05),
  locationMismatchRate: z.number().min(0).max(0.5).default(0.05),
});
export type ValuationPolicy = z.infer<typeof valuationPolicySchema>;

export const researchCriteriaSchema = z
  .object({
    category: z.enum(['smartphone', 'laptop']).optional(),
    brands: z.array(z.enum(['Apple'])).default([]),
    models: z.array(z.string().min(1)).default([]),
    variants: z.array(z.string().min(1)).default([]),
    storageGb: z.array(z.number().int().positive()).default([]),
    memoryGb: z.array(z.number().int().positive()).default([]),
    maximumPrice: moneySchema.optional(),
    acceptedDefects: z.array(intentDefectSchema).default([]),
    rejectedDefects: z.array(intentDefectSchema).default([]),
    acceptedConditions: z.array(researchConditionSchema).default([]),
    countries: z.array(z.string().length(2)).default([]),
    regions: z.array(z.string().min(1)).default([]),
    requiredFunctionalStates: z.array(functionalRequirementSchema).default([]),
    preferredEvidence: z.array(z.string().min(1)).default([]),
    additionalKeywords: z.array(z.string().min(1)).default([]),
    excludedKeywords: z.array(z.string().min(1)).default([]),
    opportunityPolicy: valuationPolicySchema.optional(),
  })
  .superRefine((criteria, ctx) => {
    if (
      !criteria.category &&
      !criteria.models.length &&
      !criteria.additionalKeywords.length &&
      !criteria.maximumPrice &&
      !criteria.acceptedDefects.length &&
      !criteria.rejectedDefects.length &&
      !criteria.acceptedConditions.length &&
      !criteria.requiredFunctionalStates.length
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one searchable criterion is required.',
      });
    }
    for (const defect of criteria.acceptedDefects) {
      if (criteria.rejectedDefects.includes(defect)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Defect cannot be both accepted and rejected: ${defect}`,
        });
      }
    }
  });
export type ResearchCriteria = z.infer<typeof researchCriteriaSchema>;

export const searchQueryKindSchema = z.enum([
  'exact',
  'alias',
  'abbreviation',
  'typo',
  'localized',
  'learned',
]);
export type SearchQueryKind = z.infer<typeof searchQueryKindSchema>;

export const searchQuerySchema = z.object({
  query: z.string().trim().min(1).max(200),
  kind: searchQueryKindSchema,
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string().min(1)).default([]),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const searchTermObservationStatusSchema = z.enum(['candidate', 'accepted', 'rejected']);
export const searchTermObservationSchema = z.object({
  term: z.string().trim().min(1).max(100),
  normalizedTerm: z.string().trim().min(1).max(100),
  kind: searchQueryKindSchema,
  status: searchTermObservationStatusSchema,
  evidence: z.array(z.string().min(1)).min(1),
  source: z.string().trim().min(1).max(100),
});
export type SearchTermObservation = z.infer<typeof searchTermObservationSchema>;

export const searchTermObservationTransportSchema = searchTermObservationSchema.extend({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  familyId: z.string().uuid(),
  createdAt: z.string().datetime(),
});
export type SearchTermObservationTransport = z.infer<typeof searchTermObservationTransportSchema>;

export const searchTermObservationReviewRequestSchema = z.object({
  status: z.enum(['accepted', 'rejected']),
});
export type SearchTermObservationReviewRequest = z.infer<
  typeof searchTermObservationReviewRequestSchema
>;

export const searchQueryFamilySchema = z.object({
  version: z.string().min(1).max(50),
  baseQuery: z.string().trim().min(1).max(200),
  queries: z.array(searchQuerySchema).min(1).max(100),
});
export type SearchQueryFamily = z.infer<typeof searchQueryFamilySchema>;

export const cheapFilterDecisionSchema = z.enum(['KEEP', 'REJECT', 'REVIEW']);
export const cheapFilterReasonSchema = z.enum([
  'EXCLUDED_KEYWORD',
  'CATEGORY_MISMATCH',
  'DUPLICATE',
  'PRICE_BAIT_SIGNAL',
  'PRICE_ABOVE_MAXIMUM',
  'REJECTED_DEFECT',
  'COMPONENT_OR_ACCESSORY',
  'INSUFFICIENT_IDENTITY_EVIDENCE',
]);
export const cheapFilterResultSchema = z.object({
  decision: cheapFilterDecisionSchema,
  reasons: z.array(cheapFilterReasonSchema).default([]),
});
export type CheapFilterDecision = z.infer<typeof cheapFilterDecisionSchema>;
export type CheapFilterReason = z.infer<typeof cheapFilterReasonSchema>;
export type CheapFilterResult = z.infer<typeof cheapFilterResultSchema>;

export const productIdentityStatusSchema = z.enum(['MATCHED', 'AMBIGUOUS', 'UNIDENTIFIED']);
export const productIdentitySchema = z.object({
  canonicalKey: z.string().min(1).max(200).optional(),
  status: productIdentityStatusSchema,
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string().min(1)).default([]),
  attributes: productIdentityAttributesSchema,
  media: productIdentityMediaSchema,
  mergeEligible: z.literal(false),
});
export type ProductIdentity = z.infer<typeof productIdentitySchema>;

export const crossSourceIdentityReferenceSchema = z.object({
  sourceId: z.string().uuid(),
  listingId: z.string().uuid(),
  identity: productIdentitySchema,
});
export type CrossSourceIdentityReference = z.infer<typeof crossSourceIdentityReferenceSchema>;

export const crossSourceIdentityRelationSchema = z.enum([
  'MATCH_CANDIDATE',
  'REVIEW',
  'NO_MATCH',
  'INSUFFICIENT_EVIDENCE',
]);
export type CrossSourceIdentityRelation = z.infer<typeof crossSourceIdentityRelationSchema>;

export const crossSourceIdentityDecisionSchema = z.object({
  leftSourceId: z.string().uuid(),
  leftListingId: z.string().uuid(),
  rightSourceId: z.string().uuid(),
  rightListingId: z.string().uuid(),
  relation: crossSourceIdentityRelationSchema,
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string().min(1)).default([]),
  mergeEligible: z.literal(false),
});
export type CrossSourceIdentityDecision = z.infer<typeof crossSourceIdentityDecisionSchema>;

export const crossSourceIdentityReviewStatusSchema = z.enum(['pending', 'accepted', 'rejected']);
export const crossSourceIdentityCandidateSchema = crossSourceIdentityDecisionSchema.extend({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  reviewStatus: crossSourceIdentityReviewStatusSchema,
  reviewedAt: z.date().nullable(),
  createdAt: z.date(),
});
export type CrossSourceIdentityCandidate = z.infer<typeof crossSourceIdentityCandidateSchema>;
export const crossSourceIdentityCandidateTransportSchema = crossSourceIdentityCandidateSchema
  .omit({ reviewedAt: true, createdAt: true })
  .extend({
    reviewedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
  });
export type CrossSourceIdentityCandidateTransport = z.infer<
  typeof crossSourceIdentityCandidateTransportSchema
>;
export const crossSourceIdentityCandidateReviewRequestSchema = z.object({
  status: z.enum(['accepted', 'rejected']),
});
export type CrossSourceIdentityCandidateReviewRequest = z.infer<
  typeof crossSourceIdentityCandidateReviewRequestSchema
>;

export const investigationStateSchema = z.enum([
  'DISCOVERED',
  'WATCH',
  'SCAM_SUSPECTED',
  'PRICE_BAIT',
  'WRONG_PRODUCT',
  'BAD_CONDITION',
  'OVERPRICED',
  'LOW_MARGIN',
  'DUPLICATE',
  'NEEDS_HUMAN_REVIEW',
  'HIGH_CONFIDENCE_DEAL',
]);
export const investigationDecisionSchema = z.object({
  state: investigationStateSchema,
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string().min(1)).default([]),
  requiresHumanReview: z.boolean(),
});
export type InvestigationState = z.infer<typeof investigationStateSchema>;
export type InvestigationDecision = z.infer<typeof investigationDecisionSchema>;

export const listingTriageDecisionSchema = z.object({
  projectId: z.string().uuid(),
  sourceId: z.string().uuid(),
  listingId: z.string().uuid(),
  filter: cheapFilterResultSchema,
  identity: productIdentitySchema,
  investigation: investigationDecisionSchema,
  decisionVersion: z.string().min(1).max(50).default('triage-rules.v1'),
  createdAt: z.date().default(() => new Date()),
});
export type ListingTriageDecision = z.infer<typeof listingTriageDecisionSchema>;

export const listingTriageDecisionTransportSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  sourceId: z.string().uuid(),
  listingId: z.string().uuid(),
  filter: cheapFilterResultSchema,
  identity: productIdentitySchema,
  investigation: investigationDecisionSchema,
  decisionVersion: z.string().min(1).max(50),
  createdAt: z.string().datetime(),
});
export type ListingTriageDecisionTransport = z.infer<typeof listingTriageDecisionTransportSchema>;

export const listingTriageReviewStatusSchema = z.enum(['accepted', 'rejected']);
export const listingTriageReviewRequestSchema = z.object({
  status: listingTriageReviewStatusSchema,
});
export type ListingTriageReviewRequest = z.infer<typeof listingTriageReviewRequestSchema>;
export const listingTriageReviewTransportSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  listingId: z.string().uuid(),
  status: listingTriageReviewStatusSchema,
  reviewedAt: z.string().datetime(),
});
export type ListingTriageReviewTransport = z.infer<typeof listingTriageReviewTransportSchema>;

const valuationMoneyMinorSchema = z
  .number()
  .int()
  .nonnegative()
  .refine(Number.isSafeInteger, 'Minor units must be a safe integer');
export const valuationComparableSchema = z.object({
  listingId: z.string().min(1),
  priceMinor: valuationMoneyMinorSchema,
  currency: z.string().length(3),
  condition: z.string().min(1),
  observedAt: z.string().datetime(),
  daysToSell: z.number().nonnegative().optional(),
});
export type ValuationComparable = z.infer<typeof valuationComparableSchema>;

export const valuationHistoricalPriceSchema = z.object({
  priceMinor: valuationMoneyMinorSchema,
  observedAt: z.string().datetime(),
});
export type ValuationHistoricalPrice = z.infer<typeof valuationHistoricalPriceSchema>;

export const valuationSellerSignalSchema = z.object({
  priceDropCount: z.number().int().nonnegative().optional(),
  daysActive: z.number().nonnegative().optional(),
  inventoryCount: z.number().int().nonnegative().optional(),
});
export type ValuationSellerSignal = z.infer<typeof valuationSellerSignalSchema>;

export const valuationObservationSignalsSchema = z.object({
  removedCount: z.number().int().nonnegative().default(0),
  reappearedCount: z.number().int().nonnegative().default(0),
  descriptionChangedCount: z.number().int().nonnegative().default(0),
});
export type ValuationObservationSignals = z.infer<typeof valuationObservationSignalsSchema>;

export const valuationMarketContextSchema = z.object({
  productVersion: z.string().trim().min(1).max(100).optional(),
  versionRank: z.number().int().nonnegative().optional(),
  location: z.string().trim().min(1).max(200).optional(),
  shippingCostMinor: valuationMoneyMinorSchema.nullable().optional(),
  quantity: z.number().int().positive().default(1),
});
export type ValuationMarketContext = z.infer<typeof valuationMarketContextSchema>;

export const valuationInputSchema = z.object({
  targetPriceMinor: valuationMoneyMinorSchema,
  currency: z.string().length(3),
  targetCondition: z.string().trim().min(1).optional(),
  targetMarketContext: valuationMarketContextSchema.default({}),
  comparables: z.array(
    valuationComparableSchema.extend({
      marketContext: valuationMarketContextSchema.default({}),
    }),
  ),
  historicalPrices: z.array(valuationHistoricalPriceSchema).default([]),
  sellerSignals: valuationSellerSignalSchema.optional(),
  observationSignals: valuationObservationSignalsSchema.default({}),
  policy: valuationPolicySchema,
});
export type ValuationInput = z.infer<typeof valuationInputSchema>;

export const opportunityScoresSchema = z.object({
  dealScore: z.number().min(0).max(100),
  trendScore: z.number().min(0).max(100),
  liquidityScore: z.number().min(0).max(100),
  sellerPressureScore: z.number().min(0).max(100),
  riskConfidenceScore: z.number().min(0).max(100),
});
export type OpportunityScores = z.infer<typeof opportunityScoresSchema>;

export const valuationOutputSchema = z.object({
  valuationVersion: z.string().min(1),
  estimatedMarketPriceMinor: valuationMoneyMinorSchema,
  maxPurchasePriceMinor: valuationMoneyMinorSchema,
  comparablesUsed: z.number().int().nonnegative(),
  outliersRemoved: z.number().int().nonnegative(),
  scores: opportunityScoresSchema,
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string().min(1)),
  missing: z.array(z.string().min(1)),
  explanation: z.string().min(1),
});
export type ValuationOutput = z.infer<typeof valuationOutputSchema>;

export const opportunityValuationSchema = valuationOutputSchema.extend({
  id: z.string().uuid(),
  listingId: z.string().uuid(),
  createdAt: z.date(),
});
export type OpportunityValuation = z.infer<typeof opportunityValuationSchema>;
export const opportunityValuationTransportSchema = opportunityValuationSchema.extend({
  createdAt: z.coerce.date(),
});
export type OpportunityValuationTransport = z.infer<typeof opportunityValuationTransportSchema>;

export const interpretIntentInputSchema = z.object({ query: z.string().min(8).max(4000) });
export type InterpretIntentInput = z.infer<typeof interpretIntentInputSchema>;
export const interpretationNoticeSchema = z.object({
  field: z.string(),
  message: z.string(),
  severity: z.enum(['warning', 'ambiguity']),
});
export const isoDateTimeSchema = z
  .string()
  .regex(
    /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/,
    'Invalid ISO-8601 UTC datetime.',
  );
export const persistedDateTimeSchema = z.string().min(20).max(35);
export const interpretationMetadataSchema = z.object({
  confidence: z.number().min(0).max(1),
  ambiguities: z.array(interpretationNoticeSchema),
  warnings: z.array(interpretationNoticeSchema),
  unidentifiedFields: z.array(z.string()),
  provider: z.string().min(1),
  model: z.string().min(1),
  promptOrRuleVersion: z.string().min(1),
  taxonomyVersion: z.string().min(1),
  interpretedAt: persistedDateTimeSchema,
});
export const interpretIntentResultSchema = interpretationMetadataSchema.extend({
  criteria: researchCriteriaSchema,
  interpretedAt: isoDateTimeSchema,
});
export type InterpretIntentResult = z.infer<typeof interpretIntentResultSchema>;

export const researchProjectStatusSchema = z.enum(['draft', 'active', 'archived', 'deleted']);
export const researchProjectSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional(),
  category: z.string().min(1),
  naturalLanguageQuery: z.string().trim().min(8).max(4000),
  structuredQuery: researchCriteriaSchema,
  interpretation: interpretationMetadataSchema,
  status: researchProjectStatusSchema.default('draft'),
  deletedAt: z.date().nullable().default(null),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type ResearchProject = z.infer<typeof researchProjectSchema>;

export const createResearchProjectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional(),
  naturalLanguageQuery: z.string().trim().min(8).max(4000),
  structuredQuery: researchCriteriaSchema,
  interpretation: interpretationMetadataSchema,
  status: z.enum(['draft', 'active']).default('draft'),
});
export type CreateResearchProject = z.infer<typeof createResearchProjectSchema>;
export const createResearchProjectRequestSchema = createResearchProjectSchema.omit({
  interpretation: true,
});

export const updateResearchProjectSchema = createResearchProjectSchema
  .omit({ status: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.');
export type UpdateResearchProject = z.infer<typeof updateResearchProjectSchema>;
export const updateResearchProjectRequestSchema = createResearchProjectRequestSchema
  .omit({ status: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

export const authenticatedUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
});
export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;
export const projectIdSchema = z.string().uuid();
export const authSessionSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
  user: authenticatedUserSchema,
});
export type AuthSession = z.infer<typeof authSessionSchema>;
export const researchProjectTransportSchema = researchProjectSchema.extend({
  deletedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// Milestone 4: asynchronous collection contracts. Queue messages carry only an
// opaque run identifier; the consumer reloads owner-scoped criteria from PostgreSQL.
export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);
export const collectionTaskSchema = z.object({
  version: z.literal('1'),
  runId: z.string().uuid(),
});
export type CollectionTask = z.infer<typeof collectionTaskSchema>;

export const rawListingPreviewSchema = z.object({
  externalId: z.string().min(1),
  url: z.string().url(),
  title: z.string().min(1),
  price: moneySchema,
  imageUrl: z.string().url().optional(),
  sellerExternalId: z.string().min(1).optional(),
});
export type RawListingPreview = z.infer<typeof rawListingPreviewSchema>;
export const rawListingRecordSchema = z.object({
  preview: rawListingPreviewSchema,
  payload: jsonObjectSchema,
});

export const rawListingAspectSchema = z.object({
  name: z.string().trim().min(1).max(100),
  value: z.string().trim().min(1).max(200),
});
export const rawListingImageReferenceSchema = z.object({
  imageUrl: z.string().url(),
});

const ebayDeletionIdentifierSchema = z.string().min(1).max(1024);

export const ebayNotificationSignatureHeaderSchema = z
  .object({
    kid: z.string().min(1).max(256),
    signature: z.string().min(1).max(2048),
  })
  .passthrough();

export const ebayNotificationPublicKeyResponseSchema = z
  .object({ key: z.string().min(64).max(8192) })
  .passthrough();

export const ebayAccountDeletionNotificationSchema = z
  .object({
    metadata: z
      .object({
        topic: z.literal('MARKETPLACE_ACCOUNT_DELETION'),
        schemaVersion: z.string().min(1).max(32),
        deprecated: z.boolean(),
      })
      .passthrough(),
    notification: z
      .object({
        notificationId: z.string().min(1).max(128),
        eventDate: z.string().datetime(),
        publishDate: z.string().datetime(),
        publishAttemptCount: z.number().int().positive(),
        data: z
          .object({
            username: ebayDeletionIdentifierSchema.optional(),
            userId: ebayDeletionIdentifierSchema.optional(),
            eiasToken: ebayDeletionIdentifierSchema.optional(),
          })
          .refine((data) => Boolean(data.username || data.userId || data.eiasToken), {
            message: 'At least one eBay account identifier is required.',
          }),
      })
      .passthrough(),
  })
  .passthrough();

export const ebayAccountDeletionTaskSchema = z
  .object({
    kind: z.literal('ebay-account-deletion'),
    version: z.literal('1'),
    notificationId: z.string().min(1).max(128),
    username: ebayDeletionIdentifierSchema.optional(),
    userId: ebayDeletionIdentifierSchema.optional(),
    eiasToken: ebayDeletionIdentifierSchema.optional(),
  })
  .refine((task) => Boolean(task.username || task.userId || task.eiasToken), {
    message: 'At least one eBay account identifier is required.',
  });

export const ebayAccountDeletionPreparationSchema = z.object({
  alreadyCompleted: z.boolean(),
  rawObjectKeys: z.array(z.string().min(1)),
  imageObjectKeys: z.array(z.string().min(1)),
  matchedSellers: z.number().int().nonnegative(),
  matchedListings: z.number().int().nonnegative(),
});

export const ebayAccountDeletionPreparationRowSchema = z.object({
  already_completed: z.boolean(),
  raw_object_keys: z.array(z.string()),
  image_object_keys: z.array(z.string()),
  matched_sellers: z.number().int().nonnegative(),
  matched_listings: z.number().int().nonnegative(),
});

export const ebayAccountDeletionFinalizationRowSchema = z.object({
  completed: z.boolean(),
  matched_sellers: z.number().int().nonnegative(),
  matched_listings: z.number().int().nonnegative(),
});

export type EbayAccountDeletionNotification = z.infer<typeof ebayAccountDeletionNotificationSchema>;
export type EbayAccountDeletionTask = z.infer<typeof ebayAccountDeletionTaskSchema>;

export const ebayRateLimitAcquireRequestSchema = z.object({
  operation: z.enum(['search', 'details']),
  maxRequests: z.number().int().positive(),
  windowSeconds: z.number().int().positive(),
});

export type EbayRateLimitAcquireRequest = z.infer<typeof ebayRateLimitAcquireRequestSchema>;
export type EbayAccountDeletionPreparation = z.infer<typeof ebayAccountDeletionPreparationSchema>;
export type RawListingRecord = z.infer<typeof rawListingRecordSchema>;

export const connectorSearchInputSchema = z.object({
  criteria: researchCriteriaSchema,
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  query: z.string().trim().min(1).max(200).optional(),
});
export type ConnectorSearchInput = z.infer<typeof connectorSearchInputSchema>;
export const connectorSearchPageSchema = z.object({
  items: z.array(rawListingPreviewSchema),
  nextCursor: z.string().optional(),
});
export type ConnectorSearchPage = z.infer<typeof connectorSearchPageSchema>;

export const manualEbayProbeInputSchema = z
  .object({
    query: z.string().trim().min(3).max(120),
    maxResults: z.number().int().min(1).max(5).default(5),
  })
  .strict();
export type ManualEbayProbeInput = z.infer<typeof manualEbayProbeInputSchema>;

export const collectionResultSchema = z.object({
  items: z.array(rawListingRecordSchema),
  pagesFetched: z.number().int().positive(),
  provider: z.string().min(1),
  requestMetrics: collectionRequestMetricsSchema.optional(),
  // True when the request budget ran out before the source was exhausted. A
  // truncated sweep is a valid result; presenting it as complete is not.
  truncated: z.boolean().default(false),
});
export type CollectionResult = z.infer<typeof collectionResultSchema>;

// Milestone 6: provider payloads are normalized into exact minor-unit money
// before the persistence adapter converts them to PostgreSQL NUMERIC(12, 2).
export const normalizedSellerInputSchema = z.object({
  externalId: z.string().min(1),
  name: z.string().min(1),
  reviewCount: z.number().int().nonnegative().default(0),
  positiveFeedbackPercentage: z.number().min(0).max(100).optional(),
  accountType: z.enum(['private', 'business', 'unknown']).default('unknown'),
});
export type NormalizedSellerInput = z.infer<typeof normalizedSellerInputSchema>;

export const normalizedListingImageInputSchema = z.object({
  url: z.string().url(),
  position: z.number().int().nonnegative(),
});
export type NormalizedListingImageInput = z.infer<typeof normalizedListingImageInputSchema>;

export const normalizedListingInputSchema = z
  .object({
    externalId: z.string().min(1),
    url: z.string().url(),
    title: z.string().min(1),
    description: z.string(),
    condition: z.string().min(1),
    currency: z.string().length(3),
    priceMinor: z.number().int().nonnegative(),
    shippingCostMinor: z.number().int().nonnegative().nullable(),
    totalVisibleCostMinor: z.number().int().nonnegative(),
    seller: normalizedSellerInputSchema.optional(),
    location: z.string().optional(),
    status: z.enum(['active', 'completed', 'out_of_stock']),
    publishedAt: isoDateTimeSchema.optional(),
    specifications: z.record(z.string(), z.string()).default({}),
    images: z.array(normalizedListingImageInputSchema).default([]),
    inferredProduct: inferredProductSchema.omit({ evidenceIds: true }).nullable().default(null),
    rawDataMetadata: jsonObjectSchema.default({}),
  })
  .superRefine((listing, context) => {
    const expectedTotal = listing.priceMinor + (listing.shippingCostMinor ?? 0);
    if (listing.totalVisibleCostMinor !== expectedTotal) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Total visible cost must equal price plus known shipping.',
      });
    }
  });
export type NormalizedListingInput = z.infer<typeof normalizedListingInputSchema>;

export const rawObjectReferenceSchema = z.object({
  key: z.string().min(1),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  schemaVersion: z.string().min(1),
});
export type RawObjectReference = z.infer<typeof rawObjectReferenceSchema>;

export const listingIngestionResultSchema = z.object({
  listingId: z.string().uuid(),
  created: z.boolean(),
  updated: z.boolean(),
});
export type ListingIngestionResult = z.infer<typeof listingIngestionResultSchema>;

export const collectionPersistenceSummarySchema = z.object({
  itemsCreated: z.number().int().nonnegative(),
  itemsUpdated: z.number().int().nonnegative(),
  listingIds: z.array(z.string().uuid()).default([]),
  listingIdsByExternalId: z.record(z.string().min(1), z.string().uuid()).default({}),
});
export type CollectionPersistenceSummary = z.infer<typeof collectionPersistenceSummarySchema>;

export const SCHEMAS_PACKAGE_MARKER = '@scout/schemas';
