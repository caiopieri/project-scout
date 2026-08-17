import { ConnectorError } from '@scout/domain';
import {
  EbayNotificationSignatureVerifier,
  generateEbayChallengeResponse,
  toEbayAccountDeletionTask,
} from '@scout/ebay-connector';
import { ebayAccountDeletionNotificationSchema } from '@scout/schemas';
import type { Env } from './env';

export const EBAY_ACCOUNT_DELETION_PATH = '/webhooks/ebay/account-deletion';
const MAX_BODY_BYTES = 64 * 1024;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,80}$/;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

const logAcceptanceFailure = (stage: 'signature' | 'queue', error: unknown) =>
  console.error(
    'eBay deletion notification acceptance failed',
    stage,
    error instanceof ConnectorError ? error.code : 'UNEXPECTED_ERROR',
  );

const configuration = (env: Env) => {
  const endpointUrl = env.EBAY_ACCOUNT_DELETION_ENDPOINT_URL;
  const verificationToken = env.EBAY_DELETION_VERIFICATION_TOKEN;
  if (!endpointUrl || !verificationToken || !TOKEN_PATTERN.test(verificationToken)) return null;
  try {
    const endpoint = new URL(endpointUrl);
    if (endpoint.protocol !== 'https:' || endpoint.pathname !== EBAY_ACCOUNT_DELETION_PATH)
      return null;
    if (endpoint.search || endpoint.hash) return null;
    return { endpointUrl, verificationToken };
  } catch {
    return null;
  }
};

export async function handleEbayAccountDeletionWebhook(
  request: Request,
  env: Env,
): Promise<Response> {
  const config = configuration(env);
  if (!config) return json({ error: 'Webhook is not configured.' }, 503);

  if (request.method === 'GET') {
    const challengeCode = new URL(request.url).searchParams.get('challenge_code');
    if (!challengeCode || challengeCode.length > 256)
      return json({ error: 'Missing or invalid challenge_code.' }, 400);
    return json(
      {
        challengeResponse: generateEbayChallengeResponse(
          challengeCode,
          config.verificationToken,
          config.endpointUrl,
        ),
      },
      200,
    );
  }
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
  const notification = ebayAccountDeletionNotificationSchema.safeParse(raw);
  if (!notification.success) return json({ error: 'Invalid notification payload.' }, 422);
  const signature = request.headers.get('x-ebay-signature');
  if (!signature) return json({ error: 'Notification signature is required.' }, 412);
  if (!env.EBAY_APP_ID_CLIENT_ID || !env.EBAY_CERT_ID_CLIENT_SECRET)
    return json({ error: 'Signature verification is unavailable.' }, 503);

  const verifier = new EbayNotificationSignatureVerifier({
    environment: env.EBAY_NOTIFICATION_ENVIRONMENT ?? 'production',
    clientId: env.EBAY_APP_ID_CLIENT_ID,
    clientSecret: env.EBAY_CERT_ID_CLIENT_SECRET,
  });
  try {
    if (!(await verifier.verify(raw, signature)))
      return json({ error: 'Invalid notification signature.' }, 412);
  } catch (error) {
    logAcceptanceFailure('signature', error);
    if (error instanceof ConnectorError && error.kind === 'permanent')
      return json({ error: 'Invalid notification signature.' }, 412);
    return json({ error: 'Notification could not be accepted.' }, 503);
  }

  try {
    await env.EBAY_DELETION_QUEUE.send(toEbayAccountDeletionTask(notification.data));
    return new Response(null, { status: 204 });
  } catch (error) {
    logAcceptanceFailure('queue', error);
    return json({ error: 'Notification could not be accepted.' }, 503);
  }
}
