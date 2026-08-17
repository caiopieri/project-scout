import type { RawListingObjectStore } from '@scout/domain';
import { jsonValueSchema, rawObjectReferenceSchema } from '@scout/schemas';

const canonicalJson = (value: ReturnType<typeof jsonValueSchema.parse>): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(',')}}`;
};

const sha256 = async (content: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const ebaySellerRawPrefix = async (sellerExternalId: string, identityHashSecret: string) => {
  if (identityHashSecret.length < 32) throw new Error('eBay identity hash secret is invalid.');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(identityHashSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(sellerExternalId.trim()),
  );
  const hash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `raw/ebay/by-seller/${hash}/`;
};

export class R2RawListingObjectStore implements RawListingObjectStore {
  constructor(
    private readonly bucket: R2Bucket,
    private readonly identityHashSecret: string,
  ) {}

  async put(record: Parameters<RawListingObjectStore['put']>[0]) {
    const jsonCompatible = JSON.parse(JSON.stringify(record)) as unknown;
    const content = canonicalJson(jsonValueSchema.parse(jsonCompatible));
    const contentHash = await sha256(content);
    const prefix = record.preview.sellerExternalId
      ? await ebaySellerRawPrefix(record.preview.sellerExternalId, this.identityHashSecret)
      : 'raw/ebay/unattributed/';
    const key = `${prefix}${encodeURIComponent(record.preview.externalId)}/${contentHash}.json`;
    await this.bucket.put(key, content, {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
    });
    return rawObjectReferenceSchema.parse({
      key,
      contentHash,
      schemaVersion: 'ebay-raw-v1',
    });
  }
}
