// Pastes a URL into the on-demand extractor of a fresh project over HTTP and prints the outcome
// plus how the extracted listings look in the project feed.
// Usage: npx vite-node scripts/lab/prove-on-demand.ts <url> [termsConfirmed=true]
import { callWorker, ensureUser, readLocalSupabase, workerEnv } from './local-env';

const api = 'http://127.0.0.1:8787';

const main = async () => {
  const [url, confirmed = 'true'] = process.argv.slice(2);
  const supabase = readLocalSupabase();
  const { accessToken } = await ensureUser(supabase, 'lab@scout.local', 'lab-password-123');
  const call = async (path: string, body?: unknown) => {
    const response = await fetch(`${api}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  const interpreted = (
    await callWorker(workerEnv(supabase), accessToken, '/api/intent/interpret', {
      method: 'POST',
      body: JSON.stringify({ query: 'notebook usado até US$ 1500' }),
    })
  ).body as { criteria: unknown };
  const project = (
    await call('/api/projects', {
      name: `Lab sob demanda ${Date.now()}`,
      naturalLanguageQuery: 'notebook usado até US$ 1500',
      structuredQuery: interpreted.criteria,
      status: 'active',
    })
  ).body as { id: string };
  const started = Date.now();
  const extracted = await call(`/api/projects/${project.id}/extract`, {
    url,
    termsConfirmed: confirmed === 'true',
  });
  const feed = (await call(`/api/projects/${project.id}/feed?group=unbacked&limit=100`)).body as {
    totals: unknown;
    items: Array<{ title: string; price: number; url: string }>;
  };
  console.log(
    JSON.stringify(
      {
        projectId: project.id,
        ms: Date.now() - started,
        extract: extracted,
        feedTotals: feed.totals,
        feedSample: feed.items
          ?.slice(0, 3)
          .map(({ title, price, url: link }) => ({ title, price, link })),
      },
      null,
      2,
    ),
  );
};

void main();
