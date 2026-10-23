import { afterEach, describe, expect, it, vi } from 'vitest';
import { sliceListingFeed } from '@scout/domain';
import { SupabaseRestUserListingActionRepository } from '../packages/database/src/repositories/supabase/SupabaseRestUserListingActionRepository';

const snapshot = new Date('2026-09-10T00:00:00.000Z');
const item = (id: string, overrides: Record<string, unknown> = {}) =>
  ({
    id,
    condition: 'Used',
    firstCollectedAt: new Date('2026-09-01T00:00:00.000Z'),
    referenceDiscount: { status: 'known', discountBasisPoints: 100 },
    landedCost: {
      status: 'known',
      totalMinor: 30000,
      components: { itemPrice: { amountMinor: 29000 } },
    },
    score: { status: 'known', value: 60 },
    userAction: null,
    ...overrides,
  }) as never;
const action = (favorite: boolean, label: string | null) => ({
  favorite,
  label,
  decision: 'pending',
  notes: null,
  updatedAt: snapshot,
});

const acervo = [
  item('plain'),
  item('loved', { userAction: action(true, null) }),
  item('short', { userAction: action(false, 'shortlisted') }),
  item('gone', { userAction: action(false, 'discarded') }),
  item('unscored', { score: { status: 'INCOMPLETO', value: null } }),
  item('parts', { condition: 'For parts or not working', score: { status: 'known', value: 20 } }),
];
const ids = (lens: Record<string, unknown>) =>
  sliceListingFeed(acervo, {
    group: 'rankable',
    sort: 'newest',
    snapshot,
    offset: 0,
    limit: 50,
    lens: { hideDiscarded: 'true', ...lens } as never,
  });

describe('S3.4b lens filters and S3.5 user marks', () => {
  it('hides discarded items by default and reports how many the lens hid', () => {
    const page = ids({});
    expect(page.items.map(({ id }) => id).sort()).toEqual([
      'loved',
      'parts',
      'plain',
      'short',
      'unscored',
    ]);
    expect(page.filteredOut).toBe(1);
    expect(ids({ label: 'discarded' }).items.map(({ id }) => id)).toEqual(['gone']);
    expect(ids({ hideDiscarded: 'false' }).items).toHaveLength(6);
  });

  it('narrows by heart, label, condition and score without letting unknown pass a number', () => {
    expect(ids({ favorite: 'true' }).items.map(({ id }) => id)).toEqual(['loved']);
    expect(ids({ label: 'shortlisted' }).items.map(({ id }) => id)).toEqual(['short']);
    expect(ids({ condition: 'for parts or not working' }).items.map(({ id }) => id)).toEqual([
      'parts',
    ]);
    const scored = ids({ minScore: 50 }).items.map(({ id }) => id);
    expect(scored).not.toContain('unscored');
    expect(scored).not.toContain('parts');
  });
});

describe('S3.5 per-user listing actions', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('upserts on (user, listing) and sends only the fields being changed', async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) =>
      Response.json([
        {
          listing_id: '22222222-2222-4222-a222-222222222222',
          favorite: true,
          label: 'shortlisted',
          decision: 'pending',
          notes: null,
          updated_at: '2026-09-10T00:00:00.000Z',
          echo: init?.body,
        },
      ]),
    );
    vi.stubGlobal('fetch', fetcher);
    const repository = new SupabaseRestUserListingActionRepository({
      baseUrl: 'https://supabase.fixture',
      anonKey: 'anon',
      accessToken: 'token',
    });
    const result = await repository.upsert(
      '11111111-1111-4111-a111-111111111111',
      '22222222-2222-4222-a222-222222222222',
      { label: 'shortlisted' },
    );
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toContain('user_listing_actions?on_conflict=user_id,listing_id');
    expect((init?.headers as Record<string, string>).Prefer).toContain('merge-duplicates');
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ label: 'shortlisted' });
    expect(body).not.toHaveProperty('favorite');
    expect(body).not.toHaveProperty('project_id');
    expect(result).toMatchObject({ favorite: true, label: 'shortlisted' });
  });

  it('maps a policy refusal to a non-leaking error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"message":"row-level security"}', { status: 403 })),
    );
    const repository = new SupabaseRestUserListingActionRepository({
      baseUrl: 'https://supabase.fixture',
      anonKey: 'anon',
      accessToken: 'token',
    });
    await expect(
      repository.upsert(
        '11111111-1111-4111-a111-111111111111',
        '22222222-2222-4222-a222-222222222222',
        { favorite: true },
      ),
    ).rejects.toThrow('not allowed');
  });
});
