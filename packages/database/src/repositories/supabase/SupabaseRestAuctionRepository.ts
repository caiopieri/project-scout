import {
  auctionLotTransportSchema,
  auctionPremisesSchema,
  type AuctionLotTransport,
  type AuctionPremises,
  type AuctionTerms,
} from '@scout/schemas';
import type { SupabaseRestConfig } from './SupabaseRestResearchProjectRepository';

interface LotRow {
  id: string;
  source_id: string;
  external_id: string;
  title: string;
  url: string;
  image_url: string | null;
  closes_on: string;
  status: 'active' | 'closed';
  current_bid_minor: number | null;
  bidders: number | null;
  increment_minor: number | null;
  reserve: boolean | null;
  location: string | null;
  agency: string | null;
  currency: string;
  terms_text: string;
  terms: AuctionTerms;
  first_seen_at: string;
  last_seen_at: string;
}

export interface AuctionLotUpsert {
  externalId: string;
  title: string;
  url: string;
  imageUrl: string | null;
  closesOn: string;
  status: 'active' | 'closed';
  currentBidMinor: number | null;
  bidders: number | null;
  incrementMinor: number | null;
  reserve: boolean | null;
  location: string | null;
  agency: string | null;
  currency: string;
  termsText: string;
  terms: AuctionTerms;
}

const toLot = (row: LotRow): AuctionLotTransport =>
  auctionLotTransportSchema.parse({
    id: row.id,
    sourceId: row.source_id,
    externalId: row.external_id,
    title: row.title,
    url: row.url,
    imageUrl: row.image_url,
    closesOn: row.closes_on,
    status: row.status,
    currentBidMinor: row.current_bid_minor === null ? null : Number(row.current_bid_minor),
    bidders: row.bidders,
    incrementMinor: row.increment_minor === null ? null : Number(row.increment_minor),
    reserve: row.reserve,
    location: row.location,
    agency: row.agency,
    currency: row.currency,
    termsText: row.terms_text,
    terms: row.terms,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
  });

/**
 * Auction lots, their observed bid history, sweeps and per-user premises. Lots are public data
 * written only by the service role; premises are owner-scoped (RLS).
 */
export class SupabaseRestAuctionRepository {
  constructor(private readonly config: SupabaseRestConfig) {}

  /**
   * Upserts a sweep's lots and records a bid observation for every lot that is new or whose
   * (high bid, bidders) changed since the last sweep. Returns how many bid changes were seen.
   */
  async upsertSweep(sourceId: string, lots: AuctionLotUpsert[]) {
    if (!lots.length) return { kept: 0, bidChanges: 0 };
    const previous = new Map<string, { bid: number | null; bidders: number | null }>();
    for (let offset = 0; offset < lots.length; offset += 100) {
      const ids = lots.slice(offset, offset + 100).map((lot) => `"${lot.externalId}"`);
      const rows = await this.request<
        Array<Pick<LotRow, 'external_id' | 'current_bid_minor' | 'bidders'>>
      >(
        `auction_lots?source_id=eq.${sourceId}&external_id=in.(${ids.join(',')})&select=external_id,current_bid_minor,bidders`,
      );
      for (const row of rows)
        previous.set(row.external_id, {
          bid: row.current_bid_minor === null ? null : Number(row.current_bid_minor),
          bidders: row.bidders,
        });
    }
    const now = new Date().toISOString();
    const saved = await this.request<Array<Pick<LotRow, 'id' | 'external_id'>>>(
      'auction_lots?on_conflict=source_id,external_id&select=id,external_id',
      {
        method: 'POST',
        headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
        body: JSON.stringify(
          lots.map((lot) => ({
            source_id: sourceId,
            external_id: lot.externalId,
            title: lot.title,
            url: lot.url,
            image_url: lot.imageUrl,
            closes_on: lot.closesOn,
            status: lot.status,
            current_bid_minor: lot.currentBidMinor,
            bidders: lot.bidders,
            increment_minor: lot.incrementMinor,
            reserve: lot.reserve,
            location: lot.location,
            agency: lot.agency,
            currency: lot.currency,
            terms_text: lot.termsText,
            terms: lot.terms,
            last_seen_at: now,
          })),
        ),
      },
    );
    const idByExternal = new Map(saved.map((row) => [row.external_id, row.id]));
    const changes = lots
      .filter((lot) => {
        const before = previous.get(lot.externalId);
        return !before || before.bid !== lot.currentBidMinor || before.bidders !== lot.bidders;
      })
      .map((lot) => ({
        lot_id: idByExternal.get(lot.externalId),
        high_bid_minor: lot.currentBidMinor,
        bidders: lot.bidders,
        observed_at: now,
      }))
      .filter((row) => row.lot_id);
    if (changes.length)
      await this.request('auction_bid_observations?on_conflict=lot_id,high_bid_minor,bidders', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates' },
        body: JSON.stringify(changes),
      });
    return { kept: saved.length, bidChanges: changes.length };
  }

  /** Stored active lots that the source's active list no longer contains are closed. */
  async closeMissing(sourceId: string, activeExternalIds: string[]) {
    const rows = await this.request<Array<{ id: string; external_id: string }>>(
      `auction_lots?source_id=eq.${sourceId}&status=eq.active&select=id,external_id`,
    );
    const active = new Set(activeExternalIds);
    const gone = rows.filter((row) => !active.has(row.external_id)).map((row) => row.id);
    if (gone.length)
      await this.request(`auction_lots?id=in.(${gone.join(',')})`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'closed' }),
      });
    return gone.length;
  }

  async recordSweep(row: {
    source_id: string;
    origin: string;
    lots_seen: number;
    lots_kept: number;
    bid_changes: number;
    error_code: string | null;
  }) {
    await this.request('auction_sweeps', { method: 'POST', body: JSON.stringify(row) });
  }

  async sweepsSince(sourceId: string, since: Date) {
    const rows = await this.request<Array<{ id: string; started_at: string }>>(
      `auction_sweeps?source_id=eq.${sourceId}&started_at=gte.${encodeURIComponent(since.toISOString())}&select=id,started_at&order=started_at.desc`,
    );
    return rows;
  }

  async list(query: { q?: string; closingWithinDays?: number; limit: number }, today: string) {
    const filters = ['status=eq.active', `closes_on=gte.${today}`];
    if (query.closingWithinDays !== undefined) {
      const until = new Date(`${today}T00:00:00Z`);
      until.setUTCDate(until.getUTCDate() + query.closingWithinDays);
      filters.push(`closes_on=lte.${until.toISOString().slice(0, 10)}`);
    }
    if (query.q)
      filters.push(`title=ilike.*${encodeURIComponent(query.q.replace(/[*,()]/g, ' '))}*`);
    return (
      await this.request<LotRow[]>(
        `auction_lots?${filters.join('&')}&select=*&order=closes_on.asc,current_bid_minor.desc.nullslast&limit=${query.limit}`,
      )
    ).map(toLot);
  }

  async findById(id: string) {
    const rows = await this.request<LotRow[]>(`auction_lots?id=eq.${id}&select=*&limit=1`);
    return rows[0] ? toLot(rows[0]) : null;
  }

  async bidHistory(lotId: string) {
    return (
      await this.request<
        Array<{ high_bid_minor: number | null; bidders: number | null; observed_at: string }>
      >(
        `auction_bid_observations?lot_id=eq.${lotId}&select=high_bid_minor,bidders,observed_at&order=observed_at.asc`,
      )
    ).map((row) => ({
      highBidMinor: row.high_bid_minor === null ? null : Number(row.high_bid_minor),
      bidders: row.bidders,
      observedAt: row.observed_at,
    }));
  }

  async premises(userId: string, lotIds: string[]) {
    const map = new Map<string, AuctionPremises>();
    if (!lotIds.length) return map;
    for (let offset = 0; offset < lotIds.length; offset += 100) {
      const rows = await this.request<Array<{ lot_id: string; premises: unknown }>>(
        `auction_lot_premises?user_id=eq.${userId}&lot_id=in.(${lotIds.slice(offset, offset + 100).join(',')})&select=lot_id,premises`,
      );
      for (const row of rows) map.set(row.lot_id, auctionPremisesSchema.parse(row.premises));
    }
    return map;
  }

  async savePremises(userId: string, lotId: string, premises: AuctionPremises) {
    await this.request('auction_lot_premises?on_conflict=user_id,lot_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        user_id: userId,
        lot_id: lotId,
        premises,
        updated_at: new Date().toISOString(),
      }),
    });
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
    if (!response.ok) throw new Error(`Supabase auction request failed (${response.status}).`);
    const text = await response.text();
    return (text ? JSON.parse(text) : null) as T;
  }
}
