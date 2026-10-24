import type { ExtractedSupplierPage } from '@scout/collection';
import type { SupplierContactVerification } from '@scout/database/suppliers';
import { checkContact } from '@scout/domain';
import type { SupplierContact, SupplierInput, SupplierLevel } from '@scout/schemas';

const DOH_URL = 'https://cloudflare-dns.com/dns-query';

/**
 * Verifies contacts without contacting anyone: format, whether an e-mail or URL belongs to the
 * supplier's own website, and whether the e-mail domain receives mail (MX lookup over DNS-over-
 * HTTPS). A failed lookup is recorded as unknown (null), never as verified.
 */
export const verifyContacts = async (
  contacts: SupplierContact[],
  website: string | undefined,
  fetcher: typeof fetch = fetch,
) => {
  const verifications = new Map<string, SupplierContactVerification>();
  const mx = new Map<string, boolean | null>();
  for (const contact of contacts) {
    const check = checkContact(contact.kind, contact.value, website);
    let mailExchange: boolean | null = null;
    if (contact.kind === 'email' && check.format && check.domain) {
      if (!mx.has(check.domain)) {
        try {
          const response = await fetcher(
            `${DOH_URL}?name=${encodeURIComponent(check.domain)}&type=MX`,
            {
              headers: { accept: 'application/dns-json' },
            },
          );
          const body = (await response.json()) as {
            Status?: number;
            Answer?: Array<{ type: number }>;
          };
          mx.set(
            check.domain,
            body.Status === 0 ? Boolean(body.Answer?.some((answer) => answer.type === 15)) : false,
          );
        } catch {
          mx.set(check.domain, null);
        }
      }
      mailExchange = mx.get(check.domain) ?? null;
    }
    verifications.set(`${contact.kind}:${contact.value}`, {
      format: check.format,
      domainMatchesWebsite: check.domainMatchesWebsite,
      mailExchange,
      checkedAt: new Date().toISOString(),
    });
  }
  return verifications;
};

/**
 * Turns an extracted page into a supplier for one product. The level comes from the user or from
 * a claim quoted on the page; without either it is refused. A retail storefront with no declared
 * minimum sells single units, which is recorded as an assumption, not a stated MOQ.
 */
export const supplierFromPage = (
  page: ExtractedSupplierPage,
  productKey: string,
  pageUrl: string,
  level?: SupplierLevel,
  sku?: string,
): SupplierInput | { error: string } => {
  const chosen = level ?? page.claims[0]?.level;
  const offers = sku ? page.offers.filter((offer) => offer.sku === sku) : page.offers;
  if (sku && page.offers.length && !offers.length)
    return { error: `This page does not offer SKU ${sku}.` };
  // A contact page with no e-mail or phone is still a channel: its form, on the supplier's site.
  const contacts =
    /\/(?:pages\/)?contact/i.test(new URL(pageUrl).pathname) &&
    !page.contacts.some((contact) => contact.kind !== 'url')
      ? [...page.contacts, { kind: 'url' as const, value: pageUrl }]
      : page.contacts;
  if (!chosen)
    return { error: 'Say which level of the chain this supplier is; the page claims none.' };
  if (!page.name && !offers.length && !contacts.length)
    return { error: 'The page declares no seller, offer or contact in structured data.' };
  return {
    name: page.name ?? new URL(page.website).hostname,
    website: page.website,
    level: chosen,
    claims: page.claims.map(({ claim, evidence }) => ({ claim, evidence: evidence.slice(0, 500) })),
    contacts,
    offers: offers.map((offer) => ({
      productKey,
      title: offer.title.slice(0, 300),
      ...(offer.sku ? { sku: offer.sku } : {}),
      currency: offer.currency,
      tiers: offer.tiers,
      moq:
        offer.declaredMinimum !== null
          ? {
              value: offer.declaredMinimum,
              origin: 'stated' as const,
              basis: 'lowest quantity tier declared by the page',
            }
          : chosen === 'reseller'
            ? {
                value: 1,
                origin: 'assumed' as const,
                basis: 'retail storefront with no minimum shown',
              }
            : { value: null, origin: 'unknown' as const, basis: 'no minimum declared' },
      sourceUrl: offer.url ?? pageUrl,
    })),
    origin: 'extracted',
  };
};
