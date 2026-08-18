import { EbayApiAdapter, parseEbayBrowseBudget, type EbayApiAdapterConfig } from './EbayApiAdapter';

export const runEbayConnectionSmoke = async (config: EbayApiAdapterConfig) => {
  const browseBudget = parseEbayBrowseBudget(config.maxBrowseRequests);
  if (browseBudget === undefined) {
    throw new Error('EBAY_BROWSE_BUDGET_CONFIGURATION_MISSING');
  }
  const connector = new EbayApiAdapter({
    ...config,
    marketplaceId: 'EBAY_US',
    maxAttempts: 2,
    maxBrowseRequests: browseBudget,
  });
  const result = await connector.search({
    criteria: {
      category: 'smartphone',
      brands: ['Apple'],
      models: ['iPhone 13'],
      variants: [],
      storageGb: [128],
      memoryGb: [],
      acceptedDefects: ['cracked_screen'],
      rejectedDefects: [],
      acceptedConditions: ['for_repair'],
      countries: [],
      regions: [],
      requiredFunctionalStates: [],
      preferredEvidence: [],
      additionalKeywords: [],
      excludedKeywords: [],
    },
    limit: 1,
  });
  return {
    provider: connector.provider,
    marketplaceId: connector.marketplaceId,
    itemCount: result.items.length,
  };
};
