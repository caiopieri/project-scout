// Runs the text-analysis path with the real Worker code in Node: POST /analysis enqueues into an
// in-memory queue, the Worker's own queue() consumer drains it against the configured LLM chain,
// and GET /listings/:id/analysis reads what was persisted. Used because local workerd cannot use
// this container's egress proxy; on Cloudflare the same code runs in the Workers runtime.
// Usage: npx vite-node scripts/lab/run-analysis-in-node.ts <projectId> [providers=groq,gemini]
import worker from '../../apps/worker/src/index';
import { callWorker, ensureUser, readLocalSupabase, workerEnv } from './local-env';

type Message = { body: unknown; attempts: number };

const main = async () => {
  const [projectId, providers = 'groq,gemini'] = process.argv.slice(2);
  const supabase = readLocalSupabase();
  const { accessToken } = await ensureUser(supabase, 'lab@scout.local', 'lab-password-123');
  const pending: Message[] = [];
  const env = workerEnv(supabase, {
    TEXT_ANALYZER_MODE: 'llm',
    TEXT_ANALYZER_PROVIDERS: providers,
    LLM_MAX_REQUESTS_PER_PROVIDER: '5',
    GROQ_API_KEY: process.env.GROQ_API_KEY ?? process.env.GROQ_API,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
    GEMINI_MODEL: 'gemini-3.5-flash',
    CEREBRAS_API_KEY: process.env.CEREBRAS_API_KEY ?? process.env.CEREBRAS1_API,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? process.env.OPENROUTER_API,
    ANALYSIS_QUEUE: { send: async (body: unknown) => void pending.push({ body, attempts: 0 }) },
  });
  const scheduled = await callWorker(env, accessToken, `/api/projects/${projectId}/analysis`, {
    method: 'POST',
  });
  console.log('schedule', scheduled.status, JSON.stringify(scheduled.body));
  const started = Date.now();
  let batches = 0;
  while (pending.length) {
    const message = pending.shift()!;
    let retryDelay: number | null = null;
    await worker.queue(
      {
        messages: [
          {
            body: message.body,
            ack: () => undefined,
            retry: (options?: { delaySeconds?: number }) => {
              retryDelay = options?.delaySeconds ?? 1;
            },
          },
        ],
      } as never,
      env,
    );
    batches += 1;
    if (retryDelay !== null && message.attempts < 3) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay! * 1000));
      pending.push({ body: message.body, attempts: message.attempts + 1 });
    }
  }
  const listings = (await callWorker(env, accessToken, `/api/projects/${projectId}/listings`))
    .body as Array<{ id: string; description: string }>;
  const analyses = await Promise.all(
    listings.map(
      async ({ id }) =>
        (await callWorker(env, accessToken, `/api/projects/${projectId}/listings/${id}/analysis`))
          .body as {
          run: { status: string; errorCode: string | null } | null;
          defects: Array<{ defectType: string; status: string }>;
          evidences: Array<{ model: string | null }>;
        },
    ),
  );
  const byStatus: Record<string, number> = {};
  const byModel: Record<string, number> = {};
  for (const analysis of analyses) {
    const key = `${analysis.run?.status ?? 'none'}${analysis.run?.errorCode ? `:${analysis.run.errorCode}` : ''}`;
    byStatus[key] = (byStatus[key] ?? 0) + 1;
    for (const evidence of analysis.evidences)
      byModel[evidence.model ?? 'unknown'] = (byModel[evidence.model ?? 'unknown'] ?? 0) + 1;
  }
  const hostile = listings.findIndex(({ description }) => description.startsWith('IGNORE ALL'));
  console.log(
    JSON.stringify(
      {
        total: listings.length,
        queueMessagesProcessed: batches,
        seconds: Math.round((Date.now() - started) / 1000),
        byStatus,
        evidencesByModel: byModel,
        hostileListing: {
          description: listings[hostile]?.description,
          defects: analyses[hostile]?.defects.map(
            (defect) => `${defect.defectType}:${defect.status}`,
          ),
        },
      },
      null,
      2,
    ),
  );
};

void main();
