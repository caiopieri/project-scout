import { ConnectorError } from '@scout/domain';
import {
  connectorSearchInputSchema,
  type ConnectorSearchInput,
  type ResearchCriteria,
} from '@scout/schemas';
import type { EbayEnvironment } from './oauth';

export const EBAY_MARKETPLACE_CURRENCIES = {
  EBAY_US: 'USD',
  EBAY_AT: 'EUR',
  EBAY_DE: 'EUR',
  EBAY_ES: 'EUR',
  EBAY_FR: 'EUR',
  EBAY_IE: 'EUR',
  EBAY_IT: 'EUR',
  EBAY_NL: 'EUR',
} as const;

export type EbayMarketplaceId = keyof typeof EBAY_MARKETPLACE_CURRENCIES;

export const isEbayMarketplaceId = (value: string): value is EbayMarketplaceId =>
  value in EBAY_MARKETPLACE_CURRENCIES;

const apiBaseUrl = (environment: EbayEnvironment) =>
  environment === 'production' ? 'https://api.ebay.com' : 'https://api.sandbox.ebay.com';

const conditionIds = (criteria: ResearchCriteria): string[] => {
  const ids = new Set<string>();
  for (const condition of criteria.acceptedConditions) {
    if (condition === 'for_repair' || condition === 'parts_only') ids.add('7000');
    if (condition === 'used') ids.add('3000');
    if (condition === 'refurbished')
      ['2000', '2500', '4000', '5000', '6000'].forEach((id) => ids.add(id));
  }
  if (ids.size === 0) ids.add('7000');
  return [...ids];
};

const searchableTerms = (criteria: ResearchCriteria): string[] => {
  const terms = new Set<string>();
  for (const value of [...criteria.brands, ...criteria.models, ...criteria.variants])
    terms.add(value.trim());
  for (const value of criteria.storageGb) terms.add(`${value}GB`);
  for (const value of criteria.memoryGb) terms.add(`${value}GB RAM`);
  for (const value of criteria.additionalKeywords) terms.add(value.trim());
  if (terms.size === 0 && criteria.category)
    terms.add(criteria.category === 'smartphone' ? 'smartphone' : 'laptop');
  return [...terms].filter(Boolean);
};

const normalizeTitle = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/\s+/g, ' ')
    .trim();

const componentOrAccessoryPatterns = [
  /\breplacement\b/,
  /\bdigitizer\b/,
  /\blcd(?: assembly| screen)?\b/,
  /\bdisplay assembly\b/,
  /\bpalm ?rest\b/,
  /\bbezel\b/,
  /\bhousing\b/,
  /\bshell\b/,
  /\b(?:charger|cable|battery|keyboard) only\b/,
  /\bscreen only\b/,
  /\b(?:empty )?box only\b/,
  /\bpartial machine\b/,
];

const categoryTerms: Readonly<Record<string, readonly string[]>> = {
  smartphone: ['smartphone', 'cell phone', 'cellular', 'iphone', 'galaxy'],
  laptop: ['laptop', 'notebook', 'macbook', 'thinkpad', 'latitude', 'elitebook'],
};

const normalizeCriterionTerm = (value: string) => normalizeTitle(value).replace(/_/g, ' ');

/**
 * eBay does not document a negative-keyword operator for Browse `q`.
 * Keep this conservative and title-only: accepted repair listings such as
 * "cracked screen" and "parts only" remain candidates.
 */
export const shouldRejectEbayPreviewTitle = (
  title: string,
  criteria: ResearchCriteria,
): boolean => {
  const normalizedTitle = normalizeTitle(title);
  return (
    criteria.excludedKeywords.some((keyword) =>
      normalizedTitle.includes(normalizeTitle(keyword)),
    ) || componentOrAccessoryPatterns.some((pattern) => pattern.test(normalizedTitle))
  );
};

/**
 * Search results contain enough bounded data for the first screening pass.
 * Details are reserved for previews that survive this source-local gate.
 */
export const shouldFetchEbayPreview = (
  preview: { title: string; price: { amountMinor: number; currency: string } },
  criteria: ResearchCriteria,
): boolean => {
  const title = normalizeTitle(preview.title);
  if (shouldRejectEbayPreviewTitle(preview.title, criteria)) return false;
  if (criteria.rejectedDefects.some((defect) => title.includes(normalizeCriterionTerm(defect))))
    return false;
  if (
    criteria.maximumPrice?.currency === preview.price.currency &&
    preview.price.amountMinor > criteria.maximumPrice.amountMinor
  )
    return false;

  const specificTerms = [...criteria.models, ...criteria.variants];
  const titleTerms = [
    ...(specificTerms.length > 0
      ? specificTerms
      : [
          ...criteria.brands,
          ...(criteria.category ? (categoryTerms[criteria.category] ?? [criteria.category]) : []),
        ]),
  ]
    .map(normalizeCriterionTerm)
    .filter(Boolean);
  return titleTerms.length === 0 || titleTerms.some((term) => title.includes(term));
};

const formatMinorPrice = (amountMinor: number) =>
  `${Math.floor(amountMinor / 100)}.${String(amountMinor % 100).padStart(2, '0')}`;

export interface EbaySearchRequestConfig {
  environment: EbayEnvironment;
  marketplaceId: EbayMarketplaceId;
}

export const buildEbaySearchUrl = (
  rawInput: ConnectorSearchInput,
  config: EbaySearchRequestConfig,
): URL => {
  const input = connectorSearchInputSchema.parse(rawInput);
  const offset = input.cursor === undefined ? 0 : Number(input.cursor);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10_000) {
    throw new ConnectorError('Invalid eBay pagination cursor.', 'permanent', 'EBAY_INVALID_CURSOR');
  }
  const terms = searchableTerms(input.criteria);
  if (terms.length === 0) {
    throw new ConnectorError(
      'The criteria cannot produce an eBay keyword query.',
      'permanent',
      'EBAY_QUERY_EMPTY',
    );
  }

  const filters = [
    'buyingOptions:{FIXED_PRICE}',
    `conditionIds:{${conditionIds(input.criteria).join('|')}}`,
  ];
  const marketplaceCurrency = EBAY_MARKETPLACE_CURRENCIES[config.marketplaceId];
  const maximumPrice = input.criteria.maximumPrice;
  if (maximumPrice?.currency === marketplaceCurrency) {
    filters.push(`price:[..${formatMinorPrice(maximumPrice.amountMinor)}]`);
    filters.push(`priceCurrency:${marketplaceCurrency}`);
  }

  const url = new URL('/buy/browse/v1/item_summary/search', apiBaseUrl(config.environment));
  url.searchParams.set('q', input.query ?? terms.join(' '));
  url.searchParams.set('limit', String(input.limit));
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('fieldgroups', 'EXTENDED');
  url.searchParams.set('filter', filters.join(','));
  return url;
};

export const buildEbayItemUrl = (externalId: string, environment: EbayEnvironment): URL => {
  if (!externalId.trim())
    throw new ConnectorError('eBay item ID is required.', 'permanent', 'EBAY_ITEM_ID_MISSING');
  return new URL(`/buy/browse/v1/item/${encodeURIComponent(externalId)}`, apiBaseUrl(environment));
};

export const parseEbayAmountMinor = (value: string): number => {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match)
    throw new ConnectorError(
      'eBay returned an unsupported monetary value.',
      'permanent',
      'EBAY_INVALID_MONEY',
    );
  const amount = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(amount)) {
    throw new ConnectorError(
      'eBay returned a monetary value outside the supported range.',
      'permanent',
      'EBAY_INVALID_MONEY',
    );
  }
  return amount;
};
