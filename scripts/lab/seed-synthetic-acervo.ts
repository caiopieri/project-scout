// Seeds a synthetic, deterministic eBay-like acervo into the local Supabase so that cost,
// reference and ranking paths can be exercised end to end without source credentials.
// Usage: npx vite-node scripts/lab/seed-synthetic-acervo.ts
import pg from 'pg';
import { callWorker, ensureUser, readLocalSupabase, workerEnv } from './local-env';

const EBAY_SOURCE_ID = '00000000-0000-4000-a000-000000000001';
const segments = [
  { brand: 'Apple', model: 'iPhone 13', condition: 'Used', base: 32000, listings: 14 },
  {
    brand: 'Apple',
    model: 'iPhone 13',
    condition: 'For parts or not working',
    base: 14000,
    listings: 12,
  },
  {
    brand: 'Apple',
    model: 'MacBook Pro',
    variant: 'M1',
    condition: 'Used',
    base: 65000,
    listings: 11,
  },
  { brand: 'Apple', model: 'iPhone 12', condition: 'Used', base: 24000, listings: 4 },
  { brand: 'unknown', model: 'unknown', condition: 'Used', base: 20000, listings: 3 },
];

// Deterministic pseudo-random sequence so every run seeds the same acervo.
let seed = 42;
const random = () => {
  seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
  return seed / 2 ** 31;
};

const main = async () => {
  const supabase = readLocalSupabase();
  const { accessToken, userId } = await ensureUser(supabase, 'lab@scout.local', 'lab-password-123');
  const env = workerEnv(supabase);
  const interpreted = await callWorker(env, accessToken, '/api/intent/interpret', {
    method: 'POST',
    body: JSON.stringify({ query: 'iPhone 13 usado ou para peças até US$ 400' }),
  });
  if (interpreted.status !== 200)
    throw new Error(`Interpret failed: ${JSON.stringify(interpreted.body)}`);
  const criteria = (interpreted.body as { criteria: unknown }).criteria;
  const created = await callWorker(env, accessToken, '/api/projects', {
    method: 'POST',
    body: JSON.stringify({
      name: `Lab acervo ${new Date().toISOString().slice(0, 19)}`,
      naturalLanguageQuery: 'iPhone 13 usado ou para peças até US$ 400',
      structuredQuery: criteria,
      status: 'active',
    }),
  });
  if (created.status !== 201)
    throw new Error(`Project creation failed: ${JSON.stringify(created.body)}`);
  const projectId = (created.body as { id: string }).id;

  const client = new pg.Client({ connectionString: supabase.dbUrl });
  await client.connect();
  let listingCount = 0;
  let observationCount = 0;
  try {
    await client.query('BEGIN');
    for (const segment of segments) {
      for (let index = 0; index < segment.listings; index += 1) {
        const price = Math.round(segment.base * (0.7 + random() * 0.6));
        const shippingKnown = random() > 0.15;
        const shipping = shippingKnown ? Math.round(random() * 2500) : 0;
        const externalId = `lab-${projectId.slice(0, 8)}-${segment.model.replace(/\W/g, '')}-${segment.condition.slice(0, 4)}-${index}`;
        const daysAgo = Math.floor(random() * 25);
        const { rows } = await client.query(
          `INSERT INTO listings (source_id, external_id, url, title, description, condition, currency, price,
             shipping_cost, total_visible_cost, status, first_collected_at, last_updated_at, inferred_product,
             raw_data_path, raw_content_hash, raw_data_metadata)
           VALUES ($1,$2,$3,$4,$5,$6,'USD',$7,$8,$9,'active',NOW() - ($10 || ' days')::interval, NOW(),$11,$12,$13,$14)
           RETURNING id`,
          [
            EBAY_SOURCE_ID,
            externalId,
            `https://www.ebay.com/itm/${externalId}`,
            `${segment.brand} ${segment.model} ${segment.variant ?? ''} ${segment.condition} #${index}`.replace(
              /\s+/g,
              ' ',
            ),
            'Synthetic lab listing. Not a real offer.',
            segment.condition,
            (price / 100).toFixed(2),
            (shipping / 100).toFixed(2),
            ((price + shipping) / 100).toFixed(2),
            String(daysAgo),
            JSON.stringify({
              brand: segment.brand,
              model: segment.model,
              ...(segment.variant ? { variant: segment.variant } : {}),
              confidence: 0.9,
            }),
            `lab/${externalId}.json`,
            `lab-${externalId}`,
            JSON.stringify({ shippingCostKnown: shippingKnown, labSynthetic: true }),
          ],
        );
        const listingId = rows[0].id as string;
        await client.query(
          'INSERT INTO research_project_listings (project_id, listing_id) VALUES ($1,$2)',
          [projectId, listingId],
        );
        const observations = 1 + Math.floor(random() * 2);
        for (let step = 0; step < observations; step += 1) {
          await client.query(
            `INSERT INTO price_history (listing_id, price, shipping_cost, status, collected_at)
             VALUES ($1,$2,$3,'active', NOW() - ($4 || ' days')::interval)`,
            [
              listingId,
              (price / 100).toFixed(2),
              (shipping / 100).toFixed(2),
              String(Math.max(0, daysAgo - step * 3)),
            ],
          );
          observationCount += 1;
        }
        listingCount += 1;
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
  console.log(JSON.stringify({ userId, projectId, listingCount, observationCount }, null, 2));
};

void main();
