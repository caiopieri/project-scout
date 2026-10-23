import { sourceDocumentSchema, type SourceDocument } from '@scout/schemas';

/**
 * Source-agnostic extraction of schema.org Offers from JSON-LD blocks. It knows no site; a
 * connector adds source-specific fields. Microdata is left to connectors because nested scopes
 * (brand, seller) inside an Offer make generic microdata parsing unreliable. Every price stays
 * in minor units with the declared currency.
 */

const decode = (value: string) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

export const toMinor = (amount: string | number | undefined): number | undefined => {
  if (amount === undefined || amount === '') return undefined;
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(String(amount).trim().replace(/[\s$]/g, ''));
  if (!match) return undefined;
  return Number(match[1]) * 100 + Number((match[2] ?? '0').padEnd(2, '0'));
};

const absolute = (href: string | undefined, baseUrl: string) => {
  if (!href) return undefined;
  try {
    return new URL(decode(href), baseUrl).toString();
  } catch {
    return undefined;
  }
};

type JsonNode = Record<string, unknown>;

const jsonLdOffers = (html: string): JsonNode[] => {
  const nodes: JsonNode[] = [];
  const visit = (value: unknown, parent?: JsonNode) => {
    if (Array.isArray(value)) return value.forEach((item) => visit(item, parent));
    if (!value || typeof value !== 'object') return;
    const node = value as JsonNode;
    const type = ([] as unknown[]).concat(node['@type'] ?? []).map(String);
    if (type.includes('Offer')) nodes.push({ ...node, __parent: parent });
    for (const [key, child] of Object.entries(node))
      if (key !== '__parent') visit(child, type.includes('Product') ? node : parent);
  };
  for (const match of html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      visit(JSON.parse(match[1]));
    } catch {
      // Malformed JSON-LD is common; skip the block instead of failing the page.
    }
  }
  return nodes;
};

export const extractSchemaOrgOffers = (html: string, baseUrl: string): SourceDocument[] => {
  const documents: SourceDocument[] = [];
  for (const node of jsonLdOffers(html)) {
    const parent = (node.__parent ?? {}) as JsonNode;
    const url = absolute(String(node.url ?? parent.url ?? ''), baseUrl);
    const title = String(node.name ?? parent.name ?? '').trim();
    const priceMinor = toMinor(node.price as string | undefined);
    if (!url || !title) continue;
    documents.push(
      sourceDocumentSchema.parse({
        url,
        externalId: String(node.sku ?? parent.sku ?? url).slice(0, 200),
        title: title.slice(0, 500),
        price:
          priceMinor !== undefined && typeof node.priceCurrency === 'string'
            ? { amountMinor: priceMinor, currency: node.priceCurrency }
            : undefined,
        imageUrls: ([] as unknown[])
          .concat(parent.image ?? node.image ?? [])
          .map((image) => absolute(String(image), baseUrl))
          .filter((image): image is string => Boolean(image))
          .slice(0, 20),
        fields: Object.fromEntries(
          [
            ['itemCondition', node.itemCondition],
            ['availability', node.availability],
          ]
            .filter(([, value]) => typeof value === 'string')
            .map(([key, value]) => [
              key as string,
              String(value).replace(/^https?:\/\/schema\.org\//, ''),
            ]),
        ),
        extractedBy: 'schema-org-jsonld-v1',
      }),
    );
  }
  return documents;
};
