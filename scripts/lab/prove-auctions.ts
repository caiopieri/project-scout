// Auction drill over HTTP against the running Node worker with GSA_MODE=live (api.data.gov key).
//  1. one live sweep of the GSA active list (electronics kept, terms parsed, bids recorded);
//  2. a real laptop lot: terms with evidence, cost at the current bid with nothing assumed, then
//     with explicit premises, and the highest bid that keeps a target cost per useful unit;
//  3. a lot monitor with a limit below the current bid; the clock is moved and the scheduler runs
//     (it reuses the recent sweep, alerts nothing new and schedules the next look by close date).
// Usage: npx vite-node scripts/lab/prove-auctions.ts [titleFilter]
import { ensureUser, readLocalSupabase } from './local-env';

const api = 'http://127.0.0.1:8787';

const main = async () => {
  const filter = process.argv[2] ?? 'Probook';
  const supabase = readLocalSupabase();
  const owner = await ensureUser(supabase, 'lab@scout.local', 'lab-password-123');
  const call = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${api}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${owner.accessToken}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  const out: Record<string, unknown> = {};
  out.sweep = (await call('/api/ops/auctions/sweep', { method: 'POST' })).body;

  const lots = (await call(`/api/auctions/lots?q=${encodeURIComponent(filter)}`))
    .body as unknown as Array<Record<string, unknown>>;
  const lot = lots[0];
  if (!lot) throw new Error(`no lot matching ${filter}`);
  const before = (await call(`/api/auctions/lots/${String(lot.id)}`)).body;
  out.lot = {
    title: lot.title,
    closesOn: lot.closesOn,
    currentBidMinor: lot.currentBidMinor,
    bidders: lot.bidders,
    terms: lot.terms,
  };
  out.costWithoutPremises = before.costAtCurrentBid;
  await call(`/api/auctions/lots/${String(lot.id)}/premises`, {
    method: 'PUT',
    body: JSON.stringify({
      buyerPremiumPercent: 0,
      salesTaxPercent: 8,
      removalMinor: 12000,
      usefulRatio: 0.7,
    }),
  });
  const after = (await call(`/api/auctions/lots/${String(lot.id)}?targetUnitCostMinor=6000`)).body;
  out.costWithPremises = after.costAtCurrentBid;
  out.maxBidForTarget = after.maxBidForTarget;
  out.bidHistory = after.bids;

  const created = await call('/api/monitors', {
    method: 'POST',
    body: JSON.stringify({ kind: 'lot', lotId: lot.id, cutoff: { maxBidMinor: 10000 } }),
  });
  out.lotMonitor = { status: created.status, matchingAtCreation: created.body.matchingAtCreation };
  const monitorId = (created.body.monitor as Record<string, unknown> | undefined)?.id;
  if (monitorId) {
    await fetch(`${supabase.apiUrl}/rest/v1/monitors?id=eq.${String(monitorId)}`, {
      method: 'PATCH',
      headers: {
        apikey: supabase.serviceRoleKey,
        Authorization: `Bearer ${supabase.serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ next_run_at: new Date(Date.now() - 60_000).toISOString() }),
    });
    out.schedulerRun = (await call('/api/ops/monitors/run', { method: 'POST' })).body.results;
    const monitors = (await call('/api/monitors')).body as unknown as Array<
      Record<string, unknown>
    >;
    out.nextLotCheck = monitors.find((monitor) => monitor.id === monitorId)?.nextRunAt;
  }
  console.log(JSON.stringify(out, null, 2));
};

void main();
