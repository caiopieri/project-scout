import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseRestObservationEventRepository } from '@scout/database/observation-events';

afterEach(() => vi.unstubAllGlobals());

const config = {
  baseUrl: 'http://supabase.local',
  anonKey: 'service',
  accessToken: 'service',
};

describe('F3 listing lifecycle observation adapter', () => {
  it('filters by source and external listing id and validates event payloads', async () => {
    let requestedUrl = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        requestedUrl = String(input);
        return Response.json([
          {
            id: '44444444-4444-4444-a444-444444444444',
            source_id: '00000000-0000-4000-a000-000000000001',
            event_type: 'REMOVED',
            subject_type: 'listing',
            subject_external_id: 'listing/a?1',
            dedupe_key: 'removed-1',
            observed_at: '2026-08-01T00:00:00.000Z',
            schema_version: 'f0.events.v1',
            payload: { status: 'completed' },
          },
        ]);
      }),
    );

    const events = await new SupabaseRestObservationEventRepository(config).findByListing(
      '00000000-0000-4000-a000-000000000001',
      'listing/a?1',
    );

    expect(requestedUrl).toContain('subject_type=eq.listing');
    expect(requestedUrl).toContain('subject_external_id=eq.listing%2Fa%3F1');
    expect(events[0]).toMatchObject({ type: 'REMOVED', subjectExternalId: 'listing/a?1' });
    expect(events[0].observedAt).toEqual(new Date('2026-08-01T00:00:00.000Z'));
  });

  it('rejects malformed source ids before making a REST request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new SupabaseRestObservationEventRepository(config).findByListing('bad', 'x'),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unsupported event types from the database boundary', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json([
          {
            id: '44444444-4444-4444-a444-444444444444',
            source_id: '00000000-0000-4000-a000-000000000001',
            event_type: 'PURCHASED',
            subject_type: 'listing',
            subject_external_id: 'listing-1',
            dedupe_key: 'purchased-1',
            observed_at: '2026-08-01T00:00:00.000Z',
            schema_version: 'f0.events.v1',
            payload: {},
          },
        ]),
      ),
    );

    await expect(
      new SupabaseRestObservationEventRepository(config).findByListing(
        '00000000-0000-4000-a000-000000000001',
        'listing-1',
      ),
    ).rejects.toThrow();
  });
});
