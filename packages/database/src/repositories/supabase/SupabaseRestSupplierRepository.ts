import type { LadderOffer } from '@scout/domain';
import type { SupplierInput } from '@scout/schemas';
import type { SupabaseRestConfig } from './SupabaseRestResearchProjectRepository';

export interface SupplierContactVerification {
  format: boolean;
  domainMatchesWebsite: boolean | null;
  mailExchange: boolean | null;
  checkedAt: string;
}

interface SupplierRow {
  id: string;
  name: string;
  website: string | null;
  level: LadderOffer['level'];
  country: string | null;
  claims: Array<{ claim: string; evidence: string }>;
  origin: string;
  supplier_contacts: Array<{
    kind: string;
    value: string;
    verification: SupplierContactVerification | null;
  }>;
  supplier_offers: Array<{
    product_key: string;
    title: string;
    sku: string | null;
    currency: string;
    tiers: LadderOffer['tiers'];
    moq: LadderOffer['moq'];
    lead_time_days: number | null;
    incoterm: string | null;
    source_url: string | null;
  }>;
}

const identityOf = (input: Pick<SupplierInput, 'website' | 'name'>) =>
  input.website
    ? new URL(input.website).hostname.replace(/^www\./, '').toLowerCase()
    : `name:${input.name.trim().toLowerCase()}`;

/**
 * Verified needs positive evidence: an e-mail on the supplier's own domain that receives mail, or
 * a URL on its own site. A phone can only be checked for format without calling it.
 */
const contactStatus = (
  kind: string,
  verification: SupplierContactVerification | null,
): 'verified' | 'format_only' | 'unverified' => {
  if (!verification?.format) return 'unverified';
  if (kind === 'email')
    return verification.domainMatchesWebsite === true && verification.mailExchange === true
      ? 'verified'
      : 'unverified';
  if (kind === 'url') return verification.domainMatchesWebsite === true ? 'verified' : 'unverified';
  return 'format_only';
};

/** Suppliers, contacts and offers, owner-scoped through the user's token (RLS). */
export class SupabaseRestSupplierRepository {
  constructor(private readonly config: SupabaseRestConfig) {}

  /** Upserts the supplier (by website or name), its contacts and its offers. */
  async save(
    userId: string,
    input: SupplierInput,
    verifications: Map<string, SupplierContactVerification>,
  ) {
    const [supplier] = await this.request<Array<{ id: string }>>(
      'suppliers?on_conflict=user_id,identity&select=id',
      {
        method: 'POST',
        headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
        body: JSON.stringify({
          user_id: userId,
          name: input.name,
          website: input.website ?? null,
          identity: identityOf(input),
          level: input.level,
          country: input.country ?? null,
          claims: input.claims,
          origin: input.origin,
          updated_at: new Date().toISOString(),
        }),
      },
    );
    if (input.contacts.length)
      await this.request('supplier_contacts?on_conflict=supplier_id,kind,value', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(
          input.contacts.map((contact) => ({
            supplier_id: supplier.id,
            kind: contact.kind,
            value: contact.value,
            verification: verifications.get(`${contact.kind}:${contact.value}`) ?? null,
          })),
        ),
      });
    if (input.offers.length)
      await this.request('supplier_offers?on_conflict=supplier_id,product_key,sku', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(
          input.offers.map((offer) => ({
            supplier_id: supplier.id,
            product_key: offer.productKey,
            title: offer.title,
            sku: offer.sku ?? null,
            currency: offer.currency,
            tiers: offer.tiers,
            moq: offer.moq,
            lead_time_days: offer.leadTimeDays ?? null,
            incoterm: offer.incoterm ?? null,
            ship_from: offer.shipFrom ?? null,
            source_url: offer.sourceUrl ?? null,
            evidence: offer.evidence ?? null,
            observed_at: new Date().toISOString(),
          })),
        ),
      });
    return supplier.id;
  }

  /** Every offer for a product with its supplier and contacts, ready for the ladder. */
  async offersForProduct(productKey: string, sku?: string): Promise<LadderOffer[]> {
    const rows = await this.request<SupplierRow[]>(
      `suppliers?select=id,name,website,level,country,claims,origin,supplier_contacts(kind,value,verification),supplier_offers!inner(product_key,title,sku,currency,tiers,moq,lead_time_days,incoterm,source_url)&supplier_offers.product_key=eq.${encodeURIComponent(productKey)}${sku ? `&supplier_offers.sku=eq.${encodeURIComponent(sku)}` : ''}`,
    );
    return rows.flatMap((row) =>
      row.supplier_offers.map((offer) => ({
        supplierId: row.id,
        supplierName: row.name,
        level: row.level,
        country: row.country,
        website: row.website,
        contacts: row.supplier_contacts.map((contact) => ({
          kind: contact.kind,
          value: contact.value,
          status: contactStatus(contact.kind, contact.verification),
        })),
        title: offer.title,
        currency: offer.currency,
        tiers: offer.tiers,
        moq: offer.moq,
        leadTimeDays: offer.lead_time_days,
        incoterm: offer.incoterm,
        sourceUrl: offer.source_url,
      })),
    );
  }

  async list() {
    return this.request<
      Array<
        Omit<SupplierRow, 'supplier_offers'> & { supplier_offers: Array<{ product_key: string }> }
      >
    >(
      'suppliers?select=id,name,website,level,country,claims,origin,supplier_contacts(kind,value,verification),supplier_offers(product_key)&order=updated_at.desc&limit=100',
    );
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.config.baseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: this.config.anonKey,
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) throw new Error(`Supabase supplier request failed (${response.status}).`);
    const text = await response.text();
    return (text ? JSON.parse(text) : null) as T;
  }
}
