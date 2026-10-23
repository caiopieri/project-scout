// Requests a collection run for one source over HTTP, polls it to a terminal state and prints
// how many listings of each source the project feed now has.
// Usage: npx vite-node scripts/lab/prove-source-collection.ts <projectId> <sourceId>
import { ensureUser, readLocalSupabase } from './local-env';

const api = 'http://127.0.0.1:8787';
const names: Record<string, string> = {
  '00000000-0000-4000-a000-000000000001': 'eBay',
  '00000000-0000-4000-a000-000000000004': 'Swappa',
};

const main = async () => {
  const [projectId, sourceId] = process.argv.slice(2);
  const supabase = readLocalSupabase();
  const { accessToken } = await ensureUser(supabase, 'lab@scout.local', 'lab-password-123');
  const call = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${api}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    return (await response.json()) as Record<string, unknown>;
  };
  const run = await call(`/api/projects/${projectId}/collection-runs`, {
    method: 'POST',
    headers: { 'Idempotency-Key': `lab-${sourceId.slice(-4)}-${Date.now()}` },
    body: JSON.stringify({ sourceId }),
  });
  let current = run;
  for (
    let attempt = 0;
    attempt < 30 && !['completed', 'failed'].includes(String(current.status));
    attempt += 1
  ) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    current = await call(`/api/projects/${projectId}/collection-runs/${run.id}`);
  }
  const feed = (await call(`/api/projects/${projectId}/feed?group=unbacked&limit=100`)) as {
    items: Array<{
      sourceId: string;
      title: string;
      condition: string;
      referenceDiscount: { reasons?: string[] };
    }>;
    totals: unknown;
  };
  const ranked = (await call(`/api/projects/${projectId}/feed?group=rankable&limit=100`)) as {
    items: Array<{ sourceId: string }>;
  };
  const bySource: Record<string, number> = {};
  for (const item of [...feed.items, ...ranked.items])
    bySource[names[item.sourceId] ?? item.sourceId] =
      (bySource[names[item.sourceId] ?? item.sourceId] ?? 0) + 1;
  const swappa = feed.items.filter((item) => item.sourceId.endsWith('0004'));
  console.log(
    JSON.stringify(
      {
        run: {
          id: current.id,
          status: current.status,
          provider: current.provider,
          itemsFound: current.itemsFound,
          itemsCreated: current.itemsCreated,
          errorCode: current.errorCode,
        },
        feedBySource: bySource,
        swappaSample: swappa.slice(0, 2).map((item) => ({
          title: item.title,
          condition: item.condition,
          refusal: item.referenceDiscount.reasons,
        })),
      },
      null,
      2,
    ),
  );
};

void main();
