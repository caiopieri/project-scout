import {
  CollectorHealth,
  CollectorHealthRepository,
  ListingObservationReader,
  ObservationEvent,
  ObservationEventRepository,
} from '@scout/domain';
import { observationEventSchema } from '@scout/schemas';
import { SqlExecutor } from '../../sql/SqlExecutor';

export class PgObservationRepository
  implements ObservationEventRepository, CollectorHealthRepository, ListingObservationReader
{
  constructor(private sql: SqlExecutor) {}

  async append(event: ObservationEvent): Promise<void> {
    await this.sql.query(
      `INSERT INTO observation_events (
         id, source_id, event_type, subject_type, subject_external_id,
         dedupe_key, observed_at, schema_version, payload
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        event.id,
        event.sourceId,
        event.type,
        event.subjectType,
        event.subjectExternalId ?? null,
        event.dedupeKey,
        event.observedAt,
        event.schemaVersion,
        JSON.stringify(event.payload ?? {}),
      ],
    );
  }

  async findByListing(sourceId: string, externalId: string): Promise<ObservationEvent[]> {
    const result = await this.sql.query<Record<string, unknown>>(
      `SELECT id, source_id, event_type, subject_type, subject_external_id,
              dedupe_key, observed_at, schema_version, payload
       FROM observation_events
       WHERE source_id = $1 AND subject_type = 'listing' AND subject_external_id = $2
       ORDER BY observed_at ASC`,
      [sourceId, externalId],
    );
    return result.rows.map((row) =>
      observationEventSchema.parse({
        id: row.id,
        sourceId: row.source_id,
        type: row.event_type,
        subjectType: row.subject_type,
        subjectExternalId: row.subject_external_id ?? undefined,
        dedupeKey: row.dedupe_key,
        observedAt: new Date(String(row.observed_at)),
        schemaVersion: row.schema_version,
        payload: row.payload,
      }),
    );
  }

  async record(check: CollectorHealth): Promise<void> {
    await this.sql.query(
      `INSERT INTO collector_health_checks (
         collection_run_id, attempt_number, source_id, provider, checked_at, state, ingestion_layer,
         listing_id_percent, price_percent, title_percent, diagnostics
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
      [
        check.collectionRunId ?? null,
        check.attemptNumber,
        check.sourceId,
        check.provider,
        check.checkedAt,
        check.state,
        check.ingestionLayer,
        check.completeness.listingIdPercent,
        check.completeness.pricePercent,
        check.completeness.titlePercent,
        JSON.stringify(check.diagnostics ?? []),
      ],
    );
  }
}
