// Attaches the synthetic checkup photos to the top finalists of a project (by score), so the
// visual checkup can be exercised. Phones that claim to work get the cracked-screen photo first.
// Usage: npx vite-node scripts/lab/seed-checkup-images.ts <projectId> <imageBaseUrl>
import pg from 'pg';
import { callWorker, ensureUser, readLocalSupabase, workerEnv } from './local-env';

const main = async () => {
  const [projectId, baseUrl] = process.argv.slice(2);
  const supabase = readLocalSupabase();
  const { accessToken } = await ensureUser(supabase, 'lab@scout.local', 'lab-password-123');
  const feed = (
    await callWorker(
      workerEnv(supabase),
      accessToken,
      `/api/projects/${projectId}/feed?group=rankable&sort=score&limit=5`,
    )
  ).body as { items: Array<{ id: string; title: string; description: string }> };
  const client = new pg.Client({ connectionString: supabase.dbUrl });
  await client.connect();
  const plan: Array<{ id: string; title: string; photos: string[] }> = [];
  for (const listing of feed.items) {
    const laptop = /macbook/i.test(listing.title);
    const claimsWorking = /works|tested|perfect/i.test(listing.description);
    const photos = laptop
      ? ['laptop_missing_key.jpg']
      : claimsWorking && !plan.some((entry) => entry.photos.includes('phone_cracked.jpg'))
        ? ['phone_cracked.jpg', 'phone_back_dent.jpg']
        : ['phone_clean.jpg'];
    await client.query('DELETE FROM listing_images WHERE listing_id = $1', [listing.id]);
    for (const [position, photo] of photos.entries())
      await client.query(
        'INSERT INTO listing_images (listing_id, url, position) VALUES ($1,$2,$3)',
        [listing.id, `${baseUrl}/${photo}`, position],
      );
    plan.push({ id: listing.id, title: listing.title, photos });
  }
  await client.end();
  console.log(
    JSON.stringify(
      plan.map((entry) => ({
        ...entry,
        description: feed.items.find((item) => item.id === entry.id)?.description,
      })),
      null,
      2,
    ),
  );
};

void main();
