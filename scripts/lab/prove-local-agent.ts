// End-to-end Local Agent proof against the loopback login site: register an agent, run a task
// without a session (expect LOGIN_REQUIRED), log in by hand in the agent's browser profile, run
// again, and confirm the session cookie never reached the server.
// Usage: npx vite-node scripts/lab/prove-local-agent.ts <profileDir>
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { callWorker, ensureUser, readLocalSupabase, workerEnv } from './local-env';
import { BrowserScrapingProvider } from '../../apps/local-agent/src/BrowserScrapingProvider';
import { runOnce } from '../../apps/local-agent/src/index';

const SWAPPA = '00000000-0000-4000-a000-000000000004';
const api = 'http://127.0.0.1:8787';

const main = async () => {
  const [profileDir] = process.argv.slice(2);
  const supabase = readLocalSupabase();
  const { accessToken } = await ensureUser(supabase, 'lab@scout.local', 'lab-password-123');
  const user = async (path: string, body?: unknown) => {
    const response = await fetch(`${api}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return (await response.json()) as Record<string, unknown>;
  };
  const env = workerEnv(supabase);
  const interpreted = (
    await callWorker(env, accessToken, '/api/intent/interpret', {
      method: 'POST',
      body: JSON.stringify({ query: 'iPhone 13 usado na conta logada' }),
    })
  ).body as { criteria: unknown };
  const project = (await user('/api/projects', {
    name: `Lab local agent ${Date.now()}`,
    naturalLanguageQuery: 'iPhone 13 usado na conta logada',
    structuredQuery: interpreted.criteria,
    status: 'active',
  })) as { id: string };
  const registered = (await user('/api/local-agents', { name: 'lab-laptop' })) as {
    id: string;
    token: string;
  };
  process.env.SCOUT_API = api;
  process.env.SCOUT_AGENT_TOKEN = registered.token;
  process.env.SCOUT_SOURCE_BASE_SWAPPA = 'http://127.0.0.1:8098';
  const browser = new BrowserScrapingProvider(profileDir, 0);

  await user(`/api/projects/${project.id}/local-tasks`, { sourceId: SWAPPA });
  const withoutSession = await runOnce(browser);
  await browser.close();

  // The person signs in by hand in the agent's own profile (simulated here with Playwright).
  const human = await chromium.launchPersistentContext(profileDir, { headless: true });
  const page = await human.newPage();
  await page.goto('http://127.0.0.1:8098/login');
  await page.fill('input[name=user]', 'caio');
  await page.fill('input[name=pass]', 'segredo-que-fica-na-maquina');
  await page.click('button');
  await page.waitForURL('**/account');
  await human.close();

  await user(`/api/projects/${project.id}/local-tasks`, { sourceId: SWAPPA });
  const withSession = await runOnce(browser);
  await browser.close();

  const tasks = (await user(`/api/projects/${project.id}/local-tasks`)) as unknown as Array<
    Record<string, unknown>
  >;
  const listings = (await user(`/api/projects/${project.id}/listings`)) as unknown as Array<{
    sourceId: string;
  }>;
  const dump = execFileSync(
    'bash',
    [
      '-c',
      `PGPASSWORD=postgres pg_dump -h 127.0.0.1 -p 54322 -U postgres -d postgres --data-only -t public.listings -t public.local_agent_tasks -t public.local_agents -t public.listing_snapshots | grep -c -E "lab-session-7f3a|segredo-que-fica" || true`,
    ],
    { encoding: 'utf8' },
  ).trim();
  console.log(
    JSON.stringify(
      {
        withoutSession,
        withSession: {
          ...withSession,
          result: undefined,
          status: (withSession?.result as { status?: string })?.status,
          created: (withSession?.result as { itemsCreated?: number })?.itemsCreated,
        },
        tasks: tasks.map((task) => ({
          status: task.status,
          errorCode: task.errorCode,
          itemsCreated: task.itemsCreated,
        })),
        projectListingsFromSwappa: listings.filter((listing) => listing.sourceId === SWAPPA).length,
        credentialOccurrencesInDatabase: Number(dump),
      },
      null,
      2,
    ),
  );
};

void main();
