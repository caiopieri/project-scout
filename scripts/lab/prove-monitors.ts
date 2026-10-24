// Monitor drill over HTTP against the running Node worker (Swappa at the loopback /swappa path).
//  1. a search monitor (cutoff: at least 15% below the reference) and a listing monitor on the
//     Swappa listing LALI60499 are created; what already qualifies is recorded as read;
//  2. a synthetic eBay-like listing 30%+ below its segment arrives in the project (fixture), and
//     the loopback Swappa page lowers LALI60499 from $195 to $149;
//  3. the clock is moved (next_run_at in the past) and the scheduler runs: the search monitor
//     alerts on the arrival; the listing monitor asks for a Swappa collection, and the alert comes
//     from the queue consumer once that collection completes;
//  4. "Hoje" shows both alerts to the owner and nothing to another user; a second scheduler run
//     claims nothing.
// Usage: npx vite-node scripts/lab/prove-monitors.ts <projectId>
import { ensureUser, readLocalSupabase } from './local-env';

const api = 'http://127.0.0.1:8787';
const site = 'http://127.0.0.1:8098';
const EBAY = '00000000-0000-4000-a000-000000000001';

const main = async () => {
  const [projectId] = process.argv.slice(2);
  const supabase = readLocalSupabase();
  const owner = await ensureUser(supabase, 'lab@scout.local', 'lab-password-123');
  const other = await ensureUser(supabase, 'other@scout.local', 'other-password-123');
  const call = async (token: string, path: string, init: RequestInit = {}) => {
    const response = await fetch(`${api}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  const service = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${supabase.apiUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: supabase.serviceRoleKey,
        Authorization: `Bearer ${supabase.serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
    return response.json() as Promise<Array<Record<string, unknown>>>;
  };
  const out: Record<string, unknown> = {};

  // Clean start: no active monitors for the lab user, page at its recorded price.
  await service(`monitors?user_id=eq.${owner.userId}&active=is.true`, {
    method: 'PATCH',
    body: JSON.stringify({ active: false }),
  });
  await fetch(`${site}/__mode/good`, { method: 'POST' });
  const [swappaListing] = await service(
    'listings?external_id=eq.LALI60499&select=id,price,status&limit=1',
  );
  await service(`listings?id=eq.${String(swappaListing.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ price: '195.00', total_visible_cost: '195.00' }),
  });

  const search = await call(owner.accessToken, '/api/monitors', {
    method: 'POST',
    body: JSON.stringify({
      kind: 'search',
      projectId,
      cutoff: { minPercentBelowReference: 15 },
      cadenceMinutes: 60,
    }),
  });
  const watch = await call(owner.accessToken, '/api/monitors', {
    method: 'POST',
    body: JSON.stringify({
      kind: 'listing',
      listingId: swappaListing.id,
      projectId,
      cadenceMinutes: 60,
    }),
  });
  out.created = {
    search: { status: search.status, matchingAtCreation: search.body.matchingAtCreation },
    listing: {
      status: watch.status,
      baseline: (watch.body.monitor as Record<string, unknown> | undefined)?.baseline,
    },
  };
  const duplicate = await call(owner.accessToken, '/api/monitors', {
    method: 'POST',
    body: JSON.stringify({ kind: 'listing', listingId: swappaListing.id, projectId }),
  });
  out.duplicateListingMonitor = duplicate.status;

  // A new listing arrives well below the iPhone 13 Used reference (synthetic, labelled as such).
  const externalId = `lab-arrival-${Date.now()}`;
  const [arrival] = await service('listings?select=id', {
    method: 'POST',
    body: JSON.stringify({
      source_id: EBAY,
      external_id: externalId,
      url: `https://www.ebay.com/itm/${externalId}`,
      title: 'Apple iPhone 13 Used (lab arrival)',
      description: 'Works perfectly, battery health 91%. Synthetic lab listing.',
      condition: 'Used',
      currency: 'USD',
      price: '210.00',
      shipping_cost: '10.00',
      total_visible_cost: '220.00',
      status: 'active',
      inferred_product: { brand: 'Apple', model: 'iPhone 13', confidence: 0.9 },
      raw_data_path: `lab/${externalId}.json`,
      raw_content_hash: `lab-${externalId}`,
      raw_data_metadata: { shippingCostKnown: true, labSynthetic: true },
    }),
  });
  await service('research_project_listings', {
    method: 'POST',
    body: JSON.stringify({ project_id: projectId, listing_id: arrival.id }),
  });
  await service('price_history', {
    method: 'POST',
    body: JSON.stringify({
      listing_id: arrival.id,
      price: '210.00',
      shipping_cost: '10.00',
      status: 'active',
    }),
  });
  await fetch(`${site}/__mode/cheaper`, { method: 'POST' });

  // Move the clock: both monitors become due.
  const monitorIds = [
    (search.body.monitor as Record<string, unknown>).id,
    (watch.body.monitor as Record<string, unknown>).id,
  ];
  await service(`monitors?id=in.(${monitorIds.join(',')})`, {
    method: 'PATCH',
    body: JSON.stringify({ next_run_at: new Date(Date.now() - 60_000).toISOString() }),
  });
  const run = await call(owner.accessToken, '/api/ops/monitors/run', { method: 'POST' });
  out.schedulerRun = run.body.results;

  // Wait for the Swappa collection the listing monitor asked for; the consumer evaluates it.
  const [watchRow] = await service(
    `monitors?id=eq.${String(monitorIds[1])}&select=last_collection_run_id`,
  );
  let collection: Record<string, unknown> = {};
  for (let attempt = 0; attempt < 30; attempt += 1) {
    [collection] = await service(
      `collection_runs?id=eq.${String(watchRow.last_collection_run_id)}&select=status,items_found,error_code,source_id`,
    );
    if (['completed', 'failed'].includes(String(collection.status))) break;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  out.swappaCollection = collection;
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const today = (await call(owner.accessToken, '/api/today')).body as {
    alerts: Array<Record<string, unknown>>;
    arrived: { count: number };
  };
  out.todayOwner = {
    alerts: today.alerts.map((alert) => ({
      kind: alert.kind,
      payload: alert.payload,
      title: (alert.listing as Record<string, unknown> | null)?.title,
    })),
    arrived: today.arrived.count,
  };
  const otherToday = (await call(other.accessToken, '/api/today')).body as {
    alerts: unknown[];
  };
  out.todayOtherUser = { alerts: otherToday.alerts.length };
  out.secondSchedulerRun = (
    await call(owner.accessToken, '/api/ops/monitors/run', { method: 'POST' })
  ).body.results;
  await fetch(`${site}/__mode/good`, { method: 'POST' });
  console.log(JSON.stringify(out, null, 2));
};

void main();
