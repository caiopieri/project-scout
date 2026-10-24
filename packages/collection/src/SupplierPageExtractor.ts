import type { PriceTier, SupplierContact, SupplierLevel } from '@scout/schemas';
import { toMinor } from './SchemaOrgExtractor';

/**
 * Generic supplier extraction from a public page: the seller (schema.org Organization or a Store
 * type, with ContactPoint email/telephone), its offers (Product/Offer; quantity tiers only when
 * the page declares `eligibleQuantity`), and authorized-channel claims quoted from the page text.
 * Nothing is inferred from layout; what the page does not state stays absent.
 */

type JsonNode = Record<string, unknown>;

const SELLER_TYPES = [
  'Organization',
  'OnlineStore',
  'Store',
  'ElectronicsStore',
  'LocalBusiness',
  'Corporation',
];

const types = (node: JsonNode) => ([] as unknown[]).concat(node['@type'] ?? []).map(String);

const jsonLdNodes = (html: string) => {
  const nodes: JsonNode[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    nodes.push(value as JsonNode);
    for (const child of Object.values(value as JsonNode))
      if (child && typeof child === 'object') visit(child);
  };
  for (const match of html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      visit(JSON.parse(match[1]));
    } catch {
      // Skip malformed blocks.
    }
  }
  return nodes;
};

const text = (html: string) =>
  html
    .replace(/<(script|style|svg|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

const CLAIMS: Array<{ pattern: RegExp; claim: string; level: SupplierLevel }> = [
  {
    pattern: /\b(?:official\s+)?[\w\s-]{0,30}approved reseller\b/i,
    claim: 'approved reseller',
    level: 'reseller',
  },
  {
    pattern: /\bauthori[sz]ed (?:reseller|retailer|dealer)\b/i,
    claim: 'authorized reseller',
    level: 'reseller',
  },
  {
    pattern: /\bauthori[sz]ed distributor\b|\bfranchised distributor\b/i,
    claim: 'authorized distributor',
    level: 'distributor',
  },
  {
    pattern: /\b(?:original )?manufacturer\b(?! warranty)|\bfactory direct\b|\bOEM\b/i,
    claim: 'manufacturer',
    level: 'factory',
  },
];

export interface ExtractedSupplierPage {
  name: string | null;
  website: string;
  contacts: SupplierContact[];
  claims: Array<{ claim: string; evidence: string; level: SupplierLevel }>;
  offers: Array<{
    title: string;
    sku?: string;
    currency: string;
    tiers: PriceTier[];
    declaredMinimum: number | null;
    url?: string;
  }>;
}

export const extractSupplierPage = (html: string, pageUrl: string): ExtractedSupplierPage => {
  const nodes = jsonLdNodes(html);
  const page = new URL(pageUrl);
  const seller = nodes.find((node) => types(node).some((type) => SELLER_TYPES.includes(type)));
  const contacts: SupplierContact[] = [];
  const addContact = (kind: SupplierContact['kind'], value: unknown) => {
    const clean = typeof value === 'string' ? value.trim().replace(/^mailto:/i, '') : '';
    if (
      clean.length >= 3 &&
      !contacts.some((contact) => contact.kind === kind && contact.value === clean)
    )
      contacts.push({ kind, value: clean.slice(0, 300) });
  };
  for (const node of nodes.filter(
    (candidate) => types(candidate).includes('ContactPoint') || candidate === seller,
  )) {
    addContact('email', node.email);
    addContact('phone', node.telephone);
  }
  for (const match of html.matchAll(/href=["']mailto:([^"'?]+)/gi)) addContact('email', match[1]);

  const plain = text(html);
  const claims = CLAIMS.flatMap(({ pattern, claim, level }) => {
    const match = pattern.exec(plain);
    return match
      ? [
          {
            claim,
            level,
            evidence: plain
              .slice(Math.max(0, match.index - 60), match.index + match[0].length + 60)
              .trim(),
          },
        ]
      : [];
  }).filter(
    (claim) =>
      claim.claim !== 'manufacturer' ||
      /\b(we are|we're) (?:the )?(?:original )?manufacturer/i.test(claim.evidence),
  );

  const offers: ExtractedSupplierPage['offers'] = [];
  for (const product of nodes.filter((node) => types(node).includes('Product'))) {
    const name = typeof product.name === 'string' ? product.name.trim() : null;
    if (!name) continue;
    const productOffers = ([] as unknown[])
      .concat(product.offers ?? [])
      .filter((offer): offer is JsonNode => Boolean(offer) && typeof offer === 'object');
    const declared = productOffers.filter((offer) => types(offer).includes('Offer'));
    const withQuantity = declared.filter((offer) => {
      const eligible = offer.eligibleQuantity as JsonNode | undefined;
      return eligible && (eligible.minValue !== undefined || eligible.value !== undefined);
    });
    if (withQuantity.length) {
      // Quantity tiers declared by the page itself.
      const tiers = withQuantity
        .map((offer) => {
          const eligible = offer.eligibleQuantity as JsonNode;
          return {
            minQuantity: Number(eligible.minValue ?? eligible.value),
            unitPriceMinor: toMinor(offer.price as string) ?? NaN,
          };
        })
        .filter(
          (tier) =>
            Number.isInteger(tier.minQuantity) &&
            tier.minQuantity >= 1 &&
            Number.isFinite(tier.unitPriceMinor),
        )
        .sort((left, right) => left.minQuantity - right.minQuantity);
      const currency = String(withQuantity[0].priceCurrency ?? '').toUpperCase();
      if (tiers.length && /^[A-Z]{3}$/.test(currency))
        offers.push({
          title: name,
          currency,
          tiers,
          declaredMinimum: tiers[0].minQuantity,
          url: pageUrl,
        });
      continue;
    }
    // Plain offers: one per variant (different SKU), each a single price with no declared minimum.
    for (const offer of declared) {
      const price = toMinor(offer.price as string);
      const currency = String(offer.priceCurrency ?? '').toUpperCase();
      if (price === undefined || !/^[A-Z]{3}$/.test(currency)) continue;
      const sku = typeof offer.sku === 'string' ? offer.sku : undefined;
      offers.push({
        title: declared.length > 1 && sku ? `${name} (${sku})` : name,
        ...(sku ? { sku } : {}),
        currency,
        tiers: [{ minQuantity: 1, unitPriceMinor: price }],
        declaredMinimum: null,
        url: typeof offer.url === 'string' ? offer.url : pageUrl,
      });
    }
  }
  return {
    name: typeof seller?.name === 'string' ? seller.name.trim() : null,
    website: typeof seller?.url === 'string' ? new URL(seller.url, page).origin : page.origin,
    contacts,
    claims,
    offers,
  };
};
