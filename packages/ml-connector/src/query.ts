import { ConnectorError } from '@scout/domain';
import {
  connectorSearchInputSchema,
  type ConnectorSearchInput,
  type ResearchCriteria,
} from '@scout/schemas';

export type MercadoLivreSiteId = 'MLB';

const apiBaseUrl = 'https://api.mercadolibre.com';

const searchableTerms = (criteria: ResearchCriteria): string[] => {
  const terms = new Set<string>();
  for (const value of [...criteria.brands, ...criteria.models, ...criteria.variants]) {
    terms.add(value.trim());
  }
  for (const value of criteria.storageGb) terms.add(`${value}GB`);
  for (const value of criteria.memoryGb) terms.add(`${value}GB RAM`);
  for (const value of criteria.additionalKeywords) terms.add(value.trim());
  if (terms.size === 0 && criteria.category) {
    terms.add(criteria.category === 'smartphone' ? 'smartphone' : 'notebook');
  }
  return [...terms].filter(Boolean);
};

export const buildMercadoLivreSearchUrl = (
  rawInput: ConnectorSearchInput,
  siteId: MercadoLivreSiteId = 'MLB',
): URL => {
  const input = connectorSearchInputSchema.parse(rawInput);
  const offset = input.cursor === undefined ? 0 : Number(input.cursor);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10_000) {
    throw new ConnectorError(
      'Invalid Mercado Livre pagination cursor.',
      'permanent',
      'ML_INVALID_CURSOR',
    );
  }
  const terms = searchableTerms(input.criteria);
  if (terms.length === 0) {
    throw new ConnectorError(
      'The criteria cannot produce a Mercado Livre keyword query.',
      'permanent',
      'ML_QUERY_EMPTY',
    );
  }

  const url = new URL(`/sites/${siteId}/search`, apiBaseUrl);
  url.searchParams.set('q', input.query ?? terms.join(' '));
  url.searchParams.set('limit', String(input.limit));
  url.searchParams.set('offset', String(offset));
  if (input.criteria.maximumPrice?.currency === 'BRL') {
    url.searchParams.set('price', `until_${input.criteria.maximumPrice.amountMinor / 100}`);
  }
  return url;
};

export const buildMercadoLivreItemUrl = (externalId: string): URL => {
  if (!/^ML[A-Z][A-Z0-9-]+$/.test(externalId)) {
    throw new ConnectorError(
      'Mercado Livre item ID is invalid.',
      'permanent',
      'ML_ITEM_ID_INVALID',
    );
  }
  return new URL(`/items/${encodeURIComponent(externalId)}`, apiBaseUrl);
};

export const parseMercadoLivreAmountMinor = (value: number): number => {
  if (!Number.isFinite(value) || value < 0) {
    throw new ConnectorError(
      'Mercado Livre returned an unsupported monetary value.',
      'permanent',
      'ML_INVALID_MONEY',
    );
  }
  const amountMinor = Math.round(value * 100);
  if (!Number.isSafeInteger(amountMinor)) {
    throw new ConnectorError(
      'Mercado Livre returned a monetary value outside the supported range.',
      'permanent',
      'ML_INVALID_MONEY',
    );
  }
  return amountMinor;
};
