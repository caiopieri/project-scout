import { ConnectorError } from '@scout/domain';
import { jsonObjectSchema } from '@scout/schemas';
import { ebayOAuthTokenResponseSchema } from './api-schemas';

export type EbayEnvironment = 'sandbox' | 'production';
export type EbayFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export const defaultEbayFetch: EbayFetch = (input, init) => globalThis.fetch(input, init);

export interface EbayTokenCache {
  get(key: string): { accessToken: string; expiresAt: number } | undefined;
  set(key: string, value: { accessToken: string; expiresAt: number }): void;
  delete(key: string): void;
}

export class InMemoryEbayTokenCache implements EbayTokenCache {
  private readonly entries = new Map<string, { accessToken: string; expiresAt: number }>();
  get(key: string) {
    return this.entries.get(key);
  }
  set(key: string, value: { accessToken: string; expiresAt: number }) {
    this.entries.set(key, value);
  }
  delete(key: string) {
    this.entries.delete(key);
  }
}

export const sharedEbayTokenCache = new InMemoryEbayTokenCache();

interface OAuthConfig {
  environment: EbayEnvironment;
  clientId: string;
  clientSecret: string;
  scope?: string;
  timeoutMs?: number;
}

interface OAuthDependencies {
  fetch?: EbayFetch;
  now?: () => number;
  cache?: EbayTokenCache;
}

const tokenEndpoint = (environment: EbayEnvironment) =>
  environment === 'production'
    ? 'https://api.ebay.com/identity/v1/oauth2/token'
    : 'https://api.sandbox.ebay.com/identity/v1/oauth2/token';

const encodeBasicCredentials = (clientId: string, clientSecret: string) => {
  const bytes = new TextEncoder().encode(`${clientId}:${clientSecret}`);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

export class EbayOAuthClient {
  private readonly fetcher: EbayFetch;
  private readonly now: () => number;
  private readonly cache: EbayTokenCache;
  private readonly cacheKey: string;

  constructor(
    private readonly config: OAuthConfig,
    dependencies: OAuthDependencies = {},
  ) {
    if (!config.clientId.trim() || !config.clientSecret.trim()) {
      throw new ConnectorError(
        'eBay credentials are not configured.',
        'permanent',
        'EBAY_CONFIGURATION_MISSING',
      );
    }
    this.fetcher = dependencies.fetch ?? defaultEbayFetch;
    this.now = dependencies.now ?? Date.now;
    this.cache = dependencies.cache ?? sharedEbayTokenCache;
    this.cacheKey = `${config.environment}:${config.clientId}`;
  }

  async getAccessToken(): Promise<string> {
    const cached = this.cache.get(this.cacheKey);
    if (cached && cached.expiresAt > this.now() + 60_000) return cached.accessToken;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 8_000);
    let response: Response;
    try {
      response = await this.fetcher(tokenEndpoint(this.config.environment), {
        method: 'POST',
        headers: {
          Authorization: `Basic ${encodeBasicCredentials(this.config.clientId, this.config.clientSecret)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          scope: this.config.scope ?? 'https://api.ebay.com/oauth/api_scope',
        }).toString(),
        signal: controller.signal,
      });
    } catch (cause) {
      throw new ConnectorError(
        cause instanceof DOMException && cause.name === 'AbortError'
          ? 'eBay OAuth request timed out.'
          : 'eBay OAuth request failed.',
        'transient',
        cause instanceof DOMException && cause.name === 'AbortError'
          ? 'EBAY_OAUTH_TIMEOUT'
          : 'EBAY_OAUTH_UNAVAILABLE',
      );
    } finally {
      clearTimeout(timeout);
    }

    const raw = jsonObjectSchema.safeParse(await response.json().catch(() => null));
    if (!response.ok) {
      throw new ConnectorError(
        'eBay OAuth rejected the request.',
        response.status === 429 || response.status >= 500 ? 'transient' : 'permanent',
        response.status === 429 ? 'EBAY_OAUTH_RATE_LIMITED' : 'EBAY_OAUTH_REJECTED',
      );
    }
    if (!raw.success)
      throw new ConnectorError(
        'eBay OAuth returned invalid JSON.',
        'transient',
        'EBAY_OAUTH_INVALID_JSON',
      );
    const token = ebayOAuthTokenResponseSchema.safeParse(raw.data);
    if (!token.success)
      throw new ConnectorError(
        'eBay OAuth returned an invalid token payload.',
        'transient',
        'EBAY_OAUTH_INVALID_RESPONSE',
      );
    this.cache.set(this.cacheKey, {
      accessToken: token.data.access_token,
      expiresAt: this.now() + token.data.expires_in * 1000,
    });
    return token.data.access_token;
  }

  invalidate(): void {
    this.cache.delete(this.cacheKey);
  }
}
