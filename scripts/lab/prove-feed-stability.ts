// Proves snapshot pagination: page 1 at snapshot T, a new listing arrives, page 2 at T is
// unchanged and the arrival is only counted in newSinceSnapshot.
// Usage: npx vite-node scripts/lab/prove-feed-stability.ts <projectId>
import pg from 'pg';
import { callWorker, ensureUser, readLocalSupabase, workerEnv } from './local-env';

type Page = {
  snapshot: string;
  items: Array<{ id: string }>;
  nextOffset: number | null;
  newSinceSnapshot: number;
};

const main = async () => {
  const projectId = process.argv[2];
  const supabase = readLocalSupabase();
  const { accessToken } = await ensureUser(supabase, 'lab@scout.local', 'lab-password-123');
  const env = workerEnv(supabase);
  const feed = async (query: string) => {
    const { status, body } = await callWorker(
      env,
      accessToken,
      `/api/projects/${projectId}/feed?${query}`,
    );
    if (status !== 200) throw new Error(`feed ${status}: ${JSON.stringify(body)}`);
    return body as Page;
  };
  const first = await feed('group=rankable&sort=discount&limit=10');
  const snapshot = encodeURIComponent(first.snapshot);
  const before = await feed(`group=rankable&sort=discount&limit=10&offset=10&snapshot=${snapshot}`);
  const client = new pg.Client({ connectionString: supabase.dbUrl });
  await client.connect();
  const external = `lab-arrival-${Date.now()}`;
  const { rows } = await client.query(
    `INSERT INTO listings (source_id, external_id, url, title, description, condition, currency, price, shipping_cost,
       total_visible_cost, inferred_product, raw_data_path, raw_data_metadata)
     VALUES ('00000000-0000-4000-a000-000000000001',$1,$2,'Apple iPhone 13 Used arrival','Synthetic','Used','USD',50,0,50,
       '{"brand":"Apple","model":"iPhone 13","confidence":0.9}','lab/arrival.json','{"shippingCostKnown":true,"labSynthetic":true}')
     RETURNING id`,
    [external, `https://www.ebay.com/itm/${external}`],
  );
  await client.query(
    'INSERT INTO research_project_listings (project_id, listing_id) VALUES ($1,$2)',
    [projectId, rows[0].id],
  );
  await client.end();
  const after = await feed(`group=rankable&sort=discount&limit=10&offset=10&snapshot=${snapshot}`);
  const fresh = await feed('group=rankable&sort=discount&limit=10');
  console.log(
    JSON.stringify(
      {
        snapshot: first.snapshot,
        page2UnchangedAfterArrival:
          JSON.stringify(before.items.map((i) => i.id)) ===
          JSON.stringify(after.items.map((i) => i.id)),
        newSinceSnapshot: after.newSinceSnapshot,
        arrivalOnTopOfFreshSnapshot: fresh.items[0]?.id === rows[0].id,
      },
      null,
      2,
    ),
  );
};

void main();
