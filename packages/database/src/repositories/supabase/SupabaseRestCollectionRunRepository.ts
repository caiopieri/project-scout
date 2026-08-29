import { CollectionRunRepository, ConnectorError, CreateCollectionRunInput } from '@scout/domain';
import {
  collectorHealthSchema,
  collectionRunSchema,
  researchCriteriaSchema,
  type CollectionResult,
  type ResearchCriteria,
} from '@scout/schemas';
import type { SupabaseRestConfig } from './SupabaseRestResearchProjectRepository';

interface CollectionRunRow {
  id: string;
  project_id: string;
  source_id: string;
  status: string;
  idempotency_key: string;
  queued_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  lease_expires_at: string | null;
  attempt_count: number;
  items_found: number;
  items_created: number;
  items_updated: number;
  estimated_cost: number;
  provider: string;
  error: string | null;
  error_kind: string | null;
  error_code: string | null;
}

const mapRun = (row: CollectionRunRow) =>
  collectionRunSchema.parse({
    id: row.id,
    projectId: row.project_id,
    sourceId: row.source_id,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    queuedAt: row.queued_at ? new Date(row.queued_at) : undefined,
    startedAt: row.started_at ? new Date(row.started_at) : undefined,
    finishedAt: row.finished_at ? new Date(row.finished_at) : undefined,
    leaseExpiresAt: row.lease_expires_at ? new Date(row.lease_expires_at) : undefined,
    attemptCount: row.attempt_count,
    itemsFound: row.items_found,
    itemsCreated: row.items_created,
    itemsUpdated: row.items_updated,
    estimatedCost: Number(row.estimated_cost),
    provider: row.provider,
    error: row.error ?? undefined,
    errorKind: row.error_kind ?? undefined,
    errorCode: row.error_code ?? undefined,
  });

export class SupabaseRestCollectionRunRepository implements CollectionRunRepository {
  constructor(private readonly config: SupabaseRestConfig) {}

  async createOrFind(input: CreateCollectionRunInput) {
    const rows = await this.request<CollectionRunRow[]>('rpc/request_ebay_collection_run', {
      method: 'POST',
      body: JSON.stringify({
        p_project_id: input.projectId,
        p_idempotency_key: input.idempotencyKey,
      }),
    });
    if (!rows[0]) throw new Error('Project not found, inactive or access denied.');
    const run = mapRun(rows[0]);
    return { run, created: run.status === 'pending' && !run.queuedAt && run.attemptCount === 0 };
  }

  async findById(id: string, projectId: string) {
    const rows = await this.request<CollectionRunRow[]>(
      `collection_runs?id=eq.${encodeURIComponent(id)}&project_id=eq.${encodeURIComponent(projectId)}&limit=1`,
    );
    return rows[0] ? mapRun(rows[0]) : null;
  }

  async findByRunId(id: string) {
    const rows = await this.request<CollectionRunRow[]>(
      `collection_runs?id=eq.${encodeURIComponent(id)}&limit=1`,
    );
    return rows[0] ? mapRun(rows[0]) : null;
  }

  async markQueued(id: string) {
    const rows = await this.request<CollectionRunRow[]>('rpc/mark_collection_run_queued', {
      method: 'POST',
      body: JSON.stringify({ p_run_id: id }),
    });
    if (!rows[0]) throw new Error('Collection run not found or state transition rejected.');
    return mapRun(rows[0]);
  }

  async claim(id: string, expectedAttemptCount: number, startedAt?: Date) {
    const claimedAt = new Date();
    const rows = await this.request<CollectionRunRow[]>(
      `collection_runs?id=eq.${encodeURIComponent(id)}&status=eq.pending&attempt_count=eq.${expectedAttemptCount}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'running',
          started_at: (startedAt ?? claimedAt).toISOString(),
          lease_expires_at: new Date(claimedAt.getTime() + 5 * 60 * 1000).toISOString(),
          attempt_count: expectedAttemptCount + 1,
          error: null,
          error_kind: null,
          error_code: null,
        }),
      },
    );
    return rows[0] ? mapRun(rows[0]) : null;
  }

  setProvider(id: string, provider: string) {
    return this.patchOne(id, { provider });
  }

  async getProjectCriteria(projectId: string): Promise<ResearchCriteria | null> {
    const rows = await this.request<Array<{ structured_query: unknown }>>(
      `research_projects?id=eq.${encodeURIComponent(projectId)}&status=eq.active&select=structured_query&limit=1`,
    );
    return rows[0] ? researchCriteriaSchema.parse(rows[0].structured_query) : null;
  }

  complete(
    id: string,
    result: CollectionResult,
    persistence = {
      itemsCreated: 0,
      itemsUpdated: 0,
      listingIds: [],
      listingIdsByExternalId: {},
    },
    health?: import('@scout/schemas').CollectorHealth,
  ) {
    if (!health) throw new Error('Collection completion requires semantic health.');
    const parsedHealth = collectorHealthSchema.parse(health);
    return this.request<CollectionRunRow[]>('rpc/complete_collection_run_with_health', {
      method: 'POST',
      body: JSON.stringify({
        p_run_id: id,
        p_items_found: result.items.length,
        p_items_created: persistence.itemsCreated,
        p_items_updated: persistence.itemsUpdated,
        p_provider: result.provider,
        p_health: parsedHealth,
      }),
    }).then((rows) => {
      if (!rows[0]) throw new Error('Collection run completion was rejected.');
      return mapRun(rows[0]);
    });
  }

  releaseForRetry(
    id: string,
    error: ConnectorError,
    health?: import('@scout/schemas').CollectorHealth,
  ) {
    return this.transitionFailure(id, error, false, health);
  }

  fail(id: string, error: ConnectorError, health?: import('@scout/schemas').CollectorHealth) {
    return this.transitionFailure(id, error, true, health);
  }

  private transitionFailure(
    id: string,
    error: ConnectorError,
    terminal: boolean,
    health?: import('@scout/schemas').CollectorHealth,
  ) {
    if (!health) throw new Error('Collection failure requires semantic health.');
    const parsedHealth = collectorHealthSchema.parse(health);
    return this.request<CollectionRunRow[]>('rpc/transition_collection_run_failure_with_health', {
      method: 'POST',
      body: JSON.stringify({
        p_run_id: id,
        p_terminal: terminal,
        p_error: error.message,
        p_error_kind: error.kind,
        p_error_code: error.code,
        p_health: parsedHealth,
      }),
    }).then((rows) => {
      if (!rows[0]) {
        return this.findByRunId(id).then((current) => {
          if (current && (current.status === 'completed' || current.status === 'failed'))
            return current;
          throw new Error('Collection run failure transition was rejected.');
        });
      }
      return mapRun(rows[0]);
    });
  }

  private async patchOne(id: string, body: Record<string, unknown>, extraFilter = '') {
    const rows = await this.request<CollectionRunRow[]>(
      `collection_runs?id=eq.${encodeURIComponent(id)}${extraFilter}`,
      { method: 'PATCH', body: JSON.stringify(body) },
    );
    if (!rows[0]) throw new Error('Collection run not found or state transition rejected.');
    return mapRun(rows[0]);
  }

  private async request<T>(path: string, init: RequestInit = {}, prefer?: string): Promise<T> {
    const response = await fetch(`${this.config.baseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: this.config.anonKey,
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
        Prefer:
          prefer ??
          (init.method === 'POST' || init.method === 'PATCH' ? 'return=representation' : ''),
      },
    });
    if (!response.ok) throw new Error(`Supabase collection request failed (${response.status}).`);
    return response.json() as Promise<T>;
  }
}
