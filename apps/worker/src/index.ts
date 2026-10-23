import {
  DeterministicIntentInterpreter,
  DeterministicTextAnalyzer,
  FallbackTextAnalyzer,
  GeminiVisualAnalyzer,
  ScoutAgent,
  selectVisualCheckupImages,
  type AgentTool,
  GeminiTextAnalyzer,
  OpenAiCompatibleTextAnalyzer,
  MockTextAnalyzer,
  TextAnalysisBatchTaskProcessor,
  TextAnalysisTaskProcessor,
} from '@scout/ai';
import { SCOUT_SYSTEM_NAME } from '@scout/config';
import {
  CollectionTaskProcessor,
  createCollectionTask,
  DefaultCollectionGateway,
  GenericListingMapper,
  HttpScrapingProvider,
  ListingIngestionService,
  SourceCollectionGatewayRegistry,
  type CollectionLimits,
} from '@scout/collection';
import { SupabaseRestCollectionRunRepository } from '@scout/database/collection';
import { SupabaseRestListingIngestionRepository } from '@scout/database/ingestion';
import { listingReferenceSegment, SupabaseRestListingRepository } from '@scout/database/listings';
import { SupabaseRestObservationEventRepository } from '@scout/database/observation-events';
import { SupabaseRestResearchProjectRepository } from '@scout/database/supabase';
import { SupabaseRestTextAnalysisRunRepository } from '@scout/database/text-analysis';
import { SupabaseRestUserListingActionRepository } from '@scout/database/user-actions';
import { SupabaseRestOpportunityValuationRepository } from '@scout/database/valuation';
import { SupabaseRestTriageDecisionRepository } from '@scout/database/triage';
import { SupabaseRestSearchQueryFamilyRepository } from '@scout/database/search-intelligence';
import {
  EbayApiAdapter,
  EBAY_CONNECTOR_MANIFEST,
  EbayListingMapper,
  KvEbayRateLimiter,
  MockEbayConnector,
  UnavailableEbayConnector,
  isEbayMarketplaceId,
  sharedEbayTokenCache,
  type EbayRateLimiter,
  type EbayRequestTelemetryEvent,
} from '@scout/ebay-connector';
import {
  MercadoLivreApiAdapter,
  UnavailableMercadoLivreConnector,
  type MercadoLivreTokenState,
} from '@scout/ml-connector';
import {
  CheapListingFilter,
  CollectionQueryFamilyProvider,
  CollectionTriageService,
} from '@scout/search-intelligence';
import { UnavailableXianyuConnector } from '@scout/xianyu-connector';
import { CollectionOpportunityValuationProcessor } from '@scout/valuation';
import {
  calculateMarketMetrics,
  calculateListingScore,
  calculateReferenceDiscount,
  REFERENCE_POLICY_V1,
  sliceListingFeed,
} from '@scout/domain';
import {
  authenticatedUserSchema,
  crossSourceIdentityCandidateReviewRequestSchema,
  type InterpretIntentResult,
  type ListingTransport,
  createResearchProjectRequestSchema,
  interpretIntentInputSchema,
  projectIdSchema,
  idempotencyKeySchema,
  listingTriageReviewRequestSchema,
  agentChatRequestSchema,
  agentChatResponseSchema,
  collectionRunRequestSchema,
  inventoryQuerySchema,
  visualAnalysisScheduleResultSchema,
  visualAnalysisTaskSchema,
  listingFeedPageSchema,
  listingUserActionUpdateSchema,
  textAnalysisScheduleResultSchema,
  listingFeedQuerySchema,
  marketMetricsInputSchema,
  marketMetricsTransportSchema,
  priceHistoryTransportSchema,
  searchTermObservationReviewRequestSchema,
  textAnalysisBatchTaskSchema,
  textAnalysisTaskSchema,
  updateResearchProjectRequestSchema,
} from '@scout/schemas';
import { Env } from './env';
import { R2RawListingObjectStore } from './R2RawListingObjectStore';
import {
  EBAY_ACCOUNT_DELETION_PATH,
  handleEbayAccountDeletionWebhook,
} from './EbayAccountDeletionWebhook';
import { processEbayAccountDeletionTask } from './EbayAccountDeletionProcessor';
import { ebayAccountDeletionTaskSchema } from '@scout/schemas';
import { handleManualEbayProbe, MANUAL_EBAY_PROBE_PATH } from './ManualEbayProbe';
import { TextAnalysisQueueScheduler } from './TextAnalysisQueueScheduler';
import { exportListings } from './ListingExport';
import { SWAPPA_BASE_URL, SwappaConnector, SwappaListingMapper } from '@scout/swappa-connector';
import { VisualAnalysisProcessor } from './VisualAnalysisProcessor';
import { SupabaseRestVisualAnalysisRepository } from '@scout/database/visual-analysis';
import { DurableObjectEbayRateLimiter } from './EbayRateLimitDurableObject';
export { EbayRateLimitDurableObject } from './EbayRateLimitDurableObject';

export const configuredTextAnalyzer = (env: Env) => {
  if (env.TEXT_ANALYZER_MODE === 'mock') return new MockTextAnalyzer();
  if (env.TEXT_ANALYZER_MODE === 'gemini')
    return new GeminiTextAnalyzer({
      apiKey: env.GEMINI_API_KEY ?? '',
      model: env.GEMINI_MODEL,
      maxRequests: 1,
    });
  if (env.TEXT_ANALYZER_MODE === 'llm') return configuredLlmChain(env);
  return new DeterministicTextAnalyzer();
};

/**
 * Ordered provider chain from TEXT_ANALYZER_PROVIDERS (e.g. "groq,gemini"). Missing budget or an
 * empty chain fails closed with LLM_CONFIGURATION_MISSING instead of falling back to rules.
 */
const configuredLlmChain = (env: Env) => {
  const maxRequests = Number(env.LLM_MAX_REQUESTS_PER_PROVIDER);
  const budget = Number.isSafeInteger(maxRequests) && maxRequests > 0 ? maxRequests : 0;
  const analyzers = (env.TEXT_ANALYZER_PROVIDERS ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => {
      if (name === 'gemini')
        return new GeminiTextAnalyzer({
          apiKey: env.GEMINI_API_KEY ?? '',
          model: env.GEMINI_MODEL,
          maxRequests: budget,
        });
      if (name === 'groq' || name === 'cerebras' || name === 'openrouter')
        return new OpenAiCompatibleTextAnalyzer({
          provider: name,
          apiKey:
            (name === 'groq'
              ? env.GROQ_API_KEY
              : name === 'cerebras'
                ? env.CEREBRAS_API_KEY
                : env.OPENROUTER_API_KEY) ?? '',
          model:
            name === 'groq'
              ? env.GROQ_MODEL
              : name === 'cerebras'
                ? env.CEREBRAS_MODEL
                : env.OPENROUTER_MODEL,
          maxRequests: budget,
        });
      return null;
    })
    .filter(
      (analyzer): analyzer is GeminiTextAnalyzer | OpenAiCompatibleTextAnalyzer =>
        analyzer !== null,
    );
  return new FallbackTextAnalyzer(analyzers);
};

const sharedMercadoLivreTokenState: MercadoLivreTokenState = {};

type EbayRequestTelemetryLogger = (event: EbayRequestTelemetryEvent) => void;

export const configuredEbayConnector = (env: Env, onRequest?: EbayRequestTelemetryLogger) => {
  const mode = env.EBAY_CONNECTOR_MODE ?? 'mock';
  if (mode === 'mock') return new MockEbayConnector();
  if (mode !== 'sandbox' && mode !== 'production') {
    return new UnavailableEbayConnector('sandbox', 'EBAY_CONFIGURATION_INVALID');
  }
  if (!env.EBAY_APP_ID_CLIENT_ID || !env.EBAY_CERT_ID_CLIENT_SECRET) {
    return new UnavailableEbayConnector(mode);
  }
  const marketplaceId = env.EBAY_MARKETPLACE_ID ?? 'EBAY_US';
  if (!isEbayMarketplaceId(marketplaceId)) {
    return new UnavailableEbayConnector(mode, 'EBAY_CONFIGURATION_INVALID');
  }
  const requestsPerMinute = Number(env.EBAY_GLOBAL_REQUESTS_PER_MINUTE);
  if (
    mode === 'production' &&
    (!env.EBAY_RATE_LIMITER || !Number.isSafeInteger(requestsPerMinute) || requestsPerMinute < 1)
  ) {
    return new UnavailableEbayConnector(mode, 'EBAY_RATE_LIMIT_CONFIGURATION_MISSING');
  }
  // Orçamento de chamadas Browse por execução. Sem literal de fallback: em
  // production a ausência falha fechado, igual à política de rate limit.
  const maxBrowseRequests = Number(env.EBAY_BROWSE_BUDGET_PER_RUN);
  if (!Number.isSafeInteger(maxBrowseRequests) || maxBrowseRequests < 1) {
    return new UnavailableEbayConnector(mode, 'EBAY_BROWSE_BUDGET_CONFIGURATION_MISSING');
  }
  const rateLimiter =
    mode === 'production' && env.EBAY_RATE_LIMITER
      ? new DurableObjectEbayRateLimiter(env.EBAY_RATE_LIMITER, {
          key: `scout:ebay:rate:v2:${mode}:${marketplaceId}`,
          maxRequests: requestsPerMinute,
          windowSeconds: 60,
        })
      : env.SCOUT_CACHE && Number.isSafeInteger(requestsPerMinute) && requestsPerMinute > 0
        ? new KvEbayRateLimiter(env.SCOUT_CACHE, {
            maxRequests: requestsPerMinute,
            windowSeconds: 60,
            keyPrefix: `scout:ebay:rate:v1:${mode}:${marketplaceId}`,
          })
        : undefined;
  return new EbayApiAdapter(
    {
      environment: mode,
      clientId: env.EBAY_APP_ID_CLIENT_ID,
      clientSecret: env.EBAY_CERT_ID_CLIENT_SECRET,
      marketplaceId,
      maxBrowseRequests,
    },
    {
      tokenCache: sharedEbayTokenCache,
      onRequest,
      rateLimiter: withEbayRateLimitTelemetry(rateLimiter, onRequest, maxBrowseRequests),
    },
  );
};

const logEbayRequestTelemetry: EbayRequestTelemetryLogger = (event) => {
  console.log('eBay Browse telemetry', {
    operation: event.operation,
    attempt: event.attempt,
    requestNumber: event.requestNumber,
    maxRequests: event.maxRequests,
    outcome: event.outcome,
    ...(event.status === undefined ? {} : { status: event.status }),
    ...(event.errorCode === undefined ? {} : { errorCode: event.errorCode }),
    ...(event.operation === 'search'
      ? { total: event.total, nextPresent: event.nextPresent, q: event.q }
      : {}),
  });
};

const withEbayRateLimitTelemetry = (
  rateLimiter: EbayRateLimiter | undefined,
  onRequest: EbayRequestTelemetryLogger | undefined,
  maxRequests: number,
): EbayRateLimiter | undefined => {
  if (!rateLimiter || !onRequest) return rateLimiter;
  let requestsUsed = 0;
  return {
    async acquire(input) {
      try {
        await rateLimiter.acquire(input);
        requestsUsed += 1;
      } catch (error) {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'EBAY_GLOBAL_RATE_LIMITED'
        ) {
          try {
            onRequest({
              operation: input.operation,
              attempt: 1,
              requestNumber: requestsUsed,
              maxRequests,
              observedAt: Date.now(),
              outcome: 'error',
              errorCode: 'EBAY_GLOBAL_RATE_LIMITED',
            });
          } catch {
            // Observability must never change connector behavior.
          }
        }
        throw error;
      }
    },
  };
};

export const configuredMercadoLivreConnector = (env: Env) => {
  const hasAccessToken = Boolean(env.ML_ACCESS_TOKEN?.trim());
  const hasRefreshCredentials = Boolean(
    env.ML_CLIENT_ID?.trim() && env.ML_CLIENT_SECRET?.trim() && env.ML_REFRESH_TOKEN?.trim(),
  );
  if (env.ML_CONNECTOR_MODE !== 'production' || (!hasAccessToken && !hasRefreshCredentials))
    return new UnavailableMercadoLivreConnector();
  return new MercadoLivreApiAdapter({
    accessToken: env.ML_ACCESS_TOKEN,
    tokenState: sharedMercadoLivreTokenState,
    oauth: hasRefreshCredentials
      ? {
          clientId: env.ML_CLIENT_ID!,
          clientSecret: env.ML_CLIENT_SECRET!,
          refreshToken: env.ML_REFRESH_TOKEN!,
        }
      : undefined,
  });
};

const SOURCE_IDS = {
  ebay: '00000000-0000-4000-a000-000000000001',
  mercadolivre: '00000000-0000-4000-a000-000000000002',
  xianyu: '00000000-0000-4000-a000-000000000003',
  swappa: '00000000-0000-4000-a000-000000000004',
} as const;

/** Swappa (layer 4). Live mode is refused by the connector while its live policy says no. */
export const configuredSwappaConnector = (env: Env) => {
  const mode =
    env.SWAPPA_MODE === 'fixture' || env.SWAPPA_MODE === 'live' ? env.SWAPPA_MODE : 'disabled';
  const interval = Number(env.HTML_MIN_INTERVAL_MS);
  return new SwappaConnector(
    new HttpScrapingProvider({
      minIntervalMs: Number.isSafeInteger(interval) && interval >= 0 ? interval : 5_000,
    }),
    mode,
    env.SWAPPA_BASE_URL ?? SWAPPA_BASE_URL,
  );
};

// Uma varredura gasta 1 chamada de busca por página mais 1 de detalhe por
// anúncio. O orçamento por execução é o teto de tudo; o resto sai dele.
const requestCountForCollection = (items: number, queryCount: number, pageSize: number) => {
  let remaining = items;
  let searchRequests = 0;
  for (let index = 0; index < queryCount && remaining > 0; index += 1) {
    const queriesRemaining = queryCount - index;
    const perQuery = Math.max(1, Math.ceil(remaining / queriesRemaining));
    searchRequests += Math.ceil(perQuery / pageSize);
    remaining -= perQuery;
  }
  return items + searchRequests;
};

const maxItemsForBrowseBudget = (
  budget: number,
  maxItems: number,
  pageSize: number,
  maxQueries: number,
) => {
  for (let items = Math.min(maxItems, budget - 1); items >= 1; items -= 1) {
    const singleQueryRequests = requestCountForCollection(items, 1, pageSize);
    const familyRequests = requestCountForCollection(items, maxQueries, pageSize);
    if (Math.max(singleQueryRequests, familyRequests) <= budget) return items;
  }
  return 1;
};

export const ebayCollectionLimits = (env: Env): CollectionLimits | undefined => {
  const budget = Number(env.EBAY_BROWSE_BUDGET_PER_RUN);
  if (!Number.isSafeInteger(budget) || budget < 2) return undefined;
  const manifestLimits = EBAY_CONNECTOR_MANIFEST.limits;
  const maxQueries = Math.min(3, budget - 1);
  const maxItems = maxItemsForBrowseBudget(
    budget,
    manifestLimits.maxItems,
    manifestLimits.pageSize,
    maxQueries,
  );
  const maxPages = Math.max(
    1,
    Math.min(manifestLimits.maxPages, Math.ceil(maxItems / manifestLimits.pageSize)),
  );
  return {
    maxPages,
    pageSize: manifestLimits.pageSize,
    maxItems,
    maxQueries,
  };
};

const configuredCollectionGateways = (env: Env, onEbayRequest?: EbayRequestTelemetryLogger) =>
  new SourceCollectionGatewayRegistry([
    [
      SOURCE_IDS.ebay,
      new DefaultCollectionGateway(
        configuredEbayConnector(env, onEbayRequest),
        // O conector trata modo ausente como mock; os limites precisam concordar,
        // ou modo indefinido pega conector mock com teto de produção.
        (env.EBAY_CONNECTOR_MODE ?? 'mock') === 'mock' ? undefined : ebayCollectionLimits(env),
      ),
    ],
    [SOURCE_IDS.mercadolivre, new DefaultCollectionGateway(configuredMercadoLivreConnector(env))],
    [SOURCE_IDS.xianyu, new DefaultCollectionGateway(new UnavailableXianyuConnector())],
    [SOURCE_IDS.swappa, new DefaultCollectionGateway(configuredSwappaConnector(env))],
  ]);

const interpretationMetadata = (result: InterpretIntentResult) => ({
  confidence: result.confidence,
  ambiguities: result.ambiguities,
  warnings: result.warnings,
  unidentifiedFields: result.unidentifiedFields,
  provider: result.provider,
  model: result.model,
  promptOrRuleVersion: result.promptOrRuleVersion,
  taxonomyVersion: result.taxonomyVersion,
  interpretedAt: result.interpretedAt,
});

const json = (body: unknown, status = 200, origin = '*'): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      Vary: 'Origin',
    },
  });

async function authenticate(request: Request, env: Env) {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) throw new HttpError(401, 'Authentication required.');
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authorization },
  });
  if (!response.ok) throw new HttpError(401, 'Invalid or expired session.');
  const user = authenticatedUserSchema.parse(await response.json());
  const profileResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?on_conflict=id`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: authorization,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ id: user.id, email: user.email }),
  });
  if (!profileResponse.ok)
    throw new HttpError(502, 'Could not initialize the authenticated profile.');
  return { user, accessToken: authorization.slice('Bearer '.length) };
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function parseBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
}

async function enrichedListings(
  repositories: {
    listings: SupabaseRestListingRepository;
    analyses: SupabaseRestTextAnalysisRunRepository;
    actions: SupabaseRestUserListingActionRepository;
  },
  userId: string,
  source: { projectId: string } | { inventory: true },
  asOf: Date,
) {
  const listings =
    'projectId' in source
      ? await repositories.listings.findByProjectId(source.projectId)
      : await repositories.listings.findInventoryByUserId(userId);
  const ids = listings.map(({ id }) => id);
  const [observations, analyses, actions] = await Promise.all([
    repositories.listings.getTaggedMarketObservations(
      listings,
      REFERENCE_POLICY_V1.windowDays,
      asOf,
    ),
    repositories.analyses.findLatestSummariesByListingIds(ids),
    repositories.actions.findByListingIds(userId, ids),
  ]);
  return listings.map((listing) => {
    const referenceDiscount = calculateReferenceDiscount(
      { id: listing.id, landedCost: listing.landedCost, segment: listingReferenceSegment(listing) },
      observations,
      REFERENCE_POLICY_V1,
      asOf,
    );
    return {
      ...listing,
      referenceDiscount,
      userAction: actions.get(listing.id) ?? null,
      score: calculateListingScore({
        title: listing.title,
        description: listing.description,
        condition: listing.condition,
        brand: listing.inferredProduct?.brand,
        referenceDiscount,
        analysis: analyses.get(listing.id) ?? null,
        lastObservedAt: listing.lastUpdatedAt,
        asOf,
      }),
    };
  });
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  const { user, accessToken } = await authenticate(request, env);
  const repository = new SupabaseRestResearchProjectRepository({
    baseUrl: env.SUPABASE_URL,
    anonKey: env.SUPABASE_ANON_KEY,
    accessToken,
  });
  const collectionRepository = new SupabaseRestCollectionRunRepository({
    baseUrl: env.SUPABASE_URL,
    anonKey: env.SUPABASE_ANON_KEY,
    accessToken,
  });
  const valuationRepository = new SupabaseRestOpportunityValuationRepository({
    baseUrl: env.SUPABASE_URL,
    anonKey: env.SUPABASE_ANON_KEY,
    accessToken,
  });
  const listingRepository = new SupabaseRestListingRepository({
    baseUrl: env.SUPABASE_URL,
    anonKey: env.SUPABASE_ANON_KEY,
    accessToken,
  });
  const observationRepository = new SupabaseRestSearchQueryFamilyRepository({
    baseUrl: env.SUPABASE_URL,
    anonKey: env.SUPABASE_ANON_KEY,
    accessToken,
  });
  const triageRepository = new SupabaseRestTriageDecisionRepository({
    baseUrl: env.SUPABASE_URL,
    anonKey: env.SUPABASE_ANON_KEY,
    accessToken,
  });
  const analysisReadRepository = new SupabaseRestTextAnalysisRunRepository({
    baseUrl: env.SUPABASE_URL,
    anonKey: env.SUPABASE_ANON_KEY,
    accessToken,
  });
  const enrichRepositories = {
    listings: listingRepository,
    analyses: analysisReadRepository,
    actions: new SupabaseRestUserListingActionRepository({
      baseUrl: env.SUPABASE_URL,
      anonKey: env.SUPABASE_ANON_KEY,
      accessToken,
    }),
  };
  const actionMatch = url.pathname.match(/^\/api\/listings\/([^/]+)\/actions$/);
  if (actionMatch) {
    if (request.method !== 'PUT') throw new HttpError(405, 'Method not allowed.');
    const listingId = projectIdSchema.parse(actionMatch[1]);
    const update = listingUserActionUpdateSchema.parse(await parseBody(request));
    try {
      return json(
        await enrichRepositories.actions.upsert(user.id, listingId, update),
        200,
        env.WEB_ORIGIN,
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes('not allowed'))
        throw new HttpError(404, 'Listing not found in your projects.');
      throw error;
    }
  }
  if (url.pathname === '/api/inventory') {
    if (request.method !== 'GET') throw new HttpError(405, 'Method not allowed.');
    const query = inventoryQuerySchema.parse(Object.fromEntries(url.searchParams));
    const asOf = new Date();
    const listings = await enrichedListings(enrichRepositories, user.id, { inventory: true }, asOf);
    const since = query.sinceDays ? asOf.getTime() - query.sinceDays * 86_400_000 : null;
    const items = listings
      .filter((listing) => !query.favorite || listing.userAction?.favorite)
      .filter((listing) => !query.label || listing.userAction?.label === query.label)
      .filter((listing) => !query.status || listing.status === query.status)
      .filter((listing) => !query.sourceId || listing.sourceId === query.sourceId)
      .filter((listing) => since === null || listing.firstCollectedAt.getTime() >= since)
      .filter((listing) => {
        const price = listing.landedCost?.components.itemPrice.amountMinor ?? null;
        if (query.minPriceMinor !== undefined && (price === null || price < query.minPriceMinor))
          return false;
        if (query.maxPriceMinor !== undefined && (price === null || price > query.maxPriceMinor))
          return false;
        return true;
      })
      .sort((left, right) => right.firstCollectedAt.getTime() - left.firstCollectedAt.getTime());
    return json(
      { total: listings.length, matched: items.length, items: items.slice(0, query.limit) },
      200,
      env.WEB_ORIGIN,
    );
  }
  if (url.pathname === '/api/sources') {
    if (request.method !== 'GET') throw new HttpError(405, 'Method not allowed.');
    const swappa = configuredSwappaConnector(env);
    return json(
      [
        {
          id: SOURCE_IDS.ebay,
          name: 'eBay',
          layer: 1,
          mode: env.EBAY_CONNECTOR_MODE ?? 'mock',
          livePolicy: null,
        },
        {
          id: SOURCE_IDS.swappa,
          name: 'Swappa',
          layer: swappa.manifest.primaryLayer,
          mode: env.SWAPPA_MODE ?? 'disabled',
          livePolicy: swappa.manifest.livePolicy ?? null,
        },
      ],
      200,
      env.WEB_ORIGIN,
    );
  }
  if (url.pathname === '/api/intent/interpret' && request.method === 'POST') {
    const input = interpretIntentInputSchema.parse(await parseBody(request));
    return json(await new DeterministicIntentInterpreter().interpret(input), 200, env.WEB_ORIGIN);
  }
  if (url.pathname === '/api/projects') {
    if (request.method === 'GET')
      return json(await repository.findByUserId(user.id), 200, env.WEB_ORIGIN);
    if (request.method === 'POST') {
      const raw = await parseBody(request);
      const input = createResearchProjectRequestSchema.parse(raw);
      const interpretation = interpretationMetadata(
        await new DeterministicIntentInterpreter().interpret({ query: input.naturalLanguageQuery }),
      );
      return json(
        await repository.create(user.id, { ...input, interpretation }),
        201,
        env.WEB_ORIGIN,
      );
    }
  }
  const valuationMatch = url.pathname.match(
    /^\/api\/projects\/([^/]+)\/listings\/([^/]+)\/valuation$/,
  );
  if (valuationMatch) {
    if (request.method !== 'GET') throw new HttpError(405, 'Method not allowed.');
    const projectId = projectIdSchema.parse(valuationMatch[1]);
    const listingId = projectIdSchema.parse(valuationMatch[2]);
    const project = await repository.findById(projectId, user.id);
    if (!project) throw new HttpError(404, 'Project not found.');
    if (!(await valuationRepository.isListingInProject(listingId, projectId)))
      throw new HttpError(404, 'Listing not found in project.');
    const valuation = await valuationRepository.findLatestByListingId(listingId);
    if (!valuation) throw new HttpError(404, 'Opportunity valuation not found.');
    return json(valuation, 200, env.WEB_ORIGIN);
  }
  const listingsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/listings$/);
  if (listingsMatch) {
    if (request.method !== 'GET') throw new HttpError(405, 'Method not allowed.');
    const projectId = projectIdSchema.parse(listingsMatch[1]);
    const project = await repository.findById(projectId, user.id);
    if (!project) throw new HttpError(404, 'Project not found.');
    return json(
      await enrichedListings(enrichRepositories, user.id, { projectId }, new Date()),
      200,
      env.WEB_ORIGIN,
    );
  }
  const feedMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/feed$/);
  if (feedMatch) {
    if (request.method !== 'GET') throw new HttpError(405, 'Method not allowed.');
    const projectId = projectIdSchema.parse(feedMatch[1]);
    const project = await repository.findById(projectId, user.id);
    if (!project) throw new HttpError(404, 'Project not found.');
    const query = listingFeedQuerySchema.parse(Object.fromEntries(url.searchParams));
    const snapshot = query.snapshot ?? new Date();
    const [listings, runs] = await Promise.all([
      enrichedListings(enrichRepositories, user.id, { projectId }, snapshot),
      collectionRepository.findLatestRunsByProjectId(projectId),
    ]);
    const slice = sliceListingFeed(listings, { ...query, snapshot, lens: query });
    return json(
      listingFeedPageSchema.parse({
        snapshot,
        group: query.group,
        sort: query.sort,
        offset: query.offset,
        limit: query.limit,
        ...slice,
        sources: runs.map((run) => ({
          sourceId: run.sourceId,
          runId: run.id,
          state:
            run.status === 'failed'
              ? 'failed'
              : run.status === 'completed'
                ? run.truncated
                  ? 'truncated'
                  : 'completed'
                : 'collecting',
          reason: run.status === 'failed' ? (run.errorCode ?? run.error ?? 'unknown') : null,
        })),
      }),
      200,
      env.WEB_ORIGIN,
    );
  }
  if (url.pathname === '/api/agent/chat') {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
    const input = agentChatRequestSchema.parse(await parseBody(request));
    const internal = (path: string, init: RequestInit = {}) =>
      handleApi(
        new Request(new URL(path, url).toString(), {
          ...init,
          headers: {
            Authorization: request.headers.get('Authorization') ?? '',
            'Content-Type': 'application/json',
            ...(init.headers ?? {}),
          },
        }),
        env,
        new URL(path, url),
      ).then(async (response) => ({ status: response.status, body: await response.json() }));
    const ownedProject = async (projectId: unknown) => {
      const id = projectIdSchema.parse(projectId ?? input.projectId);
      if (!(await repository.findById(id, user.id))) throw new HttpError(404, 'Project not found.');
      return id;
    };
    const spendTools: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
      disparar_coleta: async (args) =>
        internal(`/api/projects/${await ownedProject(args.projectId)}/collection-runs`, {
          method: 'POST',
          headers: { 'Idempotency-Key': `agent-${crypto.randomUUID()}` },
        }),
      analisar_texto: async (args) =>
        internal(`/api/projects/${await ownedProject(args.projectId)}/analysis`, {
          method: 'POST',
        }),
      marcar: async (args) =>
        internal(`/api/listings/${projectIdSchema.parse(args.listingId)}/actions`, {
          method: 'PUT',
          body: JSON.stringify(
            args.favorite !== undefined
              ? { favorite: Boolean(args.favorite) }
              : { label: args.label ?? null },
          ),
        }),
    };
    if (input.confirm) {
      const execute = spendTools[input.confirm.tool];
      if (!execute) throw new HttpError(400, 'Unknown confirmable tool.');
      const result = await execute(input.confirm.args);
      return json(
        agentChatResponseSchema.parse({
          reply: `Confirmado: ${input.confirm.tool} executado.`,
          toolCalls: [{ name: input.confirm.tool, args: input.confirm.args }],
          citations: [],
          appliedFilters: [],
          pendingConfirmation: null,
          uncitedIds: [],
          provider: 'user-confirmation',
          model: 'none',
          executed: result,
        }),
        200,
        env.WEB_ORIGIN,
      );
    }
    const compact = (listing: ListingTransport) => ({
      id: listing.id,
      title: listing.title,
      condition: listing.condition,
      landedCostMinor:
        listing.landedCost?.status === 'known' ? listing.landedCost.totalMinor : null,
      currency: listing.currency,
      // Positive = cheaper than the segment's asking-price median; negative = more expensive.
      percentBelowReferenceMedian:
        listing.referenceDiscount?.status === 'known'
          ? listing.referenceDiscount.discountBasisPoints / 100
          : null,
      refusal:
        listing.referenceDiscount?.status === 'NAO_RANQUEAVEL'
          ? listing.referenceDiscount.reasons
          : null,
      score: listing.score?.value ?? null,
      scoreStatus: listing.score?.status ?? null,
      label: listing.userAction?.label ?? null,
      heart: listing.userAction?.favorite ?? false,
    });
    const searchParameters = {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'id da pesquisa; omita para a pesquisa aberta' },
        group: {
          type: 'string',
          enum: ['rankable', 'unbacked'],
          description: 'rankable = com distância da referência; unbacked = sem lastro',
        },
        sort: { type: 'string', enum: ['score', 'discount', 'totalCost', 'price', 'newest'] },
        q: {
          type: 'string',
          description:
            'texto que deve aparecer no título ou na descrição, ex.: "iPhone 13", "bateria"',
        },
        condition: {
          type: 'string',
          description: 'condição exata como listada em agregados, ex.: "Used"',
        },
        minScore: { type: 'integer', minimum: 0, maximum: 100 },
        maxTotalCostMinor: { type: 'integer', description: 'custo total máximo em centavos' },
        label: { type: 'string', enum: ['shortlisted', 'monitored', 'discarded', 'none'] },
        favorite: { type: 'boolean' },
        limit: { type: 'integer', minimum: 1, maximum: 20 },
      },
    };
    const tools: AgentTool[] = [
      {
        name: 'ver_pesquisas',
        description: 'Lista as pesquisas do usuário (id, nome, status).',
        parameters: { type: 'object', properties: {} },
        requiresConfirmation: false,
        run: async () => ({
          data: (await repository.findByUserId(user.id)).map((project) => ({
            id: project.id,
            name: project.name,
            status: project.status,
          })),
        }),
      },
      {
        name: 'agregados',
        description:
          'Visão geral de uma pesquisa: totais por grupo, condições existentes, motivos de recusa, faixa de score.',
        parameters: { type: 'object', properties: { projectId: { type: 'string' } } },
        requiresConfirmation: false,
        run: async (args) => {
          const projectId = await ownedProject(args.projectId);
          const listings = await enrichedListings(
            enrichRepositories,
            user.id,
            { projectId },
            new Date(),
          );
          const count = (values: string[]) =>
            values.reduce<Record<string, number>>(
              (acc, value) => ({ ...acc, [value]: (acc[value] ?? 0) + 1 }),
              {},
            );
          const scores = listings.flatMap((listing) =>
            listing.score?.value != null ? [listing.score.value] : [],
          );
          return {
            data: {
              total: listings.length,
              rankable: listings.filter((listing) => listing.referenceDiscount?.status === 'known')
                .length,
              conditions: count(listings.map((listing) => listing.condition)),
              refusalReasons: count(
                listings.flatMap((listing) =>
                  listing.referenceDiscount?.status === 'NAO_RANQUEAVEL'
                    ? listing.referenceDiscount.reasons
                    : [],
                ),
              ),
              scored: scores.length,
              scoreRange: scores.length ? [Math.min(...scores), Math.max(...scores)] : null,
            },
          };
        },
      },
      {
        name: 'buscar_resultados',
        description:
          'Busca anúncios por filtro estruturado na pesquisa. Devolve o total que casou e até 20 itens.',
        parameters: searchParameters,
        requiresConfirmation: false,
        run: async (args) => {
          const projectId = await ownedProject(args.projectId);
          const filter = listingFeedQuerySchema.parse({
            group: args.group ?? 'rankable',
            sort: args.sort ?? 'score',
            limit: Math.min(Number(args.limit ?? 10), 20),
            ...(args.q ? { q: String(args.q) } : {}),
            ...(args.condition ? { condition: String(args.condition) } : {}),
            ...(args.minScore !== undefined ? { minScore: args.minScore } : {}),
            ...(args.maxTotalCostMinor !== undefined
              ? { maxTotalCostMinor: args.maxTotalCostMinor }
              : {}),
            ...(args.label ? { label: args.label } : {}),
            ...(args.favorite ? { favorite: 'true' } : {}),
          });
          const snapshot = new Date();
          const listings = await enrichedListings(
            enrichRepositories,
            user.id,
            { projectId },
            snapshot,
          );
          const slice = sliceListingFeed(listings, { ...filter, snapshot, lens: filter });
          const matched =
            filter.group === 'rankable' ? slice.totals.rankable : slice.totals.unbacked;
          return {
            data: {
              matched,
              showing: slice.items.length,
              filteredOut: slice.filteredOut,
              items: slice.items.map(compact),
            },
            listingIds: slice.items.map(({ id }) => id),
            appliedFilter: { projectId, ...filter },
          };
        },
      },
      {
        name: 'ver_anuncio',
        description:
          'Detalhe de um anúncio: custo, distância da referência, fatores do score e defeitos extraídos do texto.',
        parameters: {
          type: 'object',
          properties: { listingId: { type: 'string' }, projectId: { type: 'string' } },
          required: ['listingId'],
        },
        requiresConfirmation: false,
        run: async (args) => {
          const projectId = await ownedProject(args.projectId);
          const listingId = projectIdSchema.parse(args.listingId);
          const listing = (
            await enrichedListings(enrichRepositories, user.id, { projectId }, new Date())
          ).find(({ id }) => id === listingId);
          if (!listing) throw new HttpError(404, 'Listing not found in project.');
          const analysis = await analysisReadRepository.findLatestByListingId(listingId);
          return {
            data: {
              ...compact(listing),
              landedCost: listing.landedCost,
              scoreFactors: listing.score?.factors ?? [],
              defects: analysis.defects.map(({ defectType, status, severity }) => ({
                defectType,
                status,
                severity,
              })),
            },
            listingIds: [listingId],
          };
        },
      },
      {
        name: 'saude_das_fontes',
        description: 'Estado da última coleta por fonte na pesquisa.',
        parameters: { type: 'object', properties: { projectId: { type: 'string' } } },
        requiresConfirmation: false,
        run: async (args) => ({
          data: (
            await collectionRepository.findLatestRunsByProjectId(await ownedProject(args.projectId))
          ).map((run) => ({
            sourceId: run.sourceId,
            status: run.status,
            itemsFound: run.itemsFound,
            errorCode: run.errorCode ?? null,
          })),
        }),
      },
      {
        name: 'disparar_coleta',
        description: 'Prepara uma nova coleta da pesquisa. Exige confirmação do usuário.',
        parameters: { type: 'object', properties: { projectId: { type: 'string' } } },
        requiresConfirmation: true,
        run: async () => ({
          data: {
            estimate: `até ${env.EBAY_BROWSE_BUDGET_PER_RUN ?? '?'} chamadas à API oficial do eBay; custo monetário US$ 0`,
          },
        }),
      },
      {
        name: 'analisar_texto',
        description:
          'Prepara a análise de texto por IA dos anúncios da pesquisa. Exige confirmação do usuário.',
        parameters: { type: 'object', properties: { projectId: { type: 'string' } } },
        requiresConfirmation: true,
        run: async () => ({
          data: {
            estimate: `1 chamada de LLM a cada 20 anúncios ainda não analisados, cadeia ${env.TEXT_ANALYZER_PROVIDERS ?? 'não configurada'}`,
          },
        }),
      },
      {
        name: 'marcar',
        description:
          'Prepara marcar um anúncio (shortlisted, monitored, discarded) ou coração. Exige confirmação.',
        parameters: {
          type: 'object',
          properties: {
            listingId: { type: 'string' },
            label: { type: 'string', enum: ['shortlisted', 'monitored', 'discarded'] },
            favorite: { type: 'boolean' },
          },
          required: ['listingId'],
        },
        requiresConfirmation: true,
        run: async () => ({ data: { estimate: 'grava uma etiqueta; sem custo' } }),
      },
    ];
    const agent = new ScoutAgent([
      { provider: 'groq', apiKey: env.GROQ_API_KEY ?? '', model: env.GROQ_MODEL },
      { provider: 'openrouter', apiKey: env.OPENROUTER_API_KEY ?? '', model: env.OPENROUTER_MODEL },
    ]);
    const context = input.projectId
      ? [{ role: 'user' as const, content: `Contexto: a pesquisa aberta é ${input.projectId}.` }]
      : [];
    return json(
      agentChatResponseSchema.parse(await agent.run([...context, ...input.messages], tools)),
      200,
      env.WEB_ORIGIN,
    );
  }
  const exportMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/export$/);
  if (exportMatch) {
    if (request.method !== 'GET') throw new HttpError(405, 'Method not allowed.');
    const projectId = projectIdSchema.parse(exportMatch[1]);
    const project = await repository.findById(projectId, user.id);
    if (!project) throw new HttpError(404, 'Project not found.');
    const params = Object.fromEntries(url.searchParams);
    const format = params.format === 'xlsx' ? 'xlsx' : params.format === 'csv' ? 'csv' : null;
    if (!format) throw new HttpError(400, 'format must be csv or xlsx.');
    delete params.format;
    const query = listingFeedQuerySchema.parse(params);
    const snapshot = query.snapshot ?? new Date();
    const listings = await enrichedListings(enrichRepositories, user.id, { projectId }, snapshot);
    // The export is the current selection: both groups under the same lens and order.
    const options = { sort: query.sort, snapshot, offset: 0, limit: 100_000, lens: query };
    const selection = [
      ...sliceListingFeed(listings, { ...options, group: 'rankable' }).items,
      ...sliceListingFeed(listings, { ...options, group: 'unbacked' }).items,
    ];
    const file = exportListings(selection, format);
    return new Response(file.body as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': `attachment; filename="${file.filename}"`,
        'Access-Control-Allow-Origin': env.WEB_ORIGIN ?? '*',
        'Access-Control-Expose-Headers': 'Content-Disposition',
      },
    });
  }
  const visualScheduleMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/visual-analysis$/);
  if (visualScheduleMatch) {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
    const projectId = projectIdSchema.parse(visualScheduleMatch[1]);
    if (!(await repository.findById(projectId, user.id)))
      throw new HttpError(404, 'Project not found.');
    const budget = Number(env.VISUAL_ANALYSIS_BUDGET_PER_PROJECT);
    if (!Number.isSafeInteger(budget) || budget < 1)
      throw new HttpError(503, 'Visual analysis budget is not configured.');
    if (!env.ANALYSIS_QUEUE) throw new HttpError(503, 'Analysis queue is not configured.');
    const serviceRuns = new SupabaseRestVisualAnalysisRepository({
      baseUrl: env.SUPABASE_URL,
      anonKey: env.SUPABASE_SERVICE_ROLE_KEY,
      accessToken: env.SUPABASE_SERVICE_ROLE_KEY,
    });
    const listings = await enrichedListings(enrichRepositories, user.id, { projectId }, new Date());
    // Finalists: shortlisted first, then complete scores from best to worst. Unknown scores are
    // not finalists; they are not "worse", they are not ranked.
    const finalists = [
      ...listings.filter((listing) => listing.userAction?.label === 'shortlisted'),
      ...listings
        .filter(
          (listing) =>
            listing.userAction?.label !== 'shortlisted' && listing.score?.status === 'known',
        )
        .sort((left, right) => (right.score?.value ?? 0) - (left.score?.value ?? 0)),
    ].filter((listing) => listing.userAction?.label !== 'discarded');
    const images = await serviceRuns.imagesByListingIds(finalists.map(({ id }) => id));
    const analyzer = new GeminiVisualAnalyzer(
      env.GEMINI_API_KEY ?? '',
      env.GEMINI_VISION_MODEL ?? 'gemini-3.5-flash',
    );
    let queued = 0;
    let alreadyAnalyzed = 0;
    let skippedWithoutImages = 0;
    let considered = 0;
    for (const listing of finalists) {
      if (considered >= budget) break;
      const selected = selectVisualCheckupImages(images.get(listing.id) ?? [], listing.description);
      if (!selected.length) {
        skippedWithoutImages += 1;
        continue;
      }
      considered += 1;
      const { run, created } = await serviceRuns.requestRun({
        listingId: listing.id,
        projectId,
        provider: analyzer.provider,
        model: analyzer.model,
        promptVersion: analyzer.promptVersion,
        imageUrls: selected,
      });
      if (!created) {
        alreadyAnalyzed += 1;
        continue;
      }
      await env.ANALYSIS_QUEUE.send({
        kind: 'visual-analysis',
        version: '1',
        runId: run.id,
      } as never);
      queued += 1;
    }
    return json(
      visualAnalysisScheduleResultSchema.parse({
        budget,
        finalists: finalists.length,
        queued,
        skippedWithoutImages,
        alreadyAnalyzed,
      }),
      202,
      env.WEB_ORIGIN,
    );
  }
  const listingVisualMatch = url.pathname.match(
    /^\/api\/projects\/([^/]+)\/listings\/([^/]+)\/visual-analysis$/,
  );
  if (listingVisualMatch) {
    if (request.method !== 'GET') throw new HttpError(405, 'Method not allowed.');
    const projectId = projectIdSchema.parse(listingVisualMatch[1]);
    const listingId = projectIdSchema.parse(listingVisualMatch[2]);
    if (!(await repository.findById(projectId, user.id)))
      throw new HttpError(404, 'Project not found.');
    if (!(await listingRepository.isListingInProject(listingId, projectId)))
      throw new HttpError(404, 'Listing not found in project.');
    return json(
      await new SupabaseRestVisualAnalysisRepository({
        baseUrl: env.SUPABASE_URL,
        anonKey: env.SUPABASE_ANON_KEY,
        accessToken,
      }).findLatestByListingId(listingId),
      200,
      env.WEB_ORIGIN,
    );
  }
  const analysisScheduleMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/analysis$/);
  if (analysisScheduleMatch) {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
    const projectId = projectIdSchema.parse(analysisScheduleMatch[1]);
    const project = await repository.findById(projectId, user.id);
    if (!project) throw new HttpError(404, 'Project not found.');
    if (!env.ANALYSIS_QUEUE) throw new HttpError(503, 'Analysis queue is not configured.');
    const analyzer = configuredTextAnalyzer(env);
    const listings = await listingRepository.findByProjectId(projectId);
    const listingIds = listings.slice(0, 100).map(({ id }) => id);
    const queued = await new TextAnalysisQueueScheduler(
      new SupabaseRestTextAnalysisRunRepository({
        baseUrl: env.SUPABASE_URL,
        anonKey: env.SUPABASE_SERVICE_ROLE_KEY,
        accessToken: env.SUPABASE_SERVICE_ROLE_KEY,
      }),
      env.ANALYSIS_QUEUE,
      analyzer,
    ).schedule(listingIds);
    return json(
      textAnalysisScheduleResultSchema.parse({
        requested: listingIds.length,
        queued: queued ?? 0,
        provider: analyzer.provider,
        model: analyzer.model,
      }),
      202,
      env.WEB_ORIGIN,
    );
  }
  const listingAnalysisMatch = url.pathname.match(
    /^\/api\/projects\/([^/]+)\/listings\/([^/]+)\/analysis$/,
  );
  if (listingAnalysisMatch) {
    if (request.method !== 'GET') throw new HttpError(405, 'Method not allowed.');
    const projectId = projectIdSchema.parse(listingAnalysisMatch[1]);
    const listingId = projectIdSchema.parse(listingAnalysisMatch[2]);
    const project = await repository.findById(projectId, user.id);
    if (!project) throw new HttpError(404, 'Project not found.');
    if (!(await listingRepository.isListingInProject(listingId, projectId)))
      throw new HttpError(404, 'Listing not found in project.');
    return json(await analysisReadRepository.findLatestByListingId(listingId), 200, env.WEB_ORIGIN);
  }
  const marketMetricsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/market-metrics$/);
  if (marketMetricsMatch) {
    if (request.method !== 'GET') throw new HttpError(405, 'Method not allowed.');
    const projectId = projectIdSchema.parse(marketMetricsMatch[1]);
    const project = await repository.findById(projectId, user.id);
    if (!project) throw new HttpError(404, 'Project not found.');
    const { windowDays, minimumObservations, iqrMultiplier } = REFERENCE_POLICY_V1;
    const asOf = new Date();
    const observations = await listingRepository.getMarketMetricObservationsByProjectId(
      projectId,
      windowDays,
      asOf,
    );
    return json(
      marketMetricsTransportSchema.parse(
        calculateMarketMetrics(
          marketMetricsInputSchema.parse({
            observations,
            windowDays,
            minimumObservations,
            iqrMultiplier,
            asOf,
          }),
        ),
      ),
      200,
      env.WEB_ORIGIN,
    );
  }
  const priceHistoryMatch = url.pathname.match(
    /^\/api\/projects\/([^/]+)\/listings\/([^/]+)\/price-history$/,
  );
  if (priceHistoryMatch) {
    if (request.method !== 'GET') throw new HttpError(405, 'Method not allowed.');
    const projectId = projectIdSchema.parse(priceHistoryMatch[1]);
    const listingId = projectIdSchema.parse(priceHistoryMatch[2]);
    const project = await repository.findById(projectId, user.id);
    if (!project) throw new HttpError(404, 'Project not found.');
    if (!(await listingRepository.isListingInProject(listingId, projectId)))
      throw new HttpError(404, 'Listing not found in project.');
    const history = await listingRepository.getPriceHistory(listingId);
    return json(
      history.map((observation) =>
        priceHistoryTransportSchema.parse({
          ...observation,
          collectedAt: observation.collectedAt.toISOString(),
        }),
      ),
      200,
      env.WEB_ORIGIN,
    );
  }
  const observationMatch = url.pathname.match(
    /^\/api\/projects\/([^/]+)\/search-term-observations(?:\/([^/]+))?$/,
  );
  if (observationMatch) {
    const projectId = projectIdSchema.parse(observationMatch[1]);
    const observationId = observationMatch[2]
      ? projectIdSchema.parse(observationMatch[2])
      : undefined;
    const project = await repository.findById(projectId, user.id);
    if (!project) throw new HttpError(404, 'Project not found.');
    if (request.method === 'GET' && !observationId)
      return json(await observationRepository.findByProjectId(projectId), 200, env.WEB_ORIGIN);
    if (request.method === 'PATCH' && observationId) {
      const input = searchTermObservationReviewRequestSchema.parse(await parseBody(request));
      return json(
        await observationRepository.review({ projectId, observationId, status: input.status }),
        200,
        env.WEB_ORIGIN,
      );
    }
    throw new HttpError(405, 'Method not allowed.');
  }
  const triageMatch = url.pathname.match(
    /^\/api\/projects\/([^/]+)\/triage-(decisions|reviews)(?:\/([^/]+))?$/,
  );
  if (triageMatch) {
    const projectId = projectIdSchema.parse(triageMatch[1]);
    const resource = triageMatch[2];
    const listingId = triageMatch[3] ? projectIdSchema.parse(triageMatch[3]) : undefined;
    const project = await repository.findById(projectId, user.id);
    if (!project) throw new HttpError(404, 'Project not found.');
    if (resource === 'decisions' && request.method === 'GET' && !listingId)
      return json(await triageRepository.findByProjectId(projectId), 200, env.WEB_ORIGIN);
    if (resource === 'reviews' && request.method === 'GET' && !listingId)
      return json(await triageRepository.findReviewsByProjectId(projectId), 200, env.WEB_ORIGIN);
    if (resource === 'reviews' && request.method === 'PATCH' && listingId) {
      const input = listingTriageReviewRequestSchema.parse(await parseBody(request));
      return json(
        await triageRepository.review({ projectId, listingId, status: input.status }),
        200,
        env.WEB_ORIGIN,
      );
    }
    throw new HttpError(405, 'Method not allowed.');
  }
  const identityCandidateMatch = url.pathname.match(
    /^\/api\/projects\/([^/]+)\/cross-source-candidates(?:\/([^/]+))?$/,
  );
  if (identityCandidateMatch) {
    const projectId = projectIdSchema.parse(identityCandidateMatch[1]);
    const candidateId = identityCandidateMatch[2]
      ? projectIdSchema.parse(identityCandidateMatch[2])
      : undefined;
    const project = await repository.findById(projectId, user.id);
    if (!project) throw new HttpError(404, 'Project not found.');
    if (request.method === 'GET' && !candidateId)
      return json(await triageRepository.findCandidatesByProjectId(projectId), 200, env.WEB_ORIGIN);
    if (request.method === 'PATCH' && candidateId) {
      const input = crossSourceIdentityCandidateReviewRequestSchema.parse(await parseBody(request));
      return json(
        await triageRepository.reviewCandidate({ projectId, candidateId, status: input.status }),
        200,
        env.WEB_ORIGIN,
      );
    }
    throw new HttpError(405, 'Method not allowed.');
  }
  const collectionMatch = url.pathname.match(
    /^\/api\/projects\/([^/]+)\/collection-runs(?:\/([^/]+))?$/,
  );
  if (collectionMatch) {
    const projectId = projectIdSchema.parse(collectionMatch[1]);
    const runId = collectionMatch[2] ? projectIdSchema.parse(collectionMatch[2]) : undefined;
    if (request.method === 'GET' && runId) {
      const run = await collectionRepository.findById(runId, projectId);
      if (!run) throw new HttpError(404, 'Collection run not found.');
      return json(run, 200, env.WEB_ORIGIN);
    }
    if (request.method === 'POST' && !runId) {
      const project = await repository.findById(projectId, user.id);
      if (!project) throw new HttpError(404, 'Project not found.');
      if (project.status !== 'active')
        throw new HttpError(409, 'Only active projects can be collected.');
      const idempotencyKey = idempotencyKeySchema.parse(request.headers.get('Idempotency-Key'));
      const body =
        request.headers.get('Content-Length') === '0' ? {} : await request.json().catch(() => ({}));
      const sourceId = collectionRunRequestSchema.parse(body).sourceId;
      const created = await collectionRepository.createOrFind({
        projectId,
        idempotencyKey,
        ...(sourceId ? { sourceId } : {}),
      });
      if (created.run.status === 'pending' && !created.run.queuedAt) {
        try {
          await env.COLLECT_QUEUE.send(createCollectionTask(created.run.id));
        } catch {
          throw new HttpError(
            503,
            'Collection task could not be queued; retry with the same idempotency key.',
          );
        }
        const queued = await collectionRepository.markQueued(created.run.id);
        return json(queued, created.created ? 202 : 200, env.WEB_ORIGIN);
      }
      return json(created.run, 200, env.WEB_ORIGIN);
    }
    throw new HttpError(405, 'Method not allowed.');
  }
  const match = url.pathname.match(/^\/api\/projects\/([^/]+)(?:\/(archive|restore))?$/);
  if (!match) throw new HttpError(404, 'Route not found.');
  const id = projectIdSchema.parse(match[1]);
  const action = match[2];
  if (!action && request.method === 'GET') {
    const project = await repository.findById(id, user.id);
    if (!project) throw new HttpError(404, 'Project not found.');
    return json(project, 200, env.WEB_ORIGIN);
  }
  if (!action && request.method === 'PATCH') {
    const input = updateResearchProjectRequestSchema.parse(await parseBody(request));
    if (input.naturalLanguageQuery !== undefined || input.structuredQuery !== undefined) {
      const existing =
        input.naturalLanguageQuery === undefined ? await repository.findById(id, user.id) : null;
      if (input.naturalLanguageQuery === undefined && !existing)
        throw new HttpError(404, 'Project not found.');
      const query = input.naturalLanguageQuery ?? existing!.naturalLanguageQuery;
      const interpretation = interpretationMetadata(
        await new DeterministicIntentInterpreter().interpret({ query }),
      );
      return json(
        await repository.update(id, user.id, { ...input, interpretation }),
        200,
        env.WEB_ORIGIN,
      );
    }
    return json(await repository.update(id, user.id, input), 200, env.WEB_ORIGIN);
  }
  if (!action && request.method === 'DELETE') {
    await repository.softDelete(id, user.id);
    return new Response(null, {
      status: 204,
      headers: { 'Access-Control-Allow-Origin': env.WEB_ORIGIN ?? '*' },
    });
  }
  if (request.method === 'POST' && action === 'archive')
    return json(await repository.archive(id, user.id), 200, env.WEB_ORIGIN);
  if (request.method === 'POST' && action === 'restore')
    return json(await repository.restore(id, user.id), 200, env.WEB_ORIGIN);
  throw new HttpError(405, 'Method not allowed.');
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === EBAY_ACCOUNT_DELETION_PATH)
      return handleEbayAccountDeletionWebhook(request, env);
    if (url.pathname === MANUAL_EBAY_PROBE_PATH)
      return handleManualEbayProbe(request, env, env.EBAY_BROWSE_BUDGET_PER_RUN);
    if (request.method === 'OPTIONS')
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': env.WEB_ORIGIN ?? '*',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        },
      });
    if (url.pathname === '/health')
      return json({ status: 'ok', system: SCOUT_SYSTEM_NAME }, 200, env.WEB_ORIGIN);
    try {
      if (url.pathname.startsWith('/api/')) {
        if (env.PUBLIC_API_ENABLED === 'false') throw new HttpError(404, 'Route not found.');
        return await handleApi(request, env, url);
      }
      throw new HttpError(404, 'Route not found.');
    } catch (error) {
      if (error instanceof HttpError)
        return json({ error: error.message }, error.status, env.WEB_ORIGIN);
      if (error && typeof error === 'object' && 'issues' in error)
        return json({ error: 'Validation failed.', issues: error.issues }, 422, env.WEB_ORIGIN);
      console.error(
        'Worker request failed',
        error instanceof Error ? error.message : 'Unknown error',
      );
      return json({ error: 'Internal server error.' }, 500, env.WEB_ORIGIN);
    }
  },
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    const serviceConfig = {
      baseUrl: env.SUPABASE_URL,
      anonKey: env.SUPABASE_SERVICE_ROLE_KEY,
      accessToken: env.SUPABASE_SERVICE_ROLE_KEY,
    };
    const repository = new SupabaseRestCollectionRunRepository(serviceConfig);
    const analysisRepository = new SupabaseRestTextAnalysisRunRepository(serviceConfig);
    const valuationRepository = new SupabaseRestOpportunityValuationRepository(serviceConfig);
    const listingRepository = new SupabaseRestListingRepository(serviceConfig);
    const observationRepository = new SupabaseRestObservationEventRepository(serviceConfig);
    const triageRepository = new SupabaseRestTriageDecisionRepository(serviceConfig);
    const queryFamilyRepository = new SupabaseRestSearchQueryFamilyRepository(serviceConfig);
    const queryFamilyProvider = new CollectionQueryFamilyProvider(queryFamilyRepository);
    const cheapFilter = new CheapListingFilter();
    const textAnalyzer = configuredTextAnalyzer(env);
    for (const message of batch.messages) {
      try {
        if (ebayAccountDeletionTaskSchema.safeParse(message.body).success) {
          await processEbayAccountDeletionTask(message.body, env);
          message.ack();
          continue;
        }
        if (visualAnalysisTaskSchema.safeParse(message.body).success) {
          const outcome = await new VisualAnalysisProcessor(
            new SupabaseRestVisualAnalysisRepository(serviceConfig),
            listingRepository,
            new GeminiVisualAnalyzer(
              env.GEMINI_API_KEY ?? '',
              env.GEMINI_VISION_MODEL ?? 'gemini-3.5-flash',
            ),
            {
              inputPerMTokUsd: env.GEMINI_PRICE_INPUT_PER_MTOK_USD,
              outputPerMTokUsd: env.GEMINI_PRICE_OUTPUT_PER_MTOK_USD,
            },
          ).process(message.body);
          if (outcome.action === 'retry') message.retry({ delaySeconds: 10 });
          else message.ack();
          continue;
        }
        if (textAnalysisTaskSchema.safeParse(message.body).success) {
          const outcome = await new TextAnalysisTaskProcessor(
            analysisRepository,
            textAnalyzer,
          ).process(message.body);
          if (outcome.action === 'retry') message.retry({ delaySeconds: outcome.delaySeconds });
          else message.ack();
          continue;
        }
        if (textAnalysisBatchTaskSchema.safeParse(message.body).success) {
          const outcome = await new TextAnalysisBatchTaskProcessor(
            analysisRepository,
            textAnalyzer,
          ).process(message.body);
          if (outcome.action === 'retry') message.retry({ delaySeconds: outcome.delaySeconds });
          else message.ack();
          continue;
        }
        const processor = new CollectionTaskProcessor(
          repository,
          configuredCollectionGateways(env, logEbayRequestTelemetry),
          3,
          new ListingIngestionService(
            new Map([
              [SOURCE_IDS.ebay, new EbayListingMapper()],
              [SOURCE_IDS.mercadolivre, new GenericListingMapper()],
              [SOURCE_IDS.xianyu, new GenericListingMapper()],
              [SOURCE_IDS.swappa, new SwappaListingMapper()],
            ]),
            new R2RawListingObjectStore(env.RAW_BUCKET, env.EBAY_IDENTITY_HASH_SECRET ?? ''),
            new SupabaseRestListingIngestionRepository({
              ...serviceConfig,
            }),
          ),
          env.ANALYSIS_QUEUE
            ? new TextAnalysisQueueScheduler(analysisRepository, env.ANALYSIS_QUEUE, textAnalyzer)
            : undefined,
          queryFamilyProvider,
          new CollectionOpportunityValuationProcessor(
            valuationRepository,
            undefined,
            undefined,
            listingRepository,
            observationRepository,
          ),
          new CollectionTriageService(
            triageRepository,
            undefined,
            undefined,
            undefined,
            triageRepository,
          ),
          queryFamilyRepository,
          (preview, criteria) => cheapFilter.screenPreview(preview, criteria),
        );
        const outcome = await processor.process(message.body, message.attempts);
        if (outcome.action === 'retry') message.retry({ delaySeconds: outcome.delaySeconds });
        else message.ack();
      } catch (error) {
        console.error(
          'Queue task infrastructure failure',
          error instanceof Error ? error.message : 'Unknown error',
        );
        message.retry({ delaySeconds: 30 });
      }
    }
  },
} satisfies ExportedHandler<Env>;
