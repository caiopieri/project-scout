// Drives the real UI with the keyboard (J, S, H, X, Enter) on a project, then confirms through
// the API that labels and the heart were persisted per (user, listing) and that the feed lens
// and the inventory see them. Usage: npx vite-node scripts/lab/prove-triage.ts <projectName> <projectId> <out.png>
import { chromium } from 'playwright';
import { callWorker, ensureUser, readLocalSupabase, workerEnv } from './local-env';

const main = async () => {
  const [projectName, projectId, outFile] = process.argv.slice(2);
  const supabase = readLocalSupabase();
  const { accessToken, userId } = await ensureUser(supabase, 'lab@scout.local', 'lab-password-123');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('http://localhost:3000/');
  await page.evaluate(
    (session) => localStorage.setItem('scout.auth.session', JSON.stringify(session)),
    { access_token: accessToken, expires_in: 3600, user: { id: userId, email: 'lab@scout.local' } },
  );
  await page.reload();
  await page
    .locator('article', { hasText: projectName })
    .first()
    .getByRole('button', { name: 'Abrir' })
    .click();
  await page.locator('.feed-item').first().waitFor();
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  const wait = () => page.waitForTimeout(700);
  await page.keyboard.press('j'); // focus second item
  await page.keyboard.press('s'); // shortlist it
  await wait();
  await page.keyboard.press('h'); // heart it
  await wait();
  await page.keyboard.press('j'); // third item
  await page.keyboard.press('x'); // discard it
  await wait();
  await page.keyboard.press('k'); // back to second
  await page.keyboard.press('Enter'); // open dossier
  await page.locator('.drawer').waitFor();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: outFile, fullPage: false });
  const drawerText = await page.locator('.drawer').innerText();
  await browser.close();

  const env = workerEnv(supabase);
  const lensShortlist = (
    await callWorker(
      env,
      accessToken,
      `/api/projects/${projectId}/feed?group=rankable&label=shortlisted`,
    )
  ).body as {
    items: Array<{ id: string; userAction: unknown }>;
    filteredOut: number;
  };
  const lensDiscarded = (
    await callWorker(
      env,
      accessToken,
      `/api/projects/${projectId}/feed?group=rankable&label=discarded`,
    )
  ).body as {
    items: Array<{ id: string }>;
  };
  const defaultFeed = (
    await callWorker(env, accessToken, `/api/projects/${projectId}/feed?group=rankable&limit=100`)
  ).body as {
    items: Array<{ id: string }>;
    filteredOut: number;
  };
  const inventory = (await callWorker(env, accessToken, '/api/inventory?favorite=true')).body as {
    total: number;
    matched: number;
    items: Array<{ id: string; userAction: unknown }>;
  };
  console.log(
    JSON.stringify(
      {
        drawerHasSections: ['Custo total', 'Perguntas ao vendedor', 'Histórico de preço'].every(
          (section) => drawerText.toLowerCase().includes(section.toLowerCase()),
        ),
        shortlisted: lensShortlist.items.map((item) => item.userAction),
        discardedCount: lensDiscarded.items.length,
        defaultFeedHidesDiscarded: !defaultFeed.items.some(
          (item) => item.id === lensDiscarded.items[0]?.id,
        ),
        defaultFilteredOut: defaultFeed.filteredOut,
        inventory: { total: inventory.total, favorites: inventory.matched },
      },
      null,
      2,
    ),
  );
};

void main();
