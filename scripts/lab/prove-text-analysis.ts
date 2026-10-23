// Drives the text-analysis path over HTTP against `wrangler dev` (real local queue + consumer):
// POST /analysis, wait for the consumer, then GET each listing's persisted analysis.
// Usage: npx vite-node scripts/lab/prove-text-analysis.ts <projectId> [waitSeconds]
import { ensureUser, readLocalSupabase } from './local-env';

const api = 'http://127.0.0.1:8787';

const main = async () => {
  const [projectId, wait = '60'] = process.argv.slice(2);
  const supabase = readLocalSupabase();
  const { accessToken } = await ensureUser(supabase, 'lab@scout.local', 'lab-password-123');
  const call = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${api}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  const scheduled = await call(`/api/projects/${projectId}/analysis`, { method: 'POST' });
  console.log('schedule', scheduled.status, JSON.stringify(scheduled.body));
  const listings = (await call(`/api/projects/${projectId}/listings`)).body as unknown as Array<{
    id: string;
    description: string;
  }>;
  const deadline = Date.now() + Number(wait) * 1000;
  let analyses: Array<{
    run: { status: string; errorCode: string | null } | null;
    defects: unknown[];
  }> = [];
  while (Date.now() < deadline) {
    analyses = (await Promise.all(
      listings.map(
        async ({ id }) => (await call(`/api/projects/${projectId}/listings/${id}/analysis`)).body,
      ),
    )) as unknown as typeof analyses;
    if (analyses.every((analysis) => ['completed', 'failed'].includes(analysis.run?.status ?? '')))
      break;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  const byStatus: Record<string, number> = {};
  for (const analysis of analyses) {
    const key = `${analysis.run?.status ?? 'none'}${analysis.run?.errorCode ? `:${analysis.run.errorCode}` : ''}`;
    byStatus[key] = (byStatus[key] ?? 0) + 1;
  }
  const hostileIndex = listings.findIndex(({ description }) =>
    description.startsWith('IGNORE ALL'),
  );
  console.log(
    JSON.stringify({ total: listings.length, byStatus, hostile: analyses[hostileIndex] }, null, 2),
  );
};

void main();
