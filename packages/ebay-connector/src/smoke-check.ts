import { EbayApiAdapter, type EbayApiAdapterConfig } from './EbayApiAdapter';

export const runEbayConnectionSmoke = async (config: EbayApiAdapterConfig) => {
  const connector = new EbayApiAdapter({ ...config, marketplaceId: 'EBAY_US', maxAttempts: 2 });
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
