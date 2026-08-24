import { createHash, timingSafeEqual } from 'node:crypto';
import { DefaultCollectionGateway } from '@scout/collection';
import { ConnectorError } from '@scout/domain';
import { EbayApiAdapter, isEbayMarketplaceId } from '@scout/ebay-connector';
import { manualEbayProbeInputSchema } from '@scout/schemas';
import type { JsonObject, ResearchCriteria } from '@scout/schemas';
import type { Env } from './env';

export const MANUAL_EBAY_PROBE_PATH = '/internal/ebay/probe';
const MAX_BODY_BYTES = 1024;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

const json = (body: unknown, status: number) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });

const authorized = (request: Request, configuredToken: string) => {
  const authorization = request.headers.get('Authorization');
  const suppliedToken = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';
  const expectedHash = createHash('sha256').update(configuredToken).digest();
  const suppliedHash = createHash('sha256').update(suppliedToken).digest();
  return timingSafeEqual(expectedHash, suppliedHash);
};

const optionalText = (payload: JsonObject, key: string) => {
  const value = payload[key];
  return typeof value === 'string' ? value : undefined;
};

export async function handleManualEbayProbe(
  request: Request,
  env: Env,
  browseBudgetConfig = env.EBAY_BROWSE_BUDGET_PER_RUN,
): Promise<Response> {
  const configuredToken = env.EBAY_PROBE_TOKEN;
  if (!configuredToken || !TOKEN_PATTERN.test(configuredToken))
    return json({ error: 'Route not found.' }, 404);
  if (!authorized(request, configuredToken)) return json({ error: 'Route not found.' }, 404);
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))
    return json({ error: 'Content-Type must be application/json.' }, 415);
  const contentLength = Number(request.headers.get('Content-Length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) return json({ error: 'Payload too large.' }, 413);
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES)
    return json({ error: 'Payload too large.' }, 413);

  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }
  const input = manualEbayProbeInputSchema.safeParse(raw);
  if (!input.success) return json({ error: 'Invalid probe input.' }, 422);
  const maxBrowseRequests = Number(browseBudgetConfig);
  if (!Number.isSafeInteger(maxBrowseRequests) || maxBrowseRequests < 1)
    return json({ error: 'Probe is unavailable.' }, 503);
  if (!env.EBAY_APP_ID_CLIENT_ID || !env.EBAY_CERT_ID_CLIENT_SECRET)
    return json({ error: 'Probe is unavailable.' }, 503);
  const marketplaceId = env.EBAY_MARKETPLACE_ID ?? 'EBAY_US';
  if (!isEbayMarketplaceId(marketplaceId)) return json({ error: 'Probe is unavailable.' }, 503);

  const criteria: ResearchCriteria = {
    category: 'laptop',
    brands: ['Apple'],
    models: [input.data.query],
    variants: [],
    storageGb: [],
    memoryGb: [],
    acceptedDefects: [],
    rejectedDefects: [],
    acceptedConditions: ['for_repair'],
    countries: [],
    regions: [],
    requiredFunctionalStates: [],
    preferredEvidence: [],
    additionalKeywords: [],
    excludedKeywords: [],
  };
  const connector = new EbayApiAdapter({
    environment: 'production',
    clientId: env.EBAY_APP_ID_CLIENT_ID,
    clientSecret: env.EBAY_CERT_ID_CLIENT_SECRET,
    marketplaceId,
    maxAttempts: 1,
    maxBrowseRequests,
  });

  try {
    const result = await new DefaultCollectionGateway(connector).collect(
      criteria,
      input.data.maxResults,
    );
    const browseBudget = connector.getRequestBudgetSnapshot();
    return json(
      {
        provider: result.provider,
        marketplaceId,
        query: input.data.query,
        browseRequests: browseBudget.requestsUsed,
        browseBudget,
        items: result.items.map(({ preview, payload }) => ({
          title: preview.title,
          url: preview.url,
          price: preview.price,
          seller: preview.sellerExternalId,
          condition: optionalText(payload, 'condition'),
          hasDescription: typeof payload.description === 'string' && payload.description.length > 0,
        })),
      },
      200,
    );
  } catch (error) {
    return json(
      {
        error: 'eBay probe failed.',
        code: error instanceof ConnectorError ? error.code : 'UNEXPECTED_PROBE_ERROR',
      },
      502,
    );
  }
}
