import {
  alertTransportSchema,
  monitorTransportSchema,
  type AlertKind,
  type AlertTransport,
  type MonitorCreate,
  type MonitorTransport,
} from '@scout/schemas';
import type { SupabaseRestConfig } from './SupabaseRestResearchProjectRepository';

export interface MonitorRow {
  id: string;
  user_id: string;
  kind: 'search' | 'listing';
  project_id: string | null;
  listing_id: string | null;
  source_id: string | null;
  cutoff: Record<string, number>;
  baseline: { priceMinor: number; status: string } | null;
  cadence_minutes: number;
  active: boolean;
  next_run_at: string;
  last_run_at: string | null;
  created_at: string;
}

interface AlertRow {
  id: string;
  monitor_id: string;
  listing_id: string;
  kind: AlertKind;
  payload: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
}

export const toMonitor = (row: MonitorRow): MonitorTransport =>
  monitorTransportSchema.parse({
    id: row.id,
    kind: row.kind,
    projectId: row.project_id,
    listingId: row.listing_id,
    sourceId: row.source_id,
    cutoff: row.cutoff,
    baseline: row.baseline,
    cadenceMinutes: row.cadence_minutes,
    active: row.active,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    createdAt: row.created_at,
  });

const toAlert = (row: AlertRow): AlertTransport =>
  alertTransportSchema.parse({
    id: row.id,
    monitorId: row.monitor_id,
    listingId: row.listing_id,
    kind: row.kind,
    payload: row.payload,
    createdAt: row.created_at,
    readAt: row.read_at,
  });

/**
 * Monitors and alerts. User-scoped calls run with the user's token (RLS owner policies); the
 * scheduler's calls (claim, alert insert, collection request) run with the service role.
 */
export class SupabaseRestMonitorRepository {
  constructor(private readonly config: SupabaseRestConfig) {}

  async create(
    userId: string,
    input: MonitorCreate,
    baseline: MonitorTransport['baseline'],
  ): Promise<MonitorTransport> {
    const rows = await this.request<MonitorRow[]>('monitors?select=*', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: userId,
        kind: input.kind,
        project_id: input.projectId ?? null,
        listing_id: input.kind === 'listing' ? input.listingId : null,
        source_id: input.kind === 'search' ? (input.sourceId ?? null) : null,
        cutoff: input.cutoff,
        baseline,
        cadence_minutes: input.cadenceMinutes,
        // The first evaluation happens at creation; the scheduler takes over after one cadence.
        next_run_at: new Date(Date.now() + input.cadenceMinutes * 60_000).toISOString(),
      }),
    });
    return toMonitor(rows[0]);
  }

  async list(userId: string) {
    return (
      await this.request<MonitorRow[]>(
        `monitors?user_id=eq.${userId}&active=is.true&select=*&order=created_at.desc`,
      )
    ).map(toMonitor);
  }

  async deactivate(userId: string, id: string) {
    const rows = await this.request<MonitorRow[]>(
      `monitors?id=eq.${id}&user_id=eq.${userId}&select=*`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ active: false, updated_at: new Date().toISOString() }),
      },
    );
    return rows[0] ? toMonitor(rows[0]) : null;
  }

  async findRow(id: string) {
    const rows = await this.request<MonitorRow[]>(`monitors?id=eq.${id}&select=*&limit=1`);
    return rows[0] ?? null;
  }

  async findByCollectionRun(runId: string) {
    return this.request<MonitorRow[]>(
      `monitors?last_collection_run_id=eq.${runId}&active=is.true&select=*`,
    );
  }

  async claimDue(limit: number) {
    return this.request<MonitorRow[]>('rpc/claim_due_monitors', {
      method: 'POST',
      body: JSON.stringify({ p_limit: limit }),
    });
  }

  async alertedListingIds(monitorId: string, kind: AlertKind) {
    const rows = await this.request<Array<{ listing_id: string }>>(
      `alerts?monitor_id=eq.${monitorId}&kind=eq.${kind}&select=listing_id`,
    );
    return new Set(rows.map((row) => row.listing_id));
  }

  /** Inserts alerts, ignoring ones already recorded for the same event; returns the new ones. */
  async insertAlerts(
    rows: Array<{
      user_id: string;
      monitor_id: string;
      listing_id: string;
      kind: AlertKind;
      dedupe_key: string;
      payload: Record<string, unknown>;
      read_at?: string;
    }>,
  ) {
    if (!rows.length) return [];
    return (
      await this.request<AlertRow[]>('alerts?on_conflict=monitor_id,dedupe_key&select=*', {
        method: 'POST',
        headers: { Prefer: 'return=representation,resolution=ignore-duplicates' },
        body: JSON.stringify(rows),
      })
    ).map(toAlert);
  }

  async updateBaseline(id: string, baseline: { priceMinor: number; status: string }) {
    await this.request(`monitors?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ baseline, updated_at: new Date().toISOString() }),
    });
  }

  async requestCollection(monitorId: string, idempotencyKey: string) {
    const rows = await this.request<
      Array<{ id: string; status: string; queued_at: string | null }>
    >('rpc/request_monitor_collection_run', {
      method: 'POST',
      body: JSON.stringify({ p_monitor_id: monitorId, p_idempotency_key: idempotencyKey }),
    });
    return rows[0] ?? null;
  }

  async markQueued(runId: string) {
    await this.request('rpc/mark_monitor_collection_queued', {
      method: 'POST',
      body: JSON.stringify({ p_run_id: runId }),
    });
  }

  async listAlerts(userId: string, options: { since?: Date; unreadOnly?: boolean } = {}) {
    const filters = [
      `user_id=eq.${userId}`,
      options.unreadOnly ? 'read_at=is.null' : '',
      options.since ? `created_at=gte.${encodeURIComponent(options.since.toISOString())}` : '',
    ].filter(Boolean);
    return (
      await this.request<AlertRow[]>(
        `alerts?${filters.join('&')}&select=*&order=created_at.desc&limit=100`,
      )
    ).map(toAlert);
  }

  async markRead(userId: string, ids: string[]) {
    if (!ids.length) return 0;
    const rows = await this.request<AlertRow[]>(
      `alerts?user_id=eq.${userId}&id=in.(${ids.join(',')})&read_at=is.null&select=*`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ read_at: new Date().toISOString() }),
      },
    );
    return rows.length;
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
    if (response.status === 409) throw new Error('MONITOR_CONFLICT');
    if (!response.ok) throw new Error(`Supabase monitor request failed (${response.status}).`);
    const text = await response.text();
    return (text ? JSON.parse(text) : null) as T;
  }
}
