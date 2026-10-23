// Serves the real Worker code over HTTP from Node on :8787, as a lab stand-in for `wrangler dev`
// where local workerd cannot use the container's egress proxy (so LLM providers are reachable).
// Queues are in memory and drained by the Worker's own queue() consumer. Not for production.
// Usage: npx vite-node scripts/lab/node-worker-server.ts
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import worker from '../../apps/worker/src/index';

const fromDevVars = Object.fromEntries(
  readFileSync('apps/worker/.dev.vars', 'utf8')
    .split('\n')
    .map((line) => /^([A-Z0-9_]+)=(.*)$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => [match[1], match[2]]),
);

type Pending = { body: unknown; attempts: number };
const pending: Pending[] = [];
const queue = { send: async (body: unknown) => void pending.push({ body, attempts: 0 }) };

const env = {
  EBAY_CONNECTOR_MODE: 'mock',
  EBAY_BROWSE_BUDGET_PER_RUN: '20',
  VISUAL_ANALYSIS_BUDGET_PER_PROJECT: '5',
  TEXT_ANALYZER_MODE: 'llm',
  TEXT_ANALYZER_PROVIDERS: 'groq,gemini',
  LLM_MAX_REQUESTS_PER_PROVIDER: '5',
  GEMINI_MODEL: 'gemini-3.5-flash',
  ...fromDevVars,
  COLLECT_QUEUE: queue,
  ANALYSIS_QUEUE: queue,
  EBAY_DELETION_QUEUE: queue,
  RAW_BUCKET: {
    put: async () => ({}),
    head: async () => null,
    get: async () => null,
  },
} as never;

let draining = false;
const drain = async () => {
  if (draining) return;
  draining = true;
  try {
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
      if (retryDelay !== null && message.attempts < 3) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay! * 1000));
        pending.push({ body: message.body, attempts: message.attempts + 1 });
      }
    }
  } finally {
    draining = false;
  }
};

createServer(async (incoming, outgoing) => {
  const chunks: Buffer[] = [];
  for await (const chunk of incoming) chunks.push(chunk as Buffer);
  const headers = new Headers();
  for (const [key, value] of Object.entries(incoming.headers))
    if (typeof value === 'string') headers.set(key, value);
  const request = new Request(`http://127.0.0.1:8787${incoming.url}`, {
    method: incoming.method,
    headers,
    body: ['GET', 'HEAD'].includes(incoming.method ?? 'GET') ? undefined : Buffer.concat(chunks),
  });
  const response = await worker.fetch(request, env, {} as never);
  outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  outgoing.end(Buffer.from(await response.arrayBuffer()));
  console.log(`${incoming.method} ${incoming.url} ${response.status}`);
  void drain();
}).listen(8787, '127.0.0.1', () => console.log('node worker listening on http://127.0.0.1:8787'));
