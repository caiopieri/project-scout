import type { SupabaseRestAuctionRepository } from '@scout/database/auctions';
import { ConnectorError, parseAuctionTerms } from '@scout/domain';
import type { GsaAuctionsClient } from '@scout/gsa-auctions-connector';

export interface AuctionSweepResult {
  status: 'swept' | 'skipped' | 'failed';
  reason?: string;
  seen?: number;
  kept?: number;
  invalid?: number;
  bidChanges?: number;
  closed?: number;
}

/**
 * Sweeps the GSA active list into `auction_lots`: one request, electronics only (decided in the
 * connector), terms parsed with evidence, bid changes recorded. Keeps within the source budget
 * (sweeps per 24 h) and a minimum interval; an exhausted budget skips instead of trying.
 */
export class AuctionSweeper {
  constructor(
    private readonly deps: {
      sourceId: string;
      client: GsaAuctionsClient;
      auctions: SupabaseRestAuctionRepository;
      dailyBudget: number;
      minIntervalMinutes: number;
      now?: () => Date;
    },
  ) {}

  async sweep(
    origin: string,
    options: { ignoreInterval?: boolean; minIntervalMinutes?: number } = {},
  ): Promise<AuctionSweepResult> {
    const { auctions, sourceId } = this.deps;
    const now = this.deps.now?.() ?? new Date();
    const recent = await auctions.sweepsSince(sourceId, new Date(now.getTime() - 86_400_000));
    if (recent.length >= this.deps.dailyBudget)
      return { status: 'skipped', reason: `daily budget of ${this.deps.dailyBudget} sweeps used` };
    const last = recent[0] ? Date.parse(recent[0].started_at) : 0;
    const interval = options.minIntervalMinutes ?? this.deps.minIntervalMinutes;
    if (!options.ignoreInterval && now.getTime() - last < interval * 60_000)
      return { status: 'skipped', reason: `last sweep under ${interval} min ago` };
    try {
      const { seen, lots, activeIds, invalid } = await this.deps.client.activeLots();
      const { kept, bidChanges } = await auctions.upsertSweep(
        sourceId,
        lots.map((lot) => ({ ...lot, terms: parseAuctionTerms(lot.title, lot.termsText) })),
      );
      // The source's active list is authoritative: a stored lot missing from it has closed.
      const closed = await auctions.closeMissing(sourceId, activeIds);
      await auctions.recordSweep({
        source_id: sourceId,
        origin,
        lots_seen: seen,
        lots_kept: kept,
        bid_changes: bidChanges,
        error_code: null,
      });
      return { status: 'swept', seen, kept, invalid, bidChanges, closed };
    } catch (error) {
      const code = error instanceof ConnectorError ? error.code : 'AUCTION_SWEEP_FAILED';
      await auctions.recordSweep({
        source_id: sourceId,
        origin,
        lots_seen: 0,
        lots_kept: 0,
        bid_changes: 0,
        error_code: code,
      });
      return { status: 'failed', reason: code };
    }
  }
}
