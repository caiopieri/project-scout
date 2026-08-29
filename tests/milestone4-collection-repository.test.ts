import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseRestCollectionRunRepository } from '@scout/database/collection';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Milestone 4 collection run claim boundary', () => {
  it('claims only the expected pending attempt and fixes a five-minute lease', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-27T15:00:00.000Z'));
    let requestUrl = '';
    let requestBody: Record<string, unknown> | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        requestUrl = String(input);
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Response.json([
          {
            id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
            project_id: 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb',
            source_id: 'cccccccc-cccc-4ccc-accc-cccccccccccc',
            status: 'running',
            idempotency_key: 'collection-v1',
            queued_at: null,
            started_at: '2026-08-27T15:00:00.000Z',
            finished_at: null,
            lease_expires_at: '2026-08-27T15:05:00.000Z',
            attempt_count: 1,
            items_found: 0,
            items_created: 0,
            items_updated: 0,
            estimated_cost: 0,
            provider: 'unconfigured',
            error: null,
            error_kind: null,
            error_code: null,
          },
        ]);
      }),
    );

    const run = await new SupabaseRestCollectionRunRepository({
      baseUrl: 'http://supabase.local',
      anonKey: 'service',
      accessToken: 'service',
    }).claim('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 0, new Date('2026-08-27T14:00:00.000Z'));

    expect(requestUrl).toContain('status=eq.pending');
    expect(requestUrl).toContain('attempt_count=eq.0');
    expect(requestBody).toMatchObject({
      status: 'running',
      attempt_count: 1,
      started_at: '2026-08-27T14:00:00.000Z',
      lease_expires_at: '2026-08-27T15:05:00.000Z',
      error: null,
      error_kind: null,
      error_code: null,
    });
    expect(run?.attemptCount).toBe(1);
  });

  it('returns null when the conditional claim loses a race', async () => {
    const fetchMock = vi.fn(async () => Response.json([]));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new SupabaseRestCollectionRunRepository({
        baseUrl: 'http://supabase.local',
        anonKey: 'service',
        accessToken: 'service',
      }).claim('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 1),
    ).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('persists running request position without allowing a terminal overwrite', async () => {
    let requestUrl = '';
    let requestBody: Record<string, unknown> | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        requestUrl = String(input);
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Response.json([
          {
            id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
            project_id: 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb',
            source_id: 'cccccccc-cccc-4ccc-accc-cccccccccccc',
            status: 'running',
            idempotency_key: 'collection-v1',
            queued_at: null,
            started_at: '2026-08-27T15:00:00.000Z',
            finished_at: null,
            lease_expires_at: '2026-08-27T15:05:00.000Z',
            attempt_count: 1,
            items_found: 5,
            items_created: 0,
            items_updated: 0,
            estimated_cost: 0,
            requests_used: 6,
            request_budget: 10,
            provider: 'ebay-api-production-v1',
            error: null,
            error_kind: null,
            error_code: null,
          },
        ]);
      }),
    );

    const run = await new SupabaseRestCollectionRunRepository({
      baseUrl: 'http://supabase.local',
      anonKey: 'service',
      accessToken: 'service',
    }).updateProgress('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', {
      itemsFound: 5,
      pagesFetched: 1,
      requestMetrics: { requestsUsed: 6, requestBudget: 10 },
    });

    expect(requestUrl).toContain('status=eq.running');
    expect(requestBody).toEqual({
      items_found: 5,
      requests_used: 6,
      request_budget: 10,
      truncated: false,
    });
    expect(run).toMatchObject({ itemsFound: 5, requestsUsed: 6, requestBudget: 10 });
  });
});
