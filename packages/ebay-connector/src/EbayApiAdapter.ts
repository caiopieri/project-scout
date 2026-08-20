import { ConnectorError, type SourceConnector } from '@scout/domain';
import {
  connectorSearchInputSchema,
  jsonObjectSchema,
  rawListingRecordSchema,
  rawListingPreviewSchema,
} from '@scout/schemas';
import {
  ebayItemResponseSchema,
  ebaySearchResponseSchema,
  type EbayItemResponse,
  type EbayItemSummary,
} from './api-schemas';
import {
  EbayOAuthClient,
  defaultEbayFetch,
  type EbayEnvironment,
  type EbayFetch,
  type EbayTokenCache,
} from './oauth';
import {
  buildEbayItemUrl,
  buildEbaySearchUrl,
  parseEbayAmountMinor,
  shouldRejectEbayPreviewTitle,
  type EbayMarketplaceId,
} from './query';
import { EBAY_CONNECTOR_MANIFEST } from './manifest';
import type { EbayRateLimiter } from './rate-limit';

export interface EbayApiAdapterConfig {
  environment: EbayEnvironment;
  clientId: string;
  clientSecret: string;
  marketplaceId?: EbayMarketplaceId;
  maxAttempts?: number;
  requestTimeoutMs?: number;
  // Orçamento de chamadas Browse por execução. Sem padrão: quem constrói o
  // adapter decide, e a ausência falha fechado em vez de virar um número mágico.
  maxBrowseRequests: number;
}

export type EbayRequestOperation = 'search' | 'details';
export type EbayRequestTelemetryOutcome = 'success' | 'retry' | 'error';

export interface EbayRequestTelemetryEvent {
  operation: EbayRequestOperation;
  attempt: number;
  requestNumber: number;
  maxRequests: number;
  observedAt: number;
  outcome: EbayRequestTelemetryOutcome;
  status?: number;
  errorCode?: string;
  retryAfterSeconds?: number;
}

export interface EbayRequestBudgetSnapshot {
  requestsUsed: number;
  maxRequests: number;
  requestsRemaining: number;
  exhausted: boolean;
}

export interface EbayApiAdapterDependencies {
  fetch?: EbayFetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  tokenCache?: EbayTokenCache;
  onRequest?: (event: EbayRequestTelemetryEvent) => void;
  rateLimiter?: EbayRateLimiter;
}

const defaultSleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const isRetryableStatus = (status: number) => status === 408 || status === 429 || status >= 500;

export class EbayApiAdapter implements SourceConnector {
  readonly source = 'ebay' as const;
  readonly provider: string;
  readonly manifest = EBAY_CONNECTOR_MANIFEST;
  readonly marketplaceId: EbayMarketplaceId;
  private readonly fetcher: EbayFetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;
  private readonly onRequest?: (event: EbayRequestTelemetryEvent) => void;
  private readonly rateLimiter?: EbayRateLimiter;
  private readonly oauth: EbayOAuthClient;
  private browseRequests = 0;

  constructor(
    private readonly config: EbayApiAdapterConfig,
    dependencies: EbayApiAdapterDependencies = {},
  ) {
    this.marketplaceId = config.marketplaceId ?? 'EBAY_US';
    this.provider = `ebay-api-${config.environment}-v1`;
    this.fetcher = dependencies.fetch ?? defaultEbayFetch;
    this.sleep = dependencies.sleep ?? defaultSleep;
    this.now = dependencies.now ?? Date.now;
    this.onRequest = dependencies.onRequest;
    this.rateLimiter = dependencies.rateLimiter;
    this.oauth = new EbayOAuthClient(config, {
      fetch: this.fetcher,
      now: this.now,
      cache: dependencies.tokenCache,
    });
  }

  getRequestBudgetSnapshot(): EbayRequestBudgetSnapshot {
    const maxRequests = this.config.maxBrowseRequests;
    return {
      requestsUsed: this.browseRequests,
      maxRequests,
      requestsRemaining: Math.max(0, maxRequests - this.browseRequests),
      exhausted: this.browseRequests >= maxRequests,
    };
  }

  async search(rawInput: Parameters<SourceConnector['search']>[0]) {
    const input = connectorSearchInputSchema.parse(rawInput);
    const url = buildEbaySearchUrl(rawInput, {
      environment: this.config.environment,
      marketplaceId: this.marketplaceId,
    });
    const raw = await this.requestJson(url, 'search');
    const response = ebaySearchResponseSchema.safeParse(raw);
    if (!response.success) {
      throw new ConnectorError(
        'eBay search returned an invalid payload.',
        'permanent',
        'EBAY_SEARCH_INVALID_RESPONSE',
      );
    }
    const rawItemCount = response.data.itemSummaries.length;
    const items = response.data.itemSummaries
      .filter((item) => !shouldRejectEbayPreviewTitle(item.title, input.criteria))
      .map((item) => this.mapPreview(item));
    let nextCursor: string | undefined;
    if (response.data.next) {
      const offset = Number(url.searchParams.get('offset'));
      const nextOffset = offset + rawItemCount;
      if (rawItemCount === 0 || !Number.isSafeInteger(nextOffset)) {
        throw new ConnectorError(
          'eBay search returned an invalid pagination state.',
          'permanent',
          'EBAY_PAGINATION_INVALID',
        );
      }
      nextCursor = String(nextOffset);
    }
    return { items, nextCursor };
  }

  async fetchDetails(externalId: string) {
    const raw = await this.requestJson(
      buildEbayItemUrl(externalId, this.config.environment),
      'details',
    );
    const item = ebayItemResponseSchema.safeParse(raw);
    if (!item.success) {
      throw new ConnectorError(
        'eBay item details returned an invalid payload.',
        'permanent',
        'EBAY_ITEM_INVALID_RESPONSE',
      );
    }
    const record = rawListingRecordSchema.safeParse({
      preview: this.mapPreview(item.data),
      payload: item.data,
    });
    if (!record.success) {
      throw new ConnectorError(
        'eBay item details cannot be represented by the raw connector contract.',
        'permanent',
        'EBAY_ITEM_MAPPING_INVALID',
      );
    }
    return record.data;
  }

  private mapPreview(item: EbayItemSummary | EbayItemResponse) {
    const preview = rawListingPreviewSchema.safeParse({
      externalId: item.itemId,
      url: item.itemWebUrl,
      title: item.title,
      price: {
        amountMinor: parseEbayAmountMinor(item.price.value),
        currency: item.price.currency,
      },
      imageUrl: item.image?.imageUrl,
      sellerExternalId: item.seller?.username,
    });
    if (!preview.success) {
      throw new ConnectorError(
        'eBay item summary cannot be represented by the raw connector contract.',
        'permanent',
        'EBAY_ITEM_MAPPING_INVALID',
      );
    }
    return preview.data;
  }

  private emitRequestTelemetry(event: EbayRequestTelemetryEvent): void {
    try {
      this.onRequest?.(event);
    } catch {
      // Observability must never change connector behavior or expose request data.
    }
  }

  private async requestJson(url: URL, operation: EbayRequestOperation): Promise<unknown> {
    const maxAttempts = this.config.maxAttempts ?? 3;
    const maxRequests = this.config.maxBrowseRequests;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs ?? 10_000);
      try {
        const accessToken = await this.oauth.getAccessToken();
        if (this.browseRequests >= maxRequests) {
          this.emitRequestTelemetry({
            operation,
            attempt,
            requestNumber: this.browseRequests,
            maxRequests,
            observedAt: this.now(),
            outcome: 'error',
            errorCode: 'REQUEST_BUDGET_EXHAUSTED',
          });
          throw new ConnectorError(
            'Source request budget exhausted.',
            'permanent',
            'REQUEST_BUDGET_EXHAUSTED',
          );
        }
        if (this.rateLimiter) await this.rateLimiter.acquire({ operation });
        this.browseRequests += 1;
        const response = await this.fetcher(url, {
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${accessToken}`,
            'X-EBAY-C-MARKETPLACE-ID': this.marketplaceId,
          },
          signal: controller.signal,
        });
        const requestNumber = this.browseRequests;
        const rawJson = await response.json().catch(() => null);
        const json = jsonObjectSchema.safeParse(rawJson);
        if (response.ok) {
          if (!json.success) {
            this.emitRequestTelemetry({
              operation,
              attempt,
              requestNumber,
              maxRequests,
              observedAt: this.now(),
              outcome: 'error',
              status: response.status,
              errorCode: 'EBAY_INVALID_JSON',
            });
            throw new ConnectorError(
              'eBay returned invalid JSON.',
              'permanent',
              'EBAY_INVALID_JSON',
            );
          }
          this.emitRequestTelemetry({
            operation,
            attempt,
            requestNumber,
            maxRequests,
            observedAt: this.now(),
            outcome: 'success',
            status: response.status,
          });
          return json.data;
        }

        if (response.status === 401 && attempt < maxAttempts) {
          this.emitRequestTelemetry({
            operation,
            attempt,
            requestNumber,
            maxRequests,
            observedAt: this.now(),
            outcome: 'retry',
            status: response.status,
            errorCode: 'EBAY_UNAUTHORIZED',
          });
          this.oauth.invalidate();
          continue;
        }
        const retryable = isRetryableStatus(response.status);
        const errorCode =
          response.status === 401
            ? 'EBAY_UNAUTHORIZED'
            : response.status === 404
              ? 'EBAY_ITEM_NOT_FOUND'
              : response.status === 429
                ? 'EBAY_RATE_LIMITED'
                : retryable
                  ? 'EBAY_API_UNAVAILABLE'
                  : 'EBAY_API_REJECTED';
        const retryAfterHeader = response.headers.get('Retry-After');
        const retryAfter = retryAfterHeader === null ? Number.NaN : Number(retryAfterHeader);
        if (retryable && attempt < maxAttempts) {
          this.emitRequestTelemetry({
            operation,
            attempt,
            requestNumber,
            maxRequests,
            observedAt: this.now(),
            outcome: 'retry',
            status: response.status,
            errorCode,
            ...(Number.isFinite(retryAfter) && retryAfter >= 0
              ? { retryAfterSeconds: retryAfter }
              : {}),
          });
          const delay =
            Number.isFinite(retryAfter) && retryAfter >= 0
              ? Math.min(2_000, retryAfter * 1000)
              : Math.min(2_000, 250 * 2 ** (attempt - 1));
          await this.sleep(delay);
          continue;
        }
        this.emitRequestTelemetry({
          operation,
          attempt,
          requestNumber,
          maxRequests,
          observedAt: this.now(),
          outcome: 'error',
          status: response.status,
          errorCode,
        });
        throw new ConnectorError(
          'eBay API rejected the request.',
          retryable ? 'transient' : 'permanent',
          errorCode,
        );
      } catch (cause) {
        if (cause instanceof ConnectorError) throw cause;
        const timedOut = cause instanceof DOMException && cause.name === 'AbortError';
        const errorCode = timedOut ? 'EBAY_API_TIMEOUT' : 'EBAY_API_UNAVAILABLE';
        if (attempt < maxAttempts) {
          this.emitRequestTelemetry({
            operation,
            attempt,
            requestNumber: this.browseRequests,
            maxRequests,
            observedAt: this.now(),
            outcome: 'retry',
            errorCode,
          });
          await this.sleep(Math.min(2_000, 250 * 2 ** (attempt - 1)));
          continue;
        }
        this.emitRequestTelemetry({
          operation,
          attempt,
          requestNumber: this.browseRequests,
          maxRequests,
          observedAt: this.now(),
          outcome: 'error',
          errorCode,
        });
        throw new ConnectorError(
          timedOut ? 'eBay API request timed out.' : 'eBay API request failed.',
          'transient',
          errorCode,
        );
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new ConnectorError(
      'eBay API retry policy exhausted.',
      'transient',
      'EBAY_API_UNAVAILABLE',
    );
  }
}

export class UnavailableEbayConnector implements SourceConnector {
  readonly source = 'ebay' as const;
  readonly provider: string;
  readonly manifest = EBAY_CONNECTOR_MANIFEST;

  constructor(
    environment: EbayEnvironment,
    private readonly errorCode = 'EBAY_CONFIGURATION_MISSING',
  ) {
    this.provider = `ebay-api-${environment}-v1`;
  }

  async search(): Promise<never> {
    throw new ConnectorError('eBay connector is not configured.', 'permanent', this.errorCode);
  }

  async fetchDetails(): Promise<never> {
    throw new ConnectorError('eBay connector is not configured.', 'permanent', this.errorCode);
  }
}

export const EBAY_SCRAPING_FALLBACK = {
  enabled: false,
  status: 'not-implemented',
} as const;
