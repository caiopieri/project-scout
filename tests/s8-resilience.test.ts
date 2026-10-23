import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Client } from 'pg';
import { buildDegradedCollectorHealth } from '@scout/collection';
import { ConnectorError } from '@scout/domain';
import worker from '../apps/worker/src/index';

const userId = '11111111-1111-4111-a111-111111111111';
const projectId = '33333333-3333-4333-a333-333333333333';
const SWAPPA = '00000000-0000-4000-a000-000000000004';
const dbUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:54322/postgres';

const now = '2026-10-23T21:00:00.000Z';
const projectRow = {
  id: projectId,
  user_id: userId,
  name: 'iPhone 13 drill',
  description: null,
  category: 'smartphone',
  natural_language_query: 'iPhone 13',
  structured_query: { category: 'smartphone', brands: ['Apple'], models: ['iPhone 13'] },
  status: 'active',
  taxonomy_version: '1.0.0',
  interpreter_provider: 'deterministic',
  interpreter_model: 'rules-pt-BR',
  interpreter_version: '1.0.0',
  interpreted_at: now,
  interpretation_confidence: 0.9,
  interpretation_ambiguities: [],
  interpretation_warnings: [],
  unidentified_fields: [],
  deleted_at: null,
  created_at: now,
  updated_at: now,
};

const env = {
  SUPABASE_URL: 'http://supabase.local',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  WEB_ORIGIN: 'http://localhost:3000',
} as never;

afterEach(() => vi.unstubAllGlobals());

describe('S8 health classification', () => {
  const health = (code: string) =>
    buildDegradedCollectorHealth(
      '77777777-7777-4777-a777-777777777777',
      1,
      SWAPPA,
      'swappa-html-fixture',
      4,
      new ConnectorError('failed', 'permanent', code),
    ).state;

  it('keeps blocks distinguishable so the circuit can react to each one', () => {
    expect(health('CAPTCHA')).toBe('CAPTCHA');
    expect(health('RATE_LIMITED')).toBe('RATE_LIMITED');
    expect(health('LOGIN_REQUIRED')).toBe('LOGIN_REQUIRED');
    expect(health('CONTENT_CHANGED')).toBe('CONTENT_CHANGED');
    expect(health('SOURCE_BLOCKED')).toBe('ERROR');
  });
});

describe('S8 worker gates', () => {
  it('refuses a collection with 503 while the circuit is open, before creating a run', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/auth/v1/user')) return Response.json({ id: userId, email: 'o@x.test' });
      if (url.includes('/rest/v1/profiles')) return new Response(null, { status: 201 });
      if (url.includes('/rest/v1/research_projects')) return Response.json([projectRow]);
      if (url.includes('/rpc/source_circuit_allows'))
        return Response.json([
          {
            allowed: false,
            state: 'open',
            reason: 'SOURCE_BLOCKED',
            reopen_after: '2026-10-24T04:00:00Z',
          },
        ]);
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);
    const response = await worker.fetch(
      new Request(`http://worker.local/api/projects/${projectId}/collection-runs`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer user-jwt',
          'Content-Type': 'application/json',
          'Idempotency-Key': 'drill-blocked-1',
        },
        body: JSON.stringify({ sourceId: SWAPPA }),
      }),
      env,
      {} as never,
    );
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain('SOURCE_BLOCKED');
    const gate = fetcher.mock.calls.find(([input]) =>
      String(input).includes('source_circuit_allows'),
    );
    expect(JSON.parse(String((gate?.[1] as RequestInit).body))).toEqual({ p_source_id: SWAPPA });
    expect(fetcher.mock.calls.some(([input]) => String(input).includes('collection_run'))).toBe(
      false,
    );
  });

  it('turns every dead-lettered message into an incident and acknowledges it', async () => {
    const posted: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        if (!String(input).endsWith('/rest/v1/incidents')) throw new Error(`unexpected ${input}`);
        posted.push(JSON.parse(String(init?.body)));
        return Response.json([{}], { status: 201 });
      }),
    );
    const ack = vi.fn();
    await worker.queue(
      {
        queue: 'ebay-collect-dlq',
        messages: [{ body: { version: '1', runId: 'r1' }, ack }],
      } as never,
      env,
    );
    expect(ack).toHaveBeenCalledOnce();
    expect(posted).toEqual([
      {
        kind: 'DLQ_MESSAGE',
        evidence: { queue: 'ebay-collect-dlq', body: { version: '1', runId: 'r1' } },
      },
    ]);
  });
});

describe('S8 circuit breaker in the database', () => {
  let client: Client | null = null;

  beforeAll(async () => {
    const candidate = new Client({ connectionString: dbUrl });
    try {
      await candidate.connect();
      client = candidate;
    } catch {
      await candidate.end().catch(() => {});
    }
  });
  afterAll(async () => {
    if (client) await client.end();
  });

  const apply = (state: string, code: string, origin = 'collection') =>
    client!.query('SELECT apply_source_health($1, $2, $3::jsonb, $4)', [
      SWAPPA,
      state,
      JSON.stringify(code ? [code] : []),
      origin,
    ]);
  const circuit = async () =>
    (await client!.query('SELECT * FROM source_circuits WHERE source_id = $1', [SWAPPA])).rows[0];
  const allows = async () =>
    (await client!.query('SELECT * FROM source_circuit_allows($1)', [SWAPPA])).rows[0];
  const openIncidents = async () =>
    (
      await client!.query(
        `SELECT kind FROM incidents WHERE source_id = $1 AND status = 'open' ORDER BY kind`,
        [SWAPPA],
      )
    ).rows.map((row) => row.kind);

  it('opens on a block, lets one probe through after cool-down and closes on success', async (ctx) => {
    if (!client) return ctx.skip();
    await client.query('BEGIN');
    try {
      await client.query('DELETE FROM source_circuits WHERE source_id = $1', [SWAPPA]);
      await client.query('DELETE FROM incidents WHERE source_id = $1', [SWAPPA]);
      await client.query('DELETE FROM collector_health_checks WHERE source_id = $1', [SWAPPA]);
      await client.query('DELETE FROM canary_runs WHERE source_id = $1', [SWAPPA]);

      await apply('ERROR', 'SOURCE_LIVE_NOT_PERMITTED');
      expect(await circuit()).toBeUndefined();

      await apply('ERROR', 'SOURCE_BLOCKED');
      expect(await circuit()).toMatchObject({ state: 'open', reason: 'SOURCE_BLOCKED' });
      expect(await openIncidents()).toEqual(['SOURCE_BLOCKED']);
      expect(await allows()).toMatchObject({ allowed: false, state: 'open' });

      await client.query(
        `UPDATE source_circuits SET reopen_after = NOW() - INTERVAL '1 minute' WHERE source_id = $1`,
        [SWAPPA],
      );
      expect(await allows()).toMatchObject({ allowed: true, state: 'half_open' });
      expect(await allows()).toMatchObject({ allowed: false, state: 'half_open' });

      await apply('NORMAL', '');
      expect(await circuit()).toMatchObject({ state: 'closed', consecutive_failures: 0 });
      expect(await openIncidents()).toEqual([]);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('reopens on a failed probe and trips after three ordinary failures', async (ctx) => {
    if (!client) return ctx.skip();
    await client.query('BEGIN');
    try {
      await client.query('DELETE FROM source_circuits WHERE source_id = $1', [SWAPPA]);
      await apply('ERROR', 'UPSTREAM_TIMEOUT');
      await apply('ERROR', 'UPSTREAM_TIMEOUT');
      expect(await circuit()).toMatchObject({ state: 'closed', consecutive_failures: 2 });
      await apply('ERROR', 'UPSTREAM_TIMEOUT');
      expect(await circuit()).toMatchObject({ state: 'open', reason: 'UPSTREAM_TIMEOUT' });

      await client.query(
        `UPDATE source_circuits SET state = 'half_open', probe_started_at = NOW() WHERE source_id = $1`,
        [SWAPPA],
      );
      await apply('ERROR', 'UPSTREAM_TIMEOUT');
      expect(await circuit()).toMatchObject({ state: 'open', probe_started_at: null });
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('keeps the error-budget incident open until the window recovers', async (ctx) => {
    if (!client) return ctx.skip();
    await client.query('BEGIN');
    try {
      await client.query('DELETE FROM incidents WHERE source_id = $1', [SWAPPA]);
      await client.query('DELETE FROM collector_health_checks WHERE source_id = $1', [SWAPPA]);
      await client.query('DELETE FROM canary_runs WHERE source_id = $1', [SWAPPA]);
      const canary = (ok: boolean, minutesAgo: number) =>
        client!.query(
          `INSERT INTO canary_runs (source_id, ok, items, expected_min_items, latency_ms, checked_at)
           VALUES ($1, $2, 0, 5, 10, NOW() - make_interval(mins => $3))`,
          [SWAPPA, ok, minutesAgo],
        );
      for (const minutesAgo of [50, 40, 30]) await canary(false, minutesAgo);
      for (const minutesAgo of [20, 10]) await canary(true, minutesAgo);
      expect(await openIncidents()).toContain('ERROR_BUDGET');
      // One success is not enough: 3/6 is still under budget.
      await canary(true, 5);
      expect(await openIncidents()).toContain('ERROR_BUDGET');
      for (const minutesAgo of [4, 3, 2, 1]) await canary(true, minutesAgo);
      expect(await openIncidents()).not.toContain('ERROR_BUDGET');
    } finally {
      await client.query('ROLLBACK');
    }
  });
});
