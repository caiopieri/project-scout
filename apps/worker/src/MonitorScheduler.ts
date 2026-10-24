import type { SupabaseRestMonitorRepository, MonitorRow } from '@scout/database/monitors';
import {
  evaluateListingMonitor,
  evaluateLotMonitor,
  evaluateSearchMonitor,
  listingPriceMinor,
  nextLotCheckAt,
  type MonitorAlertCandidate,
} from '@scout/domain';
import {
  monitorCutoffSchema,
  type AlertTransport,
  type AuctionLotTransport,
  type ListingTransport,
} from '@scout/schemas';

const EBAY_SOURCE_ID = '00000000-0000-4000-a000-000000000001';

export interface MonitorSchedulerDeps {
  monitors: SupabaseRestMonitorRepository;
  /** Listings of a project with reference distance, score and the owner's marks. */
  enrichedProjectListings: (userId: string, projectId: string) => Promise<ListingTransport[]>;
  findListing: (listingId: string) => Promise<ListingTransport | null>;
  circuitAllows: (sourceId: string) => Promise<boolean>;
  queueCollection: (runId: string) => Promise<void>;
  findLot?: (lotId: string) => Promise<AuctionLotTransport | null>;
  /** Refreshes auction lots (one sweep, within the source's budget) before lot monitors run. */
  refreshAuctions?: () => Promise<unknown>;
  now?: () => Date;
}

export interface MonitorRunResult {
  monitorId: string;
  alerts: number;
  collection: { runId: string; status: string } | { skipped: string } | null;
  error?: string;
}

/**
 * Runs monitors. Evaluation always reads what the database already holds (same reference and
 * score as the feed), so it alerts within the tick; when the cadence is due it also asks for a
 * fresh collection — respecting the source circuit — whose results are evaluated as soon as that
 * collection completes.
 */
export class MonitorScheduler {
  private readonly now: () => Date;

  constructor(private readonly deps: MonitorSchedulerDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * Evaluates one monitor and records new alerts. `initial` marks what already qualifies at
   * creation as read, so a new monitor tells about what appears after it, not before.
   */
  async evaluate(row: MonitorRow, initial = false): Promise<AlertTransport[]> {
    const cutoff = monitorCutoffSchema.parse(row.cutoff);
    let candidates: MonitorAlertCandidate[] = [];
    if (row.kind === 'search' && row.project_id) {
      const listings = await this.deps.enrichedProjectListings(row.user_id, row.project_id);
      const seen = await this.deps.monitors.alertedListingIds(row.id, 'NEW_OPPORTUNITY');
      candidates = evaluateSearchMonitor(listings, cutoff, seen);
    } else if (row.kind === 'listing' && row.listing_id) {
      const listing = await this.deps.findListing(row.listing_id);
      if (!listing) return [];
      const current = { priceMinor: listingPriceMinor(listing), status: listing.status };
      const result = evaluateListingMonitor(
        row.listing_id,
        row.baseline ?? current,
        current,
        cutoff,
      );
      candidates = result.alerts;
      await this.deps.monitors.updateBaseline(row.id, result.nextBaseline);
    } else if (row.kind === 'lot' && row.lot_id && this.deps.findLot) {
      const lot = await this.deps.findLot(row.lot_id);
      if (!lot) return [];
      const now = this.now();
      candidates = evaluateLotMonitor(lot, cutoff, now.toISOString().slice(0, 10));
      // Closer to the close, look more often; after it closed, stop.
      const next = nextLotCheckAt(lot.closesOn, lot.status, now);
      if (next) await this.deps.monitors.scheduleNext(row.id, next);
      else await this.deps.monitors.stop(row.id);
    }
    return this.deps.monitors.insertAlerts(
      candidates.map((candidate) => ({
        user_id: row.user_id,
        monitor_id: row.id,
        ...(candidate.listingId ? { listing_id: candidate.listingId } : {}),
        ...(candidate.lotId ? { lot_id: candidate.lotId } : {}),
        kind: candidate.kind,
        dedupe_key: candidate.dedupeKey,
        payload: { ...candidate.payload, ...(initial ? { atCreation: true } : {}) },
        ...(initial ? { read_at: this.now().toISOString() } : {}),
      })),
    );
  }

  /** Asks for a collection for the monitor's project, once per cadence slot. */
  private async collect(row: MonitorRow): Promise<MonitorRunResult['collection']> {
    if (!row.project_id) return null;
    const listing = row.listing_id ? await this.deps.findListing(row.listing_id) : null;
    const sourceId = row.source_id ?? listing?.sourceId ?? EBAY_SOURCE_ID;
    if (!(await this.deps.circuitAllows(sourceId))) return { skipped: 'source circuit open' };
    const slot = Math.floor(this.now().getTime() / (row.cadence_minutes * 60_000));
    const run = await this.deps.monitors.requestCollection(row.id, `monitor:${row.id}:${slot}`);
    if (!run) return { skipped: 'project not active' };
    if (run.status === 'pending' && !run.queued_at) {
      await this.deps.queueCollection(run.id);
      await this.deps.monitors.markQueued(run.id);
    }
    return { runId: run.id, status: run.status };
  }

  /** Cron entry point: claims due monitors atomically and runs each one independently. */
  async runDue(limit = 20): Promise<MonitorRunResult[]> {
    const due = await this.deps.monitors.claimDue(limit);
    const results: MonitorRunResult[] = [];
    if (due.some((row) => row.kind === 'lot') && this.deps.refreshAuctions)
      await this.deps.refreshAuctions().catch((error: unknown) =>
        results.push({
          monitorId: 'auction-sweep',
          alerts: 0,
          collection: null,
          error: error instanceof Error ? error.message : 'sweep failed',
        }),
      );
    for (const row of due) {
      try {
        const alerts = await this.evaluate(row);
        results.push({
          monitorId: row.id,
          alerts: alerts.length,
          collection: await this.collect(row),
        });
      } catch (error) {
        results.push({
          monitorId: row.id,
          alerts: 0,
          collection: null,
          error: error instanceof Error ? error.message : 'unknown error',
        });
      }
    }
    return results;
  }

  /** Called by the queue consumer when a collection completes: evaluates monitors waiting on it. */
  async onCollectionCompleted(runId: string, rows: MonitorRow[]) {
    const results = [];
    for (const row of rows.filter((candidate) => candidate.active))
      results.push({ monitorId: row.id, runId, alerts: (await this.evaluate(row)).length });
    return results;
  }
}
