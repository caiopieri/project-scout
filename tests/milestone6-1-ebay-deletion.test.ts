import { createHash, createSign, generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../apps/worker/src/index';
import {
  ebayAccountDeletionNotificationSchema,
  ebayAccountDeletionTaskSchema,
} from '@scout/schemas';

const endpoint = 'https://api.example.com/webhooks/ebay/account-deletion';
const verificationToken = '0123456789abcdef0123456789abcdef';
const notification = {
  metadata: {
    topic: 'MARKETPLACE_ACCOUNT_DELETION',
    schemaVersion: '1.0',
    deprecated: false,
  },
  notification: {
    notificationId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    eventDate: '2026-07-29T12:00:00.000Z',
    publishDate: '2026-07-29T12:00:01.000Z',
    publishAttemptCount: 1,
    data: { username: 'privacy-seller', userId: 'immutable-user-id', eiasToken: 'eias-token' },
  },
};

const baseEnv = {
  SUPABASE_URL: 'http://supabase.local',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  EBAY_APP_ID_CLIENT_ID: 'client-id',
  EBAY_CERT_ID_CLIENT_SECRET: 'client-secret',
  EBAY_ACCOUNT_DELETION_ENDPOINT_URL: endpoint,
  EBAY_DELETION_VERIFICATION_TOKEN: verificationToken,
  EBAY_NOTIFICATION_ENVIRONMENT: 'production',
  EBAY_IDENTITY_HASH_SECRET: 'test-only-identity-hash-secret-32-chars',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Marco 6.1 eBay account deletion webhook', () => {
  it('generates the exact challenge response and rejects missing challenges', async () => {
    const valid = await worker.fetch(
      new Request(`${endpoint}?challenge_code=challenge-123`),
      baseEnv as never,
      {} as never,
    );
    expect(valid.status).toBe(200);
    expect(await valid.json()).toEqual({
      challengeResponse: createHash('sha256')
        .update('challenge-123')
        .update(verificationToken)
        .update(endpoint)
        .digest('hex'),
    });
    expect((await worker.fetch(new Request(endpoint), baseEnv as never, {} as never)).status).toBe(
      400,
    );
  });

  it('validates the official ECC header before durably queueing the task', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const signer = createSign('sha1');
    signer.update(JSON.stringify(notification));
    signer.end();
    const signatureHeader = Buffer.from(
      JSON.stringify({ kid: 'key-6-1', signature: signer.sign(privateKey, 'base64') }),
    ).toString('base64');
    const queueSend = vi.fn(async () => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/identity/v1/oauth2/token'))
          return Response.json({ access_token: 'token', expires_in: 7200, token_type: 'Bearer' });
        if (url.includes('/commerce/notification/v1/public_key/key-6-1'))
          return Response.json({
            key: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
          });
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );
    const response = await worker.fetch(
      new Request(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ebay-signature': signatureHeader },
        body: JSON.stringify(notification),
      }),
      { ...baseEnv, EBAY_DELETION_QUEUE: { send: queueSend } } as never,
      {} as never,
    );
    expect(response.status).toBe(204);
    expect(queueSend).toHaveBeenCalledWith({
      kind: 'ebay-account-deletion',
      version: '1',
      notificationId: notification.notification.notificationId,
      ...notification.notification.data,
    });
  });

  it('fails closed for malformed signatures and invalid external payloads', async () => {
    const malformedSignature = await worker.fetch(
      new Request(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ebay-signature': 'not-base64' },
        body: JSON.stringify(notification),
      }),
      { ...baseEnv, EBAY_DELETION_QUEUE: { send: vi.fn() } } as never,
      {} as never,
    );
    expect(malformedSignature.status).toBe(412);
    const invalidPayload = structuredClone(notification) as typeof notification;
    invalidPayload.notification.data = {} as typeof notification.notification.data;
    expect(
      (
        await worker.fetch(
          new Request(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-ebay-signature': 'unused' },
            body: JSON.stringify(invalidPayload),
          }),
          baseEnv as never,
          {} as never,
        )
      ).status,
    ).toBe(422);
  });
});

describe('Marco 6.1 deletion consumer and schema', () => {
  it('deletes R2 objects before finalizing PostgreSQL and acknowledges the task', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/rpc/prepare_ebay_account_deletion')) {
          calls.push('prepare');
          return Response.json([
            {
              already_completed: false,
              raw_object_keys: ['raw/one.json'],
              image_object_keys: ['images/one.jpg'],
              matched_sellers: 1,
              matched_listings: 1,
            },
          ]);
        }
        if (url.includes('/rpc/finalize_ebay_account_deletion')) {
          calls.push('finalize');
          return Response.json([{ completed: true, matched_sellers: 1, matched_listings: 1 }]);
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );
    const rawDelete = vi.fn(async () => calls.push('raw'));
    const rawList = vi.fn(async () => ({ objects: [], truncated: false }));
    const imageDelete = vi.fn(async () => calls.push('image'));
    const ack = vi.fn();
    const retry = vi.fn();
    const task = ebayAccountDeletionTaskSchema.parse({
      kind: 'ebay-account-deletion',
      version: '1',
      notificationId: notification.notification.notificationId,
      username: 'privacy-seller',
    });
    await worker.queue(
      { messages: [{ body: task, ack, retry }] } as never,
      {
        ...baseEnv,
        RAW_BUCKET: { delete: rawDelete, list: rawList },
        IMAGE_BUCKET: { delete: imageDelete },
      } as never,
    );
    expect(calls).toEqual(['prepare', 'raw', 'image', 'finalize']);
    expect(rawList).toHaveBeenCalledOnce();
    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
  });

  it('rejects a deletion task without an account identifier', () => {
    expect(() =>
      ebayAccountDeletionNotificationSchema.parse({
        ...notification,
        notification: { ...notification.notification, data: {} },
      }),
    ).toThrow();
  });

  it('acknowledges an already completed notification without touching storage again', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        if (String(input).includes('/rpc/prepare_ebay_account_deletion'))
          return Response.json([
            {
              already_completed: true,
              raw_object_keys: [],
              image_object_keys: [],
              matched_sellers: 1,
              matched_listings: 2,
            },
          ]);
        throw new Error(`Unexpected fetch: ${String(input)}`);
      }),
    );
    const ack = vi.fn();
    const retry = vi.fn();
    const deleteObject = vi.fn();
    await worker.queue(
      {
        messages: [
          {
            body: {
              kind: 'ebay-account-deletion',
              version: '1',
              notificationId: notification.notification.notificationId,
              username: 'privacy-seller',
            },
            ack,
            retry,
          },
        ],
      } as never,
      {
        ...baseEnv,
        RAW_BUCKET: { delete: deleteObject },
        IMAGE_BUCKET: { delete: deleteObject },
      } as never,
    );
    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('retries instead of acknowledging when durable deletion infrastructure fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    const ack = vi.fn();
    const retry = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await worker.queue(
      {
        messages: [
          {
            body: {
              kind: 'ebay-account-deletion',
              version: '1',
              notificationId: notification.notification.notificationId,
              username: 'privacy-seller',
            },
            ack,
            retry,
          },
        ],
      } as never,
      { ...baseEnv, RAW_BUCKET: {}, IMAGE_BUCKET: {} } as never,
    );
    expect(ack).not.toHaveBeenCalled();
    expect(retry).toHaveBeenCalledWith({ delaySeconds: 30 });
  });

  it('keeps the audit table free of eBay account identifiers and locks it to service role', () => {
    const migration = fs.readFileSync(
      path.join(
        process.cwd(),
        'supabase/migrations/20260729172535_milestone6_1_ebay_account_deletion.sql',
      ),
      'utf8',
    );
    const tableDefinition = migration.slice(
      migration.indexOf('CREATE TABLE public.ebay_account_deletion_requests'),
      migration.indexOf('ALTER TABLE public.ebay_account_deletion_requests'),
    );
    expect(tableDefinition).not.toMatch(/username|user_id|eias_token/i);
    expect(migration).toContain(
      'ALTER TABLE public.ebay_account_deletion_requests ENABLE ROW LEVEL SECURITY',
    );
    expect(migration).toContain('FROM PUBLIC, anon, authenticated');
    expect(migration).toContain('TO service_role');
  });
});

describe('Marco 6.1 live PostgreSQL privacy deletion', () => {
  it('restricts RPCs, preserves minimal audit and deletes seller/listing idempotently', async (ctx) => {
    const client = new Client({
      connectionString:
        process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:54322/postgres',
    });
    try {
      await client.connect();
    } catch {
      ctx.skip();
      return;
    }
    const suffix = crypto.randomUUID();
    const sellerExternalId = `privacy-${suffix}`;
    const listingExternalId = `listing-${suffix}`;
    const notificationId = `notification-${suffix}`;
    try {
      const seller = await client.query(
        `INSERT INTO sellers (source_id, external_id, name)
         VALUES ('00000000-0000-4000-a000-000000000001', $1, $1) RETURNING id`,
        [sellerExternalId],
      );
      const listing = await client.query(
        `INSERT INTO listings (
           source_id, external_id, url, title, description, condition, currency, price,
           shipping_cost, total_visible_cost, seller_id, status, raw_data_path
         ) VALUES (
           '00000000-0000-4000-a000-000000000001', $1, 'https://www.ebay.com/itm/privacy',
           'Privacy fixture', 'fixture', 'For parts', 'USD', 1, 0, 1, $2, 'active', $3
         ) RETURNING id`,
        [listingExternalId, seller.rows[0].id, `raw/ebay/${listingExternalId}/hash.json`],
      );
      await client.query(
        `INSERT INTO listing_snapshots (
           listing_id, title, price, shipping_cost, status, raw_object_key, raw_content_hash
         ) VALUES ($1, 'Privacy fixture', 1, 0, 'active', $2, repeat('a', 64))`,
        [listing.rows[0].id, `raw/ebay/${listingExternalId}/snapshot.json`],
      );

      await client.query('SET ROLE authenticated');
      await expect(
        client.query(`SELECT * FROM prepare_ebay_account_deletion($1,$2,NULL,NULL)`, [
          notificationId,
          sellerExternalId,
        ]),
      ).rejects.toThrow();
      await expect(client.query('SELECT * FROM ebay_account_deletion_requests')).rejects.toThrow();
      await client.query('RESET ROLE');
      await client.query('SET ROLE service_role');
      const prepared = await client.query(
        `SELECT * FROM prepare_ebay_account_deletion($1,$2,NULL,NULL)`,
        [notificationId, sellerExternalId],
      );
      expect(prepared.rows[0].already_completed).toBe(false);
      expect(prepared.rows[0].matched_sellers).toBe(1);
      expect(prepared.rows[0].matched_listings).toBe(1);
      expect(prepared.rows[0].raw_object_keys).toHaveLength(2);
      await client.query(`SELECT * FROM finalize_ebay_account_deletion($1,$2,NULL,NULL)`, [
        notificationId,
        sellerExternalId,
      ]);
      expect(
        (
          await client.query(
            `SELECT already_completed FROM prepare_ebay_account_deletion($1,$2,NULL,NULL)`,
            [notificationId, sellerExternalId],
          )
        ).rows[0].already_completed,
      ).toBe(true);
      await client.query('RESET ROLE');
      expect(
        (await client.query('SELECT id FROM sellers WHERE id=$1', [seller.rows[0].id])).rows,
      ).toHaveLength(0);
      expect(
        (await client.query('SELECT id FROM listings WHERE id=$1', [listing.rows[0].id])).rows,
      ).toHaveLength(0);
      const audit = await client.query(
        `SELECT status, attempt_count, completed_at FROM ebay_account_deletion_requests WHERE notification_id=$1`,
        [notificationId],
      );
      expect(audit.rows[0]).toMatchObject({ status: 'completed', attempt_count: 2 });
      expect(audit.rows[0].completed_at).toBeTruthy();
    } finally {
      await client.query('RESET ROLE').catch(() => undefined);
      await client.end();
    }
  });
});
