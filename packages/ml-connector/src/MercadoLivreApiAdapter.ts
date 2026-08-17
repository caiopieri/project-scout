import { ConnectorError, type SourceConnector } from '@scout/domain';
import {
  connectorSearchInputSchema,
  jsonObjectSchema,
  rawListingRecordSchema,
  rawListingPreviewSchema,
} from '@scout/schemas';
import {
  mercadoLivreItemSchema,
  mercadoLivreOAuthTokenSchema,
  mercadoLivreSearchResponseSchema,
  type MercadoLivreItem,
} from './api-schemas';
import {
  buildMercadoLivreItemUrl,
  buildMercadoLivreSearchUrl,
  parseMercadoLivreAmountMinor,
  type MercadoLivreSiteId,
} from './query';
import { MERCADO_LIVRE_CONNECTOR_MANIFEST } from './manifest';

export type MercadoLivreFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface MercadoLivreApiAdapterConfig {
  accessToken?: string;
  oauth?: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  };
  tokenState?: MercadoLivreTokenState;
  siteId?: MercadoLivreSiteId;
  maxAttempts?: number;
  requestTimeoutMs?: number;
}

export interface MercadoLivreTokenState {
  accessToken?: string;
  refreshToken?: string;
}

export interface MercadoLivreApiAdapterDependencies {
  fetch?: MercadoLivreFetch;
}

const defaultFetch: MercadoLivreFetch = (input, init) => globalThis.fetch(input, init);

export class MercadoLivreApiAdapter implements SourceConnector {
  readonly source = 'mercadolivre' as const;
  readonly provider = 'mercadolivre-api-v1';
  readonly manifest = MERCADO_LIVRE_CONNECTOR_MANIFEST;
  private readonly fetcher: MercadoLivreFetch;

  constructor(
    private readonly config: MercadoLivreApiAdapterConfig,
    dependencies: MercadoLivreApiAdapterDependencies = {},
  ) {
    if (!config.accessToken?.trim() && !config.oauth) {
      throw new ConnectorError(
        'Mercado Livre credentials are not configured.',
        'permanent',
        'ML_CONFIGURATION_MISSING',
      );
    }
    this.fetcher = dependencies.fetch ?? defaultFetch;
    this.accessToken = config.tokenState?.accessToken ?? config.accessToken?.trim();
    this.refreshToken = config.tokenState?.refreshToken ?? config.oauth?.refreshToken;
  }

  async search(rawInput: Parameters<SourceConnector['search']>[0]) {
    const input = connectorSearchInputSchema.parse(rawInput);
    const raw = await this.requestJson(buildMercadoLivreSearchUrl(input, this.config.siteId));
    const response = mercadoLivreSearchResponseSchema.safeParse(raw);
    if (!response.success) {
      throw new ConnectorError(
        'Mercado Livre search returned an invalid payload.',
        'permanent',
        'ML_SEARCH_INVALID_RESPONSE',
      );
    }
    const items = response.data.results.map((item) => this.mapPreview(item));
    const nextOffset = response.data.paging.offset + items.length;
    return {
      items,
      nextCursor:
        items.length > 0 && nextOffset < response.data.paging.total
          ? String(nextOffset)
          : undefined,
    };
  }

  async fetchDetails(externalId: string) {
    const raw = await this.requestJson(buildMercadoLivreItemUrl(externalId));
    const item = mercadoLivreItemSchema.safeParse(raw);
    if (!item.success) {
      throw new ConnectorError(
        'Mercado Livre item details returned an invalid payload.',
        'permanent',
        'ML_ITEM_INVALID_RESPONSE',
      );
    }
    const record = rawListingRecordSchema.safeParse({
      preview: this.mapPreview(item.data),
      payload: jsonObjectSchema.parse(item.data),
    });
    if (!record.success) {
      throw new ConnectorError(
        'Mercado Livre item details cannot be represented by the raw connector contract.',
        'permanent',
        'ML_ITEM_MAPPING_INVALID',
      );
    }
    return record.data;
  }

  private mapPreview(item: MercadoLivreItem) {
    const preview = rawListingPreviewSchema.safeParse({
      externalId: item.id,
      url: item.permalink,
      title: item.title,
      price: {
        amountMinor: parseMercadoLivreAmountMinor(item.price),
        currency: item.currency_id,
      },
      imageUrl: item.thumbnail ?? undefined,
      sellerExternalId: item.seller_id === undefined ? undefined : String(item.seller_id),
    });
    if (!preview.success) {
      throw new ConnectorError(
        'Mercado Livre item cannot be represented by the raw connector contract.',
        'permanent',
        'ML_ITEM_MAPPING_INVALID',
      );
    }
    return preview.data;
  }

  private async requestJson(url: URL): Promise<unknown> {
    const maxAttempts = this.config.maxAttempts ?? 2;
    let refreshed = false;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs ?? 10_000);
      try {
        const response = await this.fetcher(url, {
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${await this.getAccessToken()}`,
          },
          signal: controller.signal,
        });
        const raw = await response.json().catch(() => null);
        if (response.ok) {
          const json = jsonObjectSchema.safeParse(raw);
          if (!json.success) {
            throw new ConnectorError(
              'Mercado Livre returned invalid JSON.',
              'permanent',
              'ML_INVALID_JSON',
            );
          }
          return json.data;
        }
        if (
          response.status === 401 &&
          this.config.oauth &&
          !refreshed
        ) {
          refreshed = true;
          await this.refreshAccessToken();
          continue;
        }
        if (response.status === 401) {
          throw new ConnectorError(
            'Mercado Livre authorization is required.',
            'permanent',
            'ML_AUTH_REQUIRED',
          );
        }
        if (response.status === 403) {
          throw new ConnectorError(
            'Mercado Livre policy denied this resource.',
            'permanent',
            'ML_POLICY_UNAUTHORIZED',
          );
        }
        if (response.status !== 429 && response.status < 500) {
          throw new ConnectorError(
            'Mercado Livre rejected the request.',
            'permanent',
            'ML_REQUEST_REJECTED',
          );
        }
      } catch (cause) {
        if (cause instanceof ConnectorError) throw cause;
        if (attempt === maxAttempts) {
          throw new ConnectorError(
            'Mercado Livre request failed.',
            'transient',
            'ML_API_UNAVAILABLE',
          );
        }
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new ConnectorError('Mercado Livre request failed.', 'transient', 'ML_API_UNAVAILABLE');
  }

  private accessToken?: string;
  private refreshToken?: string;
  private refreshPromise?: Promise<{ accessToken: string; refreshToken?: string }>;

  private async getAccessToken(): Promise<string> {
    if (this.accessToken) return this.accessToken;
    return this.refreshAccessToken();
  }

  private async refreshAccessToken(): Promise<string> {
    if (!this.config.oauth) {
      throw new ConnectorError(
        'Mercado Livre credentials are not configured.',
        'permanent',
        'ML_CONFIGURATION_MISSING',
      );
    }
    if (!this.refreshPromise) {
      this.refreshPromise = this.requestAccessToken().finally(() => {
        this.refreshPromise = undefined;
      });
    }
    const token = await this.refreshPromise;
    this.accessToken = token.accessToken;
    this.refreshToken = token.refreshToken;
    if (this.config.tokenState) {
      this.config.tokenState.accessToken = token.accessToken;
      this.config.tokenState.refreshToken = token.refreshToken;
    }
    return this.accessToken;
  }

  private async requestAccessToken(): Promise<{ accessToken: string; refreshToken?: string }> {
    const oauth = this.config.oauth;
    if (!oauth) throw new Error('OAuth configuration missing.');
    const response = await this.fetcher('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: oauth.clientId,
        client_secret: oauth.clientSecret,
        refresh_token: this.refreshToken ?? oauth.refreshToken,
      }).toString(),
    });
    const raw = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ConnectorError(
        'Mercado Livre authorization is required.',
        'permanent',
        'ML_AUTH_REQUIRED',
      );
    }
    const token = mercadoLivreOAuthTokenSchema.safeParse(raw);
    if (!token.success) {
      throw new ConnectorError(
        'Mercado Livre authorization returned an invalid token.',
        'permanent',
        'ML_AUTH_INVALID_RESPONSE',
      );
    }
    return {
      accessToken: token.data.access_token,
      refreshToken: token.data.refresh_token,
    };
  }
}
