import type { ListingObservationReader } from '@scout/domain';
import { observationEventSchema, type ObservationEvent } from '@scout/schemas';
import { z } from 'zod';
import type { SupabaseRestConfig } from './SupabaseRestResearchProjectRepository';

interface ObservationEventRow {
  id: string;
  source_id: string;
  event_type: string;
  subject_type: string;
  subject_external_id: string | null;
  dedupe_key: string;
  observed_at: string;
  schema_version: string;
  payload: unknown;
}

export class SupabaseRestObservationEventRepository implements ListingObservationReader {
  constructor(private readonly config: SupabaseRestConfig) {}

  async findByListing(sourceId: string, externalId: string): Promise<ObservationEvent[]> {
    const validatedSourceId = z.string().uuid().parse(sourceId);
    const validatedExternalId = z.string().min(1).max(500).parse(externalId);
    const rows = await this.request<ObservationEventRow[]>(
      `observation_events?source_id=eq.${encodeURIComponent(validatedSourceId)}&subject_type=eq.listing&subject_external_id=eq.${encodeURIComponent(validatedExternalId)}&select=id,source_id,event_type,subject_type,subject_external_id,dedupe_key,observed_at,schema_version,payload&order=observed_at.asc`,
    );
    return rows.map((row) =>
      observationEventSchema.parse({
        id: row.id,
        sourceId: row.source_id,
        type: row.event_type,
        subjectType: row.subject_type,
        subjectExternalId: row.subject_external_id ?? undefined,
        dedupeKey: row.dedupe_key,
        observedAt: new Date(row.observed_at),
        schemaVersion: row.schema_version,
        payload: row.payload,
      }),
    );
  }

  private async request<T>(path: string): Promise<T> {
    const response = await fetch(`${this.config.baseUrl}/rest/v1/${path}`, {
      headers: {
        apikey: this.config.anonKey,
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) throw new Error(`Supabase observation request failed (${response.status}).`);
    return response.json() as Promise<T>;
  }
}
