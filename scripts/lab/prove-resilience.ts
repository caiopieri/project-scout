// Resilience drill over HTTP: the Swappa source (pointed at a 403 endpoint by the running worker's
// env) is collected twice, canaries run, and the circuit, incidents and audit are printed.
// Usage: npx vite-node scripts/lab/prove-resilience.ts <projectId> <phase: blocked|recover>
import { ensureUser, readLocalSupabase } from './local-env';

const api = 'http://127.0.0.1:8787';
const SWAPPA = '00000000-0000-4000-a000-000000000004';

const main = async () => {
  const [projectId, phase] = process.argv.slice(2);
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
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  const collect = async () => {
    const created = await call(`/api/projects/${projectId}/collection-runs`, {
      method: 'POST',
      headers: { 'Idempotency-Key': `drill-${Date.now()}` },
      body: JSON.stringify({ sourceId: SWAPPA }),
    });
    if (created.status >= 300) return { status: created.status, error: created.body.error };
    let run = created.body;
    for (
      let attempt = 0;
      attempt < 20 && !['completed', 'failed'].includes(String(run.status));
      attempt += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      run = (await call(`/api/projects/${projectId}/collection-runs/${created.body.id}`)).body;
    }
    return {
      status: run.status,
      attempts: run.attemptCount,
      errorCode: run.errorCode,
      itemsCreated: run.itemsCreated,
    };
  };
  const out: Record<string, unknown> = {};
  if (phase === 'recover')
    out.reset = (await call(`/api/ops/circuits/${SWAPPA}/reset`, { method: 'POST' })).body;
  out.firstCollection = await collect();
  out.secondCollection = await collect();
  out.canaries = (await call('/api/ops/canaries/run', { method: 'POST' })).body.results;
  const health = (await call('/api/ops/health')).body as Record<
    string,
    Array<Record<string, unknown>>
  >;
  out.swappaCircuit = health.circuits.find((circuit) => circuit.source_id === SWAPPA);
  out.incidents = health.incidents
    .slice(0, 4)
    .map(({ kind, status, source_id, evidence }) => ({
      kind,
      status,
      source: String(source_id).slice(-4),
      evidence,
    }));
  out.audit = health.audit.slice(0, 3).map(({ actor, action }) => `${actor}:${action}`);
  console.log(JSON.stringify(out, null, 2));
};

void main();
