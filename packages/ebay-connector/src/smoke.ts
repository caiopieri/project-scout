import { resolve } from 'node:path';
import { ConnectorError } from '@scout/domain';
import { readDotenvValue, readOptionalTextFile } from './setup-config';
import { runEbayConnectionSmoke } from './smoke-check';

const localVarsPath = resolve(process.cwd(), 'apps', 'worker', '.dev.vars');

const main = async () => {
  const localVars = await readOptionalTextFile(localVarsPath);
  const value = (key: string) => process.env[key] ?? readDotenvValue(localVars, key);
  const mode = value('EBAY_CONNECTOR_MODE');
  const clientId = value('EBAY_APP_ID_CLIENT_ID');
  const clientSecret = value('EBAY_CERT_ID_CLIENT_SECRET');

  if ((mode !== 'sandbox' && mode !== 'production') || !clientId || !clientSecret) {
    console.log(
      'SKIPPED: set EBAY_CONNECTOR_MODE=sandbox|production and server-side eBay credentials.',
    );
    return;
  }
  const result = await runEbayConnectionSmoke({
    environment: mode,
    clientId,
    clientSecret,
  });
  console.log(
    `OK: provider=${result.provider} marketplace=${result.marketplaceId} items=${result.itemCount}`,
  );
};

void main().catch((error: unknown) => {
  console.error(
    error instanceof ConnectorError
      ? `FAILED: ${error.code}`
      : 'FAILED: unexpected smoke-test error',
  );
  process.exitCode = 1;
});
