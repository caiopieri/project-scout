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

// F4.1: deterministic collector failure classification.
export const collectorFailureClassSchema = z.enum([
  'parser',
  'network',
  'auth',
  'proxy',
  'semantic',
  'source',
]);
export type CollectorFailureClass = z.infer<typeof collectorFailureClassSchema>;

export const collectorFailureInputSchema = z.object({
  source: z.string().trim().min(1).max(100),
  provider: z.string().trim().min(1).max(100),
  code: z.string().trim().min(1).max(200),
  kind: collectionErrorKindSchema,
  healthState: collectorHealthStateSchema.optional(),
  timestamp: z.date(),
});
export type CollectorFailureInput = z.infer<typeof collectorFailureInputSchema>;

export const collectorFailureClassificationSchema = z.object({
  failureClass: collectorFailureClassSchema,
  retryAllowed: z.boolean(),
  retryLimit: z.number().int().nonnegative(),
  stableCode: z.string().regex(/^[A-Z][A-Z0-9_]{2,127}$/),
  ruleVersion: z.string().min(1).max(50),
});
export type CollectorFailureClassification = z.infer<typeof collectorFailureClassificationSchema>;

// F4.2: connector-scoped, non-executable repair proposals.
export const repairProposalVersionSchema = z.literal('repair-proposal.v1');
export type RepairProposalVersion = z.infer<typeof repairProposalVersionSchema>;

export const repairProposalStatusSchema = z.enum([
  'PROPOSED',
  'APPROVED',
  'REJECTED',
  'ROLLED_BACK',
]);
export type RepairProposalStatus = z.infer<typeof repairProposalStatusSchema>;

export const repairProposalIdentifierSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9-]{1,63}$/);

export const repairProposalFixtureSchema = z
  .object({
    id: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/),
    description: z.string().trim().min(1).max(500),
  })
  .strict();
export type RepairProposalFixture = z.infer<typeof repairProposalFixtureSchema>;

export const repairProposalCanarySchema = z
  .object({
    percentage: z.number().finite().min(0).max(25),
  })
  .strict();
export type RepairProposalCanary = z.infer<typeof repairProposalCanarySchema>;

export const repairProposalBudgetSchema = z
  .object({
    maxExecutions: z.number().int().min(1).max(10),
    windowSeconds: z.number().int().min(1).max(3600),
  })
  .strict();
export type RepairProposalBudget = z.infer<typeof repairProposalBudgetSchema>;

const repairProposalRollbackConditionsSchema = z
  .array(z.string().trim().min(1).max(300))
  .min(1)
  .max(20);

export const repairProposalInputSchema = z
  .object({
    source: repairProposalIdentifierSchema,
    provider: repairProposalIdentifierSchema,
    failureClass: collectorFailureClassSchema,
    stableCode: z.string().regex(/^COLLECTOR_[A-Z0-9_]{2,127}$/),
    changeSummary: z.string().trim().min(1).max(1000),
    fixtures: z.array(repairProposalFixtureSchema).min(1).max(20),
    canary: repairProposalCanarySchema,
    budget: repairProposalBudgetSchema,
    rollbackConditions: repairProposalRollbackConditionsSchema,
  })
  .strict();
export type RepairProposalInput = z.infer<typeof repairProposalInputSchema>;

export const repairProposalSchema = z
  .object({
    version: repairProposalVersionSchema,
    status: repairProposalStatusSchema,
    source: repairProposalIdentifierSchema,
    provider: repairProposalIdentifierSchema,
    failureClass: collectorFailureClassSchema,
    stableCode: z.string().regex(/^COLLECTOR_[A-Z0-9_]{2,127}$/),
    changeSummary: z.string().trim().min(1).max(1000),
    fixtures: z.array(repairProposalFixtureSchema).min(1).max(20),
    canary: repairProposalCanarySchema,
    budget: repairProposalBudgetSchema,
    rollbackConditions: repairProposalRollbackConditionsSchema,
    requiresHumanApproval: z.literal(true),
    executable: z.literal(false),
  })
  .strict();
export type RepairProposal = z.infer<typeof repairProposalSchema>;

// F4.4: replay-only sandbox execution. No patch or connector mutation is
// represented by these contracts.
export const repairSandboxEnvironmentSchema = z.literal('sandbox');
export type RepairSandboxEnvironment = z.infer<typeof repairSandboxEnvironmentSchema>;

export const repairReplayResultSchema = z
  .object({
    fixtureId: repairProposalFixtureSchema.shape.id,
    passed: z.boolean(),
    failureClass: collectorFailureClassSchema.optional(),
    durationMs: z.number().finite().nonnegative().max(3_600_000),
  })
  .strict();
export type RepairReplayResult = z.infer<typeof repairReplayResultSchema>;

export const repairSandboxRunInputSchema = z
  .object({
    proposal: repairProposalSchema,
    environment: repairSandboxEnvironmentSchema,
    approved: z.literal(true),
  })
  .strict();
export type RepairSandboxRunInput = z.infer<typeof repairSandboxRunInputSchema>;

export const repairSandboxRunResultSchema = z
  .object({
    status: z.enum(['COMPLETED', 'ROLLED_BACK']),
    environment: repairSandboxEnvironmentSchema,
    fixtureResults: z.array(repairReplayResultSchema).max(10),
    executedCount: z.number().int().nonnegative().max(10),
    passedCount: z.number().int().nonnegative().max(10),
    failedCount: z.number().int().nonnegative().max(10),
    canaryUsed: z.number().finite().min(0).max(25),
    rollbackApplied: z.boolean(),
    executable: z.literal(false),
  })
  .strict();
export type RepairSandboxRunResult = z.infer<typeof repairSandboxRunResultSchema>;

export const repairSandboxRunSchema = repairSandboxRunResultSchema
  .extend({
    id: z.string().uuid(),
    proposalVersion: repairProposalVersionSchema,
    proposalSource: repairProposalIdentifierSchema,
    proposalProvider: repairProposalIdentifierSchema,
    createdAt: z.date(),
  })
  .strict();
export type RepairSandboxRun = z.infer<typeof repairSandboxRunSchema>;

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
export type TextAnalysisTask = z.infer<typeof textAnalysisTaskSchema>;

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

// F5.1: read-only electronic auction lot due diligence.
export const auctionLotEvidenceSchema = z
  .object({
    source: z.string().trim().min(1).max(100),
    priceMinor: valuationMoneyMinorSchema,
    currency: currencySchema,
    note: z.string().trim().min(1).max(300),
    version: z.string().trim().min(1).max(50),
  })
  .strict();
export type AuctionLotEvidence = z.infer<typeof auctionLotEvidenceSchema>;

export const auctionLotInputSchema = z
  .object({
    externalId: z.string().trim().min(1).max(200),
    source: z.string().trim().min(1).max(100),
    title: z.string().trim().min(1).max(500),
    category: z.literal('electronics'),
    quantity: z.number().int().positive().max(100_000).optional(),
    askingPriceMinor: valuationMoneyMinorSchema,
    currency: currencySchema,
    condition: researchConditionSchema.optional(),
    location: z.string().trim().min(1).max(200).optional(),
    evidence: z.array(auctionLotEvidenceSchema).max(50),
  })
  .strict();
export type AuctionLotInput = z.infer<typeof auctionLotInputSchema>;

export const auctionLotCostPolicySchema = z
  .object({
    shippingMinor: valuationMoneyMinorSchema.optional(),
    buyerFeesMinor: valuationMoneyMinorSchema.optional(),
    taxesMinor: valuationMoneyMinorSchema.optional(),
    processingMinor: valuationMoneyMinorSchema.optional(),
    repairReserveMinor: valuationMoneyMinorSchema.optional(),
    minimumMarginMinor: valuationMoneyMinorSchema.optional(),
  })
  .strict();
export type AuctionLotCostPolicy = z.infer<typeof auctionLotCostPolicySchema>;

export const auctionLotDossierRiskSchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export const auctionLotDossierRecommendationSchema = z.enum(['REVIEW', 'SHORTLIST', 'AVOID']);
export const auctionLotDossierFlagSchema = z.enum([
  'MISSING_MARKET_EVIDENCE',
  'MISSING_CONDITION',
  'MISSING_LOCATION',
  'MISSING_SHIPPING_EVIDENCE',
  'MISSING_QUANTITY',
  'MISSING_COST_POLICY',
  'LOW_MARKET_SAMPLE',
  'MARGIN_BELOW_TARGET',
  'ASKING_PRICE_ABOVE_LIMIT',
]);
export const auctionLotDossierSchema = z
  .object({
    externalId: z.string().trim().min(1).max(200),
    source: z.string().trim().min(1).max(100),
    currency: currencySchema,
    totalCostMinor: valuationMoneyMinorSchema,
    unitCostMinor: valuationMoneyMinorSchema,
    estimatedMarketUnitPriceMinor: valuationMoneyMinorSchema,
    estimatedRevenueMinor: valuationMoneyMinorSchema,
    maxRecommendedPurchaseMinor: valuationMoneyMinorSchema,
    estimatedMarginMinor: z.number().int(),
    risk: auctionLotDossierRiskSchema,
    flags: z.array(auctionLotDossierFlagSchema).max(10),
    recommendation: auctionLotDossierRecommendationSchema,
    evidenceCount: z.number().int().nonnegative().max(50),
    explanation: z.string().trim().min(1).max(1_000),
  })
  .strict();
export type AuctionLotDossier = z.infer<typeof auctionLotDossierSchema>;

export const auctionDocumentTypeSchema = z.enum([
  'EDITAL',
  'MANIFEST',
  'CONDITION_REPORT',
  'TERMS',
]);
export const auctionDocumentClaimStatusSchema = z.enum(['CONFIRMED', 'UNKNOWN', 'CONTRADICTED']);
export const auctionDocumentClaimSchema = z
  .object({
    key: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{1,63}$/),
    value: z.string().trim().min(1).max(1_000),
    sourceReference: z.string().trim().min(1).max(300),
    status: auctionDocumentClaimStatusSchema,
    severity: defectSeveritySchema,
  })
  .strict();
export type AuctionDocumentClaim = z.infer<typeof auctionDocumentClaimSchema>;

export const auctionDocumentSchema = z
  .object({
    documentId: z.string().trim().min(1).max(200),
    lotExternalId: z.string().trim().min(1).max(200),
    type: auctionDocumentTypeSchema,
    version: z.number().int().positive().max(10_000),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    content: z.string().max(50_000).optional(),
    observedAt: z.string().datetime(),
    source: z.string().trim().min(1).max(100),
    claims: z.array(auctionDocumentClaimSchema).max(100),
  })
  .strict();
export type AuctionDocument = z.infer<typeof auctionDocumentSchema>;

export const auctionEvidenceNormalizationSchema = z
  .object({
    lotExternalId: z.string().trim().min(1).max(200),
    documentCount: z.number().int().nonnegative().max(50),
    claimCount: z.number().int().nonnegative().max(5_000),
    completeness: z.number().min(0).max(1),
    flags: z
      .enum(['NO_DOCUMENTS', 'CONFLICTING_CLAIMS', 'MISSING_MANIFEST', 'MISSING_CONDITION_REPORT'])
      .array()
      .max(10),
    conflictingKeys: z.array(z.string().regex(/^[a-z][a-z0-9_]{1,63}$/)).max(100),
    latestDocumentIds: z.array(z.string().trim().min(1).max(200)).max(50),
  })
  .strict();
export type AuctionEvidenceNormalization = z.infer<typeof auctionEvidenceNormalizationSchema>;

export const auctionMonitorEventTypeSchema = z.enum([
  'PRICE_CHANGED',
  'DEADLINE_CHANGED',
  'STATUS_CHANGED',
  'TERMS_CHANGED',
  'REMOVED',
]);
export const auctionMonitorEventSchema = z
  .object({
    eventId: z.string().trim().min(1).max(200),
    lotExternalId: z.string().trim().min(1).max(200),
    source: z.string().trim().min(1).max(100),
    sequence: z.number().int().positive().max(1_000_000_000),
    observedAt: z.string().datetime(),
    type: auctionMonitorEventTypeSchema,
    previousValue: z.string().trim().max(300).optional(),
    currentValue: z.string().trim().max(300).optional(),
  })
  .strict();
export type AuctionMonitorEvent = z.infer<typeof auctionMonitorEventSchema>;

export const auctionMonitorSummarySchema = z
  .object({
    lotExternalId: z.string().trim().min(1).max(200),
    events: z.array(auctionMonitorEventSchema).max(100),
    latestSequence: z.number().int().nonnegative(),
    alerts: z
      .enum(['PRICE_INCREASE', 'DEADLINE_NEAR', 'TERMS_CHANGED', 'LOT_REMOVED'])
      .array()
      .max(10),
  })
  .strict();
export type AuctionMonitorSummary = z.infer<typeof auctionMonitorSummarySchema>;

// F6.1: validated negotiation context and draft only. No transport, payment,
// credential or send authorization belongs in these contracts.
export const negotiationSourceSchema = z.enum(['ebay', 'mercadolivre', 'xianyu']);
export type NegotiationSource = z.infer<typeof negotiationSourceSchema>;

export const negotiationEvidenceKindSchema = z.enum(['LISTING', 'MARKET', 'SELLER', 'LOT']);
export const negotiationEvidenceSchema = z
  .object({
    source: negotiationSourceSchema,
    externalId: z.string().trim().min(1).max(200),
    kind: negotiationEvidenceKindSchema,
    summary: z.string().trim().min(1).max(500),
    observedAt: z.string().datetime(),
  })
  .strict();
export type NegotiationEvidence = z.infer<typeof negotiationEvidenceSchema>;

export const negotiationSellerPressureSchema = z.enum(['UNKNOWN', 'LOW', 'MEDIUM', 'HIGH']);
export const negotiationContextSchema = z
  .object({
    contextId: z.string().uuid(),
    category: z.literal('electronics'),
    source: negotiationSourceSchema,
    externalId: z.string().trim().min(1).max(200),
    title: z.string().trim().min(1).max(500),
    currency: currencySchema,
    askingPriceMinor: valuationMoneyMinorSchema,
    marketValueMinor: valuationMoneyMinorSchema,
    sellerPressure: negotiationSellerPressureSchema,
    targetPriceMinor: valuationMoneyMinorSchema,
    userMaxPriceMinor: valuationMoneyMinorSchema,
    evidence: z.array(negotiationEvidenceSchema).min(1).max(20),
    questions: z.array(z.string().trim().min(1).max(200)).max(5).default([]),
  })
  .strict()
  .superRefine((context, refinement) => {
    if (context.userMaxPriceMinor < context.targetPriceMinor) {
      refinement.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['userMaxPriceMinor'],
        message: 'User maximum must be greater than or equal to target price',
      });
    }
  });
export type NegotiationContext = z.infer<typeof negotiationContextSchema>;

export const negotiationSuggestionSchema = z
  .object({
    contextId: z.string().uuid(),
    source: negotiationSourceSchema,
    externalId: z.string().trim().min(1).max(200),
    currency: currencySchema,
    suggestedOfferMinor: valuationMoneyMinorSchema,
    maxOfferMinor: valuationMoneyMinorSchema,
    message: z.string().trim().min(1).max(800),
    requestedQuestions: z.array(z.string().trim().min(1).max(200)).max(5),
    evidenceReferences: z.array(z.string().trim().min(1).max(400)).min(1).max(20),
    rationale: z.string().trim().min(1).max(800),
    requiresHumanReview: z.literal(true),
    sent: z.literal(false),
    executable: z.literal(false),
  })
  .strict()
  .superRefine((suggestion, refinement) => {
    if (suggestion.suggestedOfferMinor > suggestion.maxOfferMinor) {
      refinement.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['suggestedOfferMinor'],
        message: 'Suggested offer cannot exceed user maximum',
      });
    }
  });
export type NegotiationSuggestion = z.infer<typeof negotiationSuggestionSchema>;

export const negotiationDraftSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    context: negotiationContextSchema,
    suggestion: negotiationSuggestionSchema,
    createdAt: z.date(),
  })
  .strict()
  .superRefine((draft, refinement) => {
    if (
      draft.context.contextId !== draft.suggestion.contextId ||
      draft.context.source !== draft.suggestion.source ||
      draft.context.externalId !== draft.suggestion.externalId ||
      draft.context.currency !== draft.suggestion.currency
    ) {
      refinement.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['suggestion'],
        message: 'Draft context and suggestion identity must match',
      });
    }
  });
export type NegotiationDraft = z.infer<typeof negotiationDraftSchema>;

export const negotiationFreshnessInputSchema = z
  .object({
    context: negotiationContextSchema,
    now: z.string().datetime(),
    maxAgeSeconds: z.number().int().min(1).max(604800),
  })
  .strict();
export type NegotiationFreshnessInput = z.infer<typeof negotiationFreshnessInputSchema>;

export const negotiationFreshnessStatusSchema = z.enum([
  'FRESH',
  'STALE',
  'INVALID_FUTURE_TIMESTAMP',
]);
export const negotiationFreshnessResultSchema = z
  .object({
    contextId: z.string().uuid(),
    checkedAt: z.string().datetime(),
    latestEvidenceAt: z.string().datetime(),
    ageSeconds: z.number().int().nonnegative(),
    status: negotiationFreshnessStatusSchema,
    revalidationRequired: z.boolean(),
    usable: z.boolean(),
  })
  .strict()
  .superRefine((result, refinement) => {
    const requiresRevalidation = result.status !== 'FRESH';
    const usable = result.status === 'FRESH';
    if (result.revalidationRequired !== requiresRevalidation || result.usable !== usable) {
      refinement.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['usable'],
        message: 'Freshness result flags do not match status',
      });
    }
  });
export type NegotiationFreshnessResult = z.infer<typeof negotiationFreshnessResultSchema>;

export const negotiationInteractionOutcomeSchema = z.enum([
  'NO_RESPONSE',
  'QUESTION',
  'COUNTEROFFER',
  'DECLINED',
  'ACCEPTED',
]);
export const negotiationInteractionSchema = z
  .object({
    contextId: z.string().uuid(),
    source: negotiationSourceSchema,
    externalId: z.string().trim().min(1).max(200),
    response: z.string().trim().max(1_000).default(''),
    observedAt: z.string().datetime(),
    outcome: negotiationInteractionOutcomeSchema,
    questions: z.array(z.string().trim().min(1).max(200)).max(5).default([]),
  })
  .strict();
export type NegotiationInteraction = z.infer<typeof negotiationInteractionSchema>;

export const negotiationFollowUpActionSchema = z.enum([
  'REVIEW_AND_SEND_MANUALLY',
  'DO_NOT_FOLLOW_UP',
]);
export const negotiationFollowUpSchema = z
  .object({
    contextId: z.string().uuid(),
    source: negotiationSourceSchema,
    externalId: z.string().trim().min(1).max(200),
    recommendedAction: negotiationFollowUpActionSchema,
    message: z.string().trim().min(1).max(800),
    requestedQuestions: z.array(z.string().trim().min(1).max(200)).max(5),
    rationale: z.string().trim().min(1).max(800),
    refusalIsContextual: z.literal(true),
    requiresHumanReview: z.literal(true),
    sent: z.literal(false),
    executable: z.literal(false),
  })
  .strict();
export type NegotiationFollowUp = z.infer<typeof negotiationFollowUpSchema>;

const authorizationMoneyMinorSchema = z
  .number()
  .int()
  .nonnegative()
  .refine(Number.isSafeInteger, 'Minor units must be a safe integer');
export const authorizationActionSchema = z.enum(['BUY', 'BID', 'SEND_MESSAGE']);
export const authorizationIdempotencyKeySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/);
const authorizationFieldsSchema = z
  .object({
    authorizationId: z.string().uuid(),
    userId: z.string().uuid(),
    category: z.literal('electronics'),
    source: negotiationSourceSchema,
    externalId: z.string().trim().min(1).max(200),
    action: authorizationActionSchema,
    currency: currencySchema,
    quantity: z.number().int().positive().max(100_000),
    unitPriceMinor: authorizationMoneyMinorSchema,
    totalCostMinor: authorizationMoneyMinorSchema,
    maxTotalCostMinor: authorizationMoneyMinorSchema,
    issuedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    idempotencyKey: authorizationIdempotencyKeySchema,
  })
  .strict();
const authorizationInvariantRefinement = (
  request: z.infer<typeof authorizationFieldsSchema>,
  refinement: z.RefinementCtx,
) => {
  if (request.totalCostMinor !== request.unitPriceMinor * request.quantity) {
    refinement.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['totalCostMinor'],
      message: 'Total cost must equal unit price times quantity',
    });
  }
  if (request.totalCostMinor > request.maxTotalCostMinor) {
    refinement.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['maxTotalCostMinor'],
      message: 'Total cost exceeds explicit maximum',
    });
  }
  if (Date.parse(request.expiresAt) <= Date.parse(request.issuedAt)) {
    refinement.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['expiresAt'],
      message: 'Expiration must be after issuance',
    });
  }
};
export const authorizationRequestSchema = authorizationFieldsSchema.superRefine(
  authorizationInvariantRefinement,
);
export type AuthorizationRequest = z.infer<typeof authorizationRequestSchema>;

export const authorizationEnvelopeSchema = authorizationFieldsSchema
  .extend({
    authorizationVersion: z.literal('authorization-envelope.v1'),
    authorizationId: z.string().uuid(),
    status: z.literal('PENDING_HUMAN_APPROVAL'),
    humanApproved: z.literal(false),
    executable: z.literal(false),
  })
  .strict()
  .superRefine((envelope, refinement) => {
    authorizationInvariantRefinement(envelope, refinement);
  });
export type AuthorizationEnvelope = z.infer<typeof authorizationEnvelopeSchema>;

export const authorizationGateInputSchema = z
  .object({
    envelope: authorizationEnvelopeSchema,
    now: z.string().datetime(),
    alreadyConsumed: z.boolean(),
  })
  .strict();
export type AuthorizationGateInput = z.infer<typeof authorizationGateInputSchema>;

export const authorizationGateDecisionSchema = z.enum([
  'AWAITING_HUMAN_APPROVAL',
  'EXPIRED',
  'REPLAYED',
]);
export const authorizationGateResultSchema = z
  .object({
    authorizationId: z.string().uuid(),
    decision: authorizationGateDecisionSchema,
    requiresHumanApproval: z.literal(true),
    executable: z.literal(false),
  })
  .strict();
export type AuthorizationGateResult = z.infer<typeof authorizationGateResultSchema>;

export const authorizationLedgerStatusSchema = z.enum(['PENDING', 'CONSUMED', 'EXPIRED']);
export const authorizationLedgerRecordSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    envelope: authorizationEnvelopeSchema,
    status: authorizationLedgerStatusSchema,
    createdAt: z.date(),
    consumedAt: z.date().optional(),
  })
  .strict()
  .superRefine((record, refinement) => {
    if (record.status === 'CONSUMED' && !record.consumedAt) {
      refinement.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['consumedAt'],
        message: 'Consumed record requires consumedAt',
      });
    }
    if (record.status !== 'CONSUMED' && record.consumedAt) {
      refinement.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['consumedAt'],
        message: 'Only consumed record may have consumedAt',
      });
    }
    if (record.userId !== record.envelope.userId) {
      refinement.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['userId'],
        message: 'Ledger owner must match envelope owner',
      });
    }
  });
export type AuthorizationLedgerRecord = z.infer<typeof authorizationLedgerRecordSchema>;

export const authorizationSessionBindingSchema = z
  .object({
    authorizationId: z.string().uuid(),
    userId: z.string().uuid(),
    sessionId: z.string().uuid(),
    boundAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
  })
  .strict()
  .superRefine((binding, refinement) => {
    if (Date.parse(binding.expiresAt) <= Date.parse(binding.boundAt)) {
      refinement.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAt'],
        message: 'Session binding must expire after it is bound',
      });
    }
  });
export type AuthorizationSessionBinding = z.infer<typeof authorizationSessionBindingSchema>;

export const authorizationSessionGateInputSchema = z
  .object({
    envelope: authorizationEnvelopeSchema,
    binding: authorizationSessionBindingSchema,
    currentUserId: z.string().uuid(),
    currentSessionId: z.string().uuid(),
    now: z.string().datetime(),
  })
  .strict()
  .superRefine((input, refinement) => {
    if (input.binding.authorizationId !== input.envelope.authorizationId) {
      refinement.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['binding', 'authorizationId'],
        message: 'Binding authorization must match envelope',
      });
    }
    if (input.binding.userId !== input.envelope.userId) {
      refinement.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['binding', 'userId'],
        message: 'Binding user must match envelope',
      });
    }
  });
export type AuthorizationSessionGateInput = z.infer<typeof authorizationSessionGateInputSchema>;

export const authorizationSessionGateDecisionSchema = z.enum([
  'SESSION_MATCH',
  'SESSION_MISMATCH',
  'SESSION_EXPIRED',
]);
export const authorizationSessionGateResultSchema = z
  .object({
    authorizationId: z.string().uuid(),
    decision: authorizationSessionGateDecisionSchema,
    requiresHumanApproval: z.literal(true),
    executable: z.literal(false),
  })
  .strict();
export type AuthorizationSessionGateResult = z.infer<typeof authorizationSessionGateResultSchema>;

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
