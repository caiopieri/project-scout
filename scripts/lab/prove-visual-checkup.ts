// Requests the visual checkup over HTTP (POST /visual-analysis), waits for the consumer and
// prints each finalist's findings, token usage and cost.
// Usage: npx vite-node scripts/lab/prove-visual-checkup.ts <projectId> [waitSeconds]
import { ensureUser, readLocalSupabase } from './local-env';

const api = 'http://127.0.0.1:8787';

const main = async () => {
  const [projectId, wait = '180'] = process.argv.slice(2);
  const supabase = readLocalSupabase();
  const { accessToken } = await ensureUser(supabase, 'lab@scout.local', 'lab-password-123');
  const call = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${api}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    });
    return (await response.json()) as Record<string, unknown>;
  };
  console.log(
    'schedule',
    JSON.stringify(await call(`/api/projects/${projectId}/visual-analysis`, { method: 'POST' })),
  );
  const feed = (await call(
    `/api/projects/${projectId}/feed?group=rankable&sort=score&limit=5`,
  )) as {
    items: Array<{ id: string; title: string; description: string }>;
  };
  const deadline = Date.now() + Number(wait) * 1000;
  let results: Array<Record<string, unknown>> = [];
  while (Date.now() < deadline) {
    results = await Promise.all(
      feed.items.map(({ id }) => call(`/api/projects/${projectId}/listings/${id}/visual-analysis`)),
    );
    if (
      results.every((result) =>
        ['completed', 'failed'].includes(((result.run as { status?: string }) ?? {}).status ?? ''),
      )
    )
      break;
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }
  console.log(
    JSON.stringify(
      feed.items.map((item, index) => {
        const run = results[index].run as Record<string, unknown> | null;
        return {
          title: item.title,
          description: item.description.slice(0, 60),
          status: run?.status,
          errorCode: run?.errorCode,
          tokens: run ? `${run.inputTokens}+${run.outputTokens}` : null,
          costMicroUsd: run?.costMicroUsd,
          findings: (results[index].findings as Array<Record<string, unknown>>).map(
            (finding) =>
              `img${finding.imageIndex}:${finding.kind}:${finding.component}${finding.mentionedInDescription ? '' : ' [NOT IN DESCRIPTION]'}`,
          ),
        };
      }),
      null,
      2,
    ),
  );
};

void main();
