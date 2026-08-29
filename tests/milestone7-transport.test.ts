import { describe, expect, it, vi } from 'vitest';
import { SupabaseRestTextAnalysisRunRepository } from '@scout/database/text-analysis';
import { TEXT_ANALYSIS_DESCRIPTION_MAX_LENGTH } from '@scout/schemas';

describe('text analysis transport boundary', () => {
  it('bounds oversized marketplace descriptions before queue analysis', async () => {
    const description = 'x'.repeat(TEXT_ANALYSIS_DESCRIPTION_MAX_LENGTH + 5);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              {
                analysis_run_id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
                listing_id: 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb',
                title: 'Oversized listing',
                description,
                condition: 'used',
                attempt_count: 1,
              },
            ]),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );

    const job = await new SupabaseRestTextAnalysisRunRepository({
      baseUrl: 'http://supabase.local',
      anonKey: 'anon',
      accessToken: 'token',
    }).claim('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');

    expect(job?.description).toHaveLength(TEXT_ANALYSIS_DESCRIPTION_MAX_LENGTH);
    vi.unstubAllGlobals();
  });
});
