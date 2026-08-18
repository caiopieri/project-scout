import {
  DeterministicIntentInterpreter,
  DeterministicTextAnalyzer,
  MockTextAnalyzer,
  TextAnalysisTaskProcessor,
} from '@scout/ai';
import { SCOUT_SYSTEM_NAME } from '@scout/config';
import {
  CollectionTaskProcessor,
  createCollectionTask,
  DefaultCollectionGateway,
  GenericListingMapper,
  ListingIngestionService,
  SourceCollectionGatewayRegistry,
} from '@scout/collection';
import { SupabaseRestCollectionRunRepository } from '@scout/database/collection';
import { SupabaseRestListingIngestionRepository } from '@scout/database/ingestion';
import { SupabaseRestListingRepository } from '@scout/database/listings';
import { SupabaseRestObservationEventRepository } from '@scout/database/observation-events';
import { SupabaseRestResearchProjectRepository } from '@scout/database/supabase';
import { SupabaseRestTextAnalysisRunRepository } from '@scout/database/text-analysis';
import { SupabaseRestOpportunityValuationRepository } from '@scout/database/valuation';
import { SupabaseRestTriageDecisionRepository } from '@scout/database/triage';
import { SupabaseRestSearchQueryFamilyRepository } from '@scout/database/search-intelligence';
import {
  EbayApiAdapter,
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
import { CollectionQueryFamilyProvider, CollectionTriageService } from '@scout/search-intelligence';
import { UnavailableXianyuConnector } from '@scout/xianyu-connector';
import { CollectionOpportunityValuationProcessor } from '@scout/valuation';
import {
  authenticatedUserSchema,
  crossSourceIdentityCandidateReviewRequestSchema,
  type InterpretIntentResult,
  createResearchProjectRequestSchema,
  interpretIntentInputSchema,
  projectIdSchema,
  idempotencyKeySchema,
  listingTriageReviewRequestSchema,
  searchTermObservationReviewRequestSchema,
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
import { DurableObjectEbayRateLimiter } from './EbayRateLimitDurableObject';
export { EbayRateLimitDurableObject } from './EbayRateLimitDurableObject';

const configuredTextAnalyzer = (env: Env) =>
  env.TEXT_ANALYZER_MODE === 'mock' ? new MockTextAnalyzer() : new DeterministicTextAnalyzer();

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
  const configuredBudget = Number(env.EBAY_BROWSE_BUDGET_PER_RUN);
  if (
    mode === 'production' &&
    (!Number.isSafeInteger(configuredBudget) || configuredBudget < 1 || configuredBudget > 1000)
  ) {
    return new UnavailableEbayConnector(mode, 'EBAY_BROWSE_BUDGET_CONFIGURATION_MISSING');
  }
  const maxBrowseRequests =
    Number.isSafeInteger(configuredBudget) && configuredBudget > 0 ? configuredBudget : 6;
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
} as const;

const configuredCollectionGateways = (env: Env, onEbayRequest?: EbayRequestTelemetryLogger) =>
  new SourceCollectionGatewayRegistry([
    [
      SOURCE_IDS.ebay,
      new DefaultCollectionGateway(
        configuredEbayConnector(env, onEbayRequest),
        (env.EBAY_CONNECTOR_MODE ?? 'mock') === 'mock'
          ? { maxPages: 1, pageSize: 5, maxItems: 4, maxQueries: 1 }
          : env.EBAY_BROWSE_BUDGET_PER_RUN
            ? { maxPages: 10, pageSize: 100, maxItems: 300, maxQueries: 3 }
            : { maxPages: 1, pageSize: 5, maxItems: 4, maxQueries: 1 },
      ),
    ],
    [SOURCE_IDS.mercadolivre, new DefaultCollectionGateway(configuredMercadoLivreConnector(env))],
    [SOURCE_IDS.xianyu, new DefaultCollectionGateway(new UnavailableXianyuConnector())],
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
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
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
    return json(await listingRepository.findByProjectId(projectId), 200, env.WEB_ORIGIN);
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
      const created = await collectionRepository.createOrFind({
        projectId,
        idempotencyKey,
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
    if (url.pathname === MANUAL_EBAY_PROBE_PATH) return handleManualEbayProbe(request, env);
    if (request.method === 'OPTIONS')
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': env.WEB_ORIGIN ?? '*',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key',
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
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
    const textAnalyzer = configuredTextAnalyzer(env);
    for (const message of batch.messages) {
      try {
        if (ebayAccountDeletionTaskSchema.safeParse(message.body).success) {
          await processEbayAccountDeletionTask(message.body, env);
          message.ack();
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
        const processor = new CollectionTaskProcessor(
          repository,
          configuredCollectionGateways(env, logEbayRequestTelemetry),
          3,
          new ListingIngestionService(
            new Map([
              [SOURCE_IDS.ebay, new EbayListingMapper()],
              [SOURCE_IDS.mercadolivre, new GenericListingMapper()],
              [SOURCE_IDS.xianyu, new GenericListingMapper()],
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
        );
        const outcome = await processor.process(message.body);
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
