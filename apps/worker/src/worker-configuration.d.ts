// Generated from apps/worker/wrangler.toml with:
// npx wrangler types src/worker-configuration.d.ts --env-interface CloudflareBindings
interface CloudflareBindings {
  SCOUT_CACHE: KVNamespace;
  EBAY_RATE_LIMITER: DurableObjectNamespace;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  WEB_ORIGIN: string;
  EBAY_CONNECTOR_MODE: string;
  EBAY_MARKETPLACE_ID: string;
  EBAY_APP_ID_CLIENT_ID: string;
  EBAY_CERT_ID_CLIENT_SECRET: string;
  EBAY_ACCOUNT_DELETION_ENDPOINT_URL: string;
  EBAY_DELETION_VERIFICATION_TOKEN: string;
  EBAY_NOTIFICATION_ENVIRONMENT: string;
  EBAY_IDENTITY_HASH_SECRET: string;
  PUBLIC_API_ENABLED: string;
  IMAGE_BUCKET: R2Bucket;
  RAW_BUCKET: R2Bucket;
  COLLECT_QUEUE: Queue;
  EBAY_DELETION_QUEUE: Queue;
  ANALYSIS_QUEUE: Queue;
}
