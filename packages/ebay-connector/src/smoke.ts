import { ConnectorError } from '@scout/domain';
import { parseEbayBrowseBudget } from './EbayApiAdapter';
import { runEbayConnectionSmoke } from './smoke-check';

const mode = process.env.EBAY_CONNECTOR_MODE;
const clientId = process.env.EBAY_APP_ID_CLIENT_ID;
const clientSecret = process.env.EBAY_CERT_ID_CLIENT_SECRET;
const browseBudget = parseEbayBrowseBudget(process.env.EBAY_BROWSE_BUDGET_PER_RUN);

const main = async () => {
  if ((mode !== 'sandbox' && mode !== 'production') || !clientId || !clientSecret) {
    console.log(
      'SKIPPED: set EBAY_CONNECTOR_MODE=sandbox|production and server-side eBay credentials.',
    );
    return;
  }
  if (browseBudget === undefined) {
    console.error('FAILED: EBAY_BROWSE_BUDGET_CONFIGURATION_MISSING');
    process.exitCode = 1;
    return;
  }
  const result = await runEbayConnectionSmoke({
    environment: mode,
    clientId,
    clientSecret,
    maxBrowseRequests: browseBudget,
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
