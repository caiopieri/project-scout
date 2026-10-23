import { afterEach, describe, expect, it, vi } from 'vitest';
import { localAgentResultSchema } from '@scout/schemas';
import worker from '../apps/worker/src/index';

const record = (payload: Record<string, unknown>) => ({
  preview: {
    externalId: 'LALI60499',
    url: 'https://swappa.com/listing/view/LALI60499',
    title: 'Fair Apple iPhone 13',
    price: { amountMinor: 19500, currency: 'USD' },
  },
  payload,
});

const env = {
  SUPABASE_URL: 'http://supabase.local',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  WEB_ORIGIN: 'http://localhost:3000',
} as never;

const call = (path: string, headers: Record<string, string>, body: unknown = {}) =>
  worker.fetch(
    new Request(`http://worker.local${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
    env,
    {} as never,
  );

afterEach(() => vi.unstubAllGlobals());

describe('S6 Local Agent contract', () => {
  it('accepts extracted records and refuses anything carrying session data', () => {
    expect(
      localAgentResultSchema.safeParse({
        status: 'completed',
        records: [record({ source: 'swappa', card: { grade: 'Fair' } })],
      }).success,
    ).toBe(true);
    for (const leaked of [
      { cookie: 'sid=1' },
      { card: { sessionId: 'x' } },
      { headers: { Authorization: 'Bearer y' } },
    ])
      expect(
        localAgentResultSchema.safeParse({ status: 'completed', records: [record(leaked)] })
          .success,
      ).toBe(false);
    expect(
      localAgentResultSchema.safeParse({ status: 'failed', errorCode: 'LOGIN_REQUIRED' }).success,
    ).toBe(true);
  });

  it('requires a valid agent token and never falls back to user auth', async () => {
    const fetcher = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes('/local_agents?token_hash=')) return Response.json([]);
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);
    expect((await call('/api/local-agent/claim', {})).status).toBe(401);
    expect(
      (await call('/api/local-agent/claim', { Authorization: 'Bearer user-jwt' })).status,
    ).toBe(401);
    expect((await call('/api/local-agent/claim', { Authorization: 'Agent wrong' })).status).toBe(
      401,
    );
    const lookup = String(fetcher.mock.calls[0][0]);
    expect(lookup).toMatch(/token_hash=eq\.[a-f0-9]{64}/);
    expect(lookup).not.toContain('wrong');
  });

  it('only lets an agent finish the task it currently holds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.includes('/local_agents?token_hash='))
          return Response.json([{ id: 'a1', user_id: 'u1', name: 'lab' }]);
        if (url.includes('/local_agent_tasks?id=eq.')) return Response.json([]);
        throw new Error(`unexpected ${url}`);
      }),
    );
    const response = await call(
      '/api/local-agent/tasks/11111111-1111-4111-a111-111111111111/result',
      { Authorization: 'Agent token' },
      { status: 'completed', records: [record({ source: 'swappa' })] },
    );
    expect(response.status).toBe(409);
  });
});
