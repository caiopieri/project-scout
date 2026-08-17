import { describe, expect, it } from 'vitest';
import type { SqlExecutor, SqlQueryResult } from '@scout/database';
import { PgObservationRepository } from '@scout/database';
import type { CollectorHealth, ObservationEvent } from '@scout/domain';

interface FakeCall {
  sql: string;
  params: unknown[];
}

function createFakeExecutor(
  response: SqlQueryResult = { rows: [], rowCount: 0 },
): SqlExecutor & { calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  const executor: SqlExecutor = {
    async query<T = Record<string, unknown>>(
      sql: string,
      params: unknown[] = [],
    ): Promise<SqlQueryResult<T>> {
      calls.push({ sql, params: [...params] });
      return response as SqlQueryResult<T>;
    },
  };
  return Object.assign(executor, { calls });
}

function makeObservationEvent(overrides: Partial<ObservationEvent> = {}): ObservationEvent {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    sourceId: '00000000-0000-4000-a000-000000000001',
    type: 'PRICE_CHANGED',
    subjectType: 'listing',
    subjectExternalId: 'ext-listing-42',
    dedupeKey: 'ebay:listing:ext-listing-42:price:2026-08-11T12:00:00Z',
    observedAt: new Date('2026-08-11T12:00:00.000Z'),
    schemaVersion: 'f0.events.v1',
    payload: { previousPrice: 500, currentPrice: 450 },
    ...overrides,
  };
}

function makeCollectorHealth(overrides: Partial<CollectorHealth> = {}): CollectorHealth {
  return {
    collectionRunId: '22222222-2222-4222-8222-222222222222',
    attemptNumber: 2,
    sourceId: '00000000-0000-4000-a000-000000000001',
    provider: 'ebay-api-sandbox-v1',
    checkedAt: new Date('2026-08-11T12:00:00.000Z'),
    state: 'CONTENT_CHANGED',
    ingestionLayer: 2,
    completeness: { listingIdPercent: 100, pricePercent: 96, titlePercent: 99 },
    diagnostics: ['response shape changed', 'price selector stale'],
    ...overrides,
  };
}

describe('PgObservationRepository.append (ObservationEventRepository)', () => {
  it('issues a parameterized INSERT with $1..$9 placeholders and all fields in snake_case', async () => {
    const sql = createFakeExecutor();
    const repo = new PgObservationRepository(sql);

    await repo.append(makeObservationEvent());

    expect(sql.calls).toHaveLength(1);
    const { sql: query, params } = sql.calls[0];
    expect(query).toContain('INSERT INTO observation_events');
    for (let i = 1; i <= 9; i++) {
      expect(query).toContain(`$${i}`);
    }
    expect(query).toContain('source_id');
    expect(query).toContain('event_type');
    expect(query).toContain('subject_type');
    expect(query).toContain('subject_external_id');
    expect(query).toContain('dedupe_key');
    expect(query).toContain('observed_at');
    expect(query).toContain('schema_version');
    expect(query).toContain('payload');
    expect(query).toContain('$9::jsonb');
    expect(params).toHaveLength(9);
  });

  it('passes params in the exact column order declared in the INSERT', async () => {
    const sql = createFakeExecutor();
    const repo = new PgObservationRepository(sql);
    const event = makeObservationEvent();

    await repo.append(event);

    const p = sql.calls[0].params;
    expect(p[0]).toBe(event.id);
    expect(p[1]).toBe(event.sourceId);
    expect(p[2]).toBe(event.type);
    expect(p[3]).toBe(event.subjectType);
    expect(p[4]).toBe(event.subjectExternalId);
    expect(p[5]).toBe(event.dedupeKey);
    expect(p[6]).toBe(event.observedAt);
    expect(p[7]).toBe(event.schemaVersion);
    expect(p[8]).toBe(JSON.stringify(event.payload));
  });

  it('serializes the payload to a JSON string (not an object) for JSONB', async () => {
    const sql = createFakeExecutor();
    const repo = new PgObservationRepository(sql);
    const payload = { previousPrice: 500, currentPrice: 450, notes: ['a', 'b'] };

    await repo.append(makeObservationEvent({ payload }));

    const serialized = sql.calls[0].params[8];
    expect(typeof serialized).toBe('string');
    expect(serialized).toBe(JSON.stringify(payload));
    expect(JSON.parse(serialized as string)).toEqual(payload);
  });

  it('substitutes null when subjectExternalId is undefined', async () => {
    const sql = createFakeExecutor();
    const repo = new PgObservationRepository(sql);
    const event = makeObservationEvent({ subjectType: 'market' });
    delete event.subjectExternalId;

    await repo.append(event);

    expect(sql.calls[0].params[4]).toBeNull();
  });

  it('serializes an empty payload default to "{}"', async () => {
    const sql = createFakeExecutor();
    const repo = new PgObservationRepository(sql);
    const event = makeObservationEvent({ payload: {} });

    await repo.append(event);

    expect(sql.calls[0].params[8]).toBe('{}');
  });

  it('propagates a dedupe (unique constraint) error without swallowing it', async () => {
    const dedupeError = new Error(
      'duplicate key value violates unique constraint "observation_events_dedupe_key_unique"',
    );
    const calls: FakeCall[] = [];
    const executor: SqlExecutor = {
      async query<T = Record<string, unknown>>(
        _sql: string,
        _params: unknown[] = [],
      ): Promise<SqlQueryResult<T>> {
        calls.push({ sql: '', params: [] });
        throw dedupeError;
      },
    };
    const repo = new PgObservationRepository(executor);

    await expect(repo.append(makeObservationEvent())).rejects.toThrow(
      'duplicate key value violates unique constraint',
    );
    expect(calls).toHaveLength(1);
  });
});

describe('PgObservationRepository.record (CollectorHealthRepository)', () => {
  it('issues a parameterized INSERT with $1..$11 and all snake_case columns', async () => {
    const sql = createFakeExecutor();
    const repo = new PgObservationRepository(sql);

    await repo.record(makeCollectorHealth());

    expect(sql.calls).toHaveLength(1);
    const { sql: query, params } = sql.calls[0];
    expect(query).toContain('INSERT INTO collector_health_checks');
    for (let i = 1; i <= 11; i++) {
      expect(query).toContain(`$${i}`);
    }
    expect(query).toContain('collection_run_id');
    expect(query).toContain('attempt_number');
    expect(query).toContain('source_id');
    expect(query).toContain('provider');
    expect(query).toContain('checked_at');
    expect(query).toContain('state');
    expect(query).toContain('ingestion_layer');
    expect(query).toContain('listing_id_percent');
    expect(query).toContain('price_percent');
    expect(query).toContain('title_percent');
    expect(query).toContain('diagnostics');
    expect(query).toContain('$11::jsonb');
    expect(params).toHaveLength(11);
  });

  it('passes params in the exact column order declared in the INSERT', async () => {
    const sql = createFakeExecutor();
    const repo = new PgObservationRepository(sql);
    const health = makeCollectorHealth();

    await repo.record(health);

    const p = sql.calls[0].params;
    expect(p[0]).toBe(health.collectionRunId);
    expect(p[1]).toBe(health.attemptNumber);
    expect(p[2]).toBe(health.sourceId);
    expect(p[3]).toBe(health.provider);
    expect(p[4]).toBe(health.checkedAt);
    expect(p[5]).toBe(health.state);
    expect(p[6]).toBe(health.ingestionLayer);
    expect(p[7]).toBe(health.completeness.listingIdPercent);
    expect(p[8]).toBe(health.completeness.pricePercent);
    expect(p[9]).toBe(health.completeness.titlePercent);
    expect(p[10]).toBe(JSON.stringify(health.diagnostics));
  });

  it('serializes the diagnostics array to a JSON string for JSONB', async () => {
    const sql = createFakeExecutor();
    const repo = new PgObservationRepository(sql);
    const diagnostics = ['response shape changed', 'price selector stale'];

    await repo.record(makeCollectorHealth({ diagnostics }));

    const serialized = sql.calls[0].params[10];
    expect(typeof serialized).toBe('string');
    expect(serialized).toBe(JSON.stringify(diagnostics));
    expect(JSON.parse(serialized as string)).toEqual(diagnostics);
  });

  it('serializes an empty diagnostics default to "[]"', async () => {
    const sql = createFakeExecutor();
    const repo = new PgObservationRepository(sql);

    await repo.record(makeCollectorHealth({ diagnostics: [] }));

    expect(sql.calls[0].params[10]).toBe('[]');
  });

  it('propagates a connection error without swallowing it', async () => {
    const error = new Error('connection refused');
    const executor: SqlExecutor = {
      async query<T = Record<string, unknown>>(
        _sql: string,
        _params: unknown[] = [],
      ): Promise<SqlQueryResult<T>> {
        throw error;
      },
    };
    const repo = new PgObservationRepository(executor);

    await expect(repo.record(makeCollectorHealth())).rejects.toThrow('connection refused');
  });
});

describe('PgObservationRepository implements both ports', () => {
  it('satisfies ObservationEventRepository and CollectorHealthRepository simultaneously', async () => {
    const sql = createFakeExecutor();
    const repo = new PgObservationRepository(sql);

    await repo.append(makeObservationEvent());
    await repo.record(makeCollectorHealth());

    expect(sql.calls).toHaveLength(2);
    expect(sql.calls[0].sql).toContain('observation_events');
    expect(sql.calls[1].sql).toContain('collector_health_checks');
  });
});
