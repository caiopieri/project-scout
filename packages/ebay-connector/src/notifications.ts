import { createHash, createVerify } from 'node:crypto';
import { ConnectorError } from '@scout/domain';
import {
  ebayAccountDeletionNotificationSchema,
  ebayNotificationPublicKeyResponseSchema,
  ebayNotificationSignatureHeaderSchema,
  jsonObjectSchema,
  type EbayAccountDeletionNotification,
} from '@scout/schemas';
import {
  EbayOAuthClient,
  defaultEbayFetch,
  type EbayEnvironment,
  type EbayFetch,
  type EbayTokenCache,
} from './oauth';

export const generateEbayChallengeResponse = (
  challengeCode: string,
  verificationToken: string,
  endpointUrl: string,
) =>
  createHash('sha256')
    .update(challengeCode)
    .update(verificationToken)
    .update(endpointUrl)
    .digest('hex');

export interface EbayPublicKeyCache {
  get(key: string): { publicKey: string; expiresAt: number } | undefined;
  set(key: string, value: { publicKey: string; expiresAt: number }): void;
}

export class InMemoryEbayPublicKeyCache implements EbayPublicKeyCache {
  private readonly entries = new Map<string, { publicKey: string; expiresAt: number }>();
  get(key: string) {
    return this.entries.get(key);
  }
  set(key: string, value: { publicKey: string; expiresAt: number }) {
    this.entries.set(key, value);
  }
}

const sharedPublicKeyCache = new InMemoryEbayPublicKeyCache();

interface NotificationVerifierConfig {
  environment: EbayEnvironment;
  clientId: string;
  clientSecret: string;
  timeoutMs?: number;
}

interface NotificationVerifierDependencies {
  fetch?: EbayFetch;
  now?: () => number;
  tokenCache?: EbayTokenCache;
  publicKeyCache?: EbayPublicKeyCache;
}

const decodeSignatureHeader = (header: string) => {
  try {
    const binary = atob(header);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return ebayNotificationSignatureHeaderSchema.parse(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
    );
  } catch {
    throw new ConnectorError(
      'eBay notification signature header is invalid.',
      'permanent',
      'EBAY_NOTIFICATION_SIGNATURE_HEADER_INVALID',
    );
  }
};

const normalizePublicKey = (key: string) => {
  const body = key
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\s/g, '');
  if (!body) throw new Error('Empty public key.');
  return `-----BEGIN PUBLIC KEY-----\n${body.match(/.{1,64}/g)?.join('\n')}\n-----END PUBLIC KEY-----`;
};

export class EbayNotificationSignatureVerifier {
  private readonly fetcher: EbayFetch;
  private readonly now: () => number;
  private readonly keyCache: EbayPublicKeyCache;
  private readonly oauth: EbayOAuthClient;

  constructor(
    private readonly config: NotificationVerifierConfig,
    dependencies: NotificationVerifierDependencies = {},
  ) {
    this.fetcher = dependencies.fetch ?? defaultEbayFetch;
    this.now = dependencies.now ?? Date.now;
    this.keyCache = dependencies.publicKeyCache ?? sharedPublicKeyCache;
    this.oauth = new EbayOAuthClient(config, {
      fetch: this.fetcher,
      now: dependencies.now,
      cache: dependencies.tokenCache,
    });
  }

  async verify(rawNotification: unknown, signatureHeader: string): Promise<boolean> {
    ebayAccountDeletionNotificationSchema.parse(rawNotification);
    const decoded = decodeSignatureHeader(signatureHeader);
    const publicKey = await this.getPublicKey(decoded.kid);
    const verifier = createVerify('sha1');
    verifier.update(JSON.stringify(rawNotification));
    verifier.end();
    return verifier.verify(normalizePublicKey(publicKey), decoded.signature, 'base64');
  }

  private async getPublicKey(keyId: string): Promise<string> {
    const cacheKey = `${this.config.environment}:${keyId}`;
    const cached = this.keyCache.get(cacheKey);
    if (cached && cached.expiresAt > this.now()) return cached.publicKey;

    const accessToken = await this.oauth.getAccessToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 8_000);
    try {
      const baseUrl =
        this.config.environment === 'production'
          ? 'https://api.ebay.com'
          : 'https://api.sandbox.ebay.com';
      const response = await this.fetcher(
        `${baseUrl}/commerce/notification/v1/public_key/${encodeURIComponent(keyId)}`,
        {
          headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        },
      );
      const raw = jsonObjectSchema.safeParse(await response.json().catch(() => null));
      const parsed = raw.success
        ? ebayNotificationPublicKeyResponseSchema.safeParse(raw.data)
        : raw;
      if (!response.ok || !parsed.success) {
        throw new ConnectorError(
          'eBay notification public key is unavailable.',
          response.status === 400 || response.status === 404 ? 'permanent' : 'transient',
          'EBAY_NOTIFICATION_PUBLIC_KEY_UNAVAILABLE',
        );
      }
      this.keyCache.set(cacheKey, {
        publicKey: parsed.data.key,
        expiresAt: this.now() + 60 * 60 * 1000,
      });
      return parsed.data.key;
    } catch (cause) {
      if (cause instanceof ConnectorError) throw cause;
      throw new ConnectorError(
        'eBay notification public key request failed.',
        'transient',
        'EBAY_NOTIFICATION_PUBLIC_KEY_UNAVAILABLE',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const toEbayAccountDeletionTask = (notification: EbayAccountDeletionNotification) => ({
  kind: 'ebay-account-deletion' as const,
  version: '1' as const,
  notificationId: notification.notification.notificationId,
  ...notification.notification.data,
});
