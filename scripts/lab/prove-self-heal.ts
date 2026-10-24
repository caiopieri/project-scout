// Self-heal drill over HTTP against the running Node worker, with Swappa pointed at the loopback
// site's /swappa path (SWAPPA_BASE_URL=http://127.0.0.1:8098/swappa). Each phase starts from the
// default selector map and a good baseline canary, then switches the site's markup:
//   level2   renamed markup → diagnosis + sandbox + trial canary → human approval → collection
//   level3   renamed markup, worker started with SELF_HEAL_AUTONOMY=on → applied without a human
//   rollback renamed, then empty after the trial (autonomy on) → applied, real canary fails, rolled back
//   semantic prices switched to cents → sandbox refuses the repair as a change of meaning
// Usage: npx vite-node scripts/lab/prove-self-heal.ts <projectId> <phase>
import { ensureUser, readLocalSupabase } from './local-env';

const api = 'http://127.0.0.1:8787';
const site = 'http://127.0.0.1:8098';
const SWAPPA = '00000000-0000-4000-a000-000000000004';
const DEFAULT_SELECTORS = {
  containerClass: ['xui_card_slots'],
  cardClass: ['xui_card_wrapper'],
  codeAttribute: ['data-code'],
  priceAttribute: ['data-price'],
};

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
  const service = (path: string, body: unknown) =>
    fetch(`${supabase.apiUrl}/rest/v1/${path}`, {
      method: 'POST',
      headers: {
        apikey: supabase.serviceRoleKey,
        Authorization: `Bearer ${supabase.serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  const mode = (name: string) => fetch(`${site}/__mode/${name}`, { method: 'POST' });
  const swappaCanary = async () => {
    const results = (await call('/api/ops/canaries/run', { method: 'POST' })).body
      .results as Array<Record<string, unknown>>;
    return results.find((result) => result.sourceId === SWAPPA);
  };
  const latestProposal = async () =>
    ((await call('/api/ops/heal-proposals')).body.proposals as Array<Record<string, unknown>>)[0];
  const out: Record<string, unknown> = { phase };

  // Same starting point for every phase: default map, closed circuit, good baseline page.
  await service('rpc/activate_selector_version', {
    p_source_id: SWAPPA,
    p_selectors: DEFAULT_SELECTORS,
    p_proposal_id: null,
    p_actor: `drill-reset:${phase}`,
  });
  await call(`/api/ops/circuits/${SWAPPA}/reset`, { method: 'POST' });
  await mode('good');
  out.baselineCanary = await swappaCanary();

  await mode(
    phase === 'rollback' ? 'renamed-then-empty' : phase === 'semantic' ? 'renamed-cents' : 'renamed',
  );
  out.failingCanary = await swappaCanary();
  const proposal = await latestProposal();
  out.proposal = {
    status: proposal.status,
    failureClass: proposal.failure_class,
    proposer: proposal.proposer,
    report: proposal.report,
    patch: proposal.patch,
    sandbox: proposal.sandbox,
    trialCanary: proposal.canary,
    autonomous: proposal.autonomous,
  };

  if (phase === 'level2' && proposal.status === 'canary_passed') {
    const approved = await call(`/api/ops/heal-proposals/${String(proposal.id)}/approve`, {
      method: 'POST',
    });
    out.approval = { status: approved.status, proposal: approved.body.status };
    const created = await call(`/api/projects/${projectId}/collection-runs`, {
      method: 'POST',
      headers: { 'Idempotency-Key': `self-heal-${Date.now()}` },
      body: JSON.stringify({ sourceId: SWAPPA }),
    });
    let run = created.body;
    for (let attempt = 0; attempt < 20 && !['completed', 'failed'].includes(String(run.status)); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      run = (await call(`/api/projects/${projectId}/collection-runs/${String(created.body.id)}`)).body;
    }
    out.collectionAfterRepair = {
      status: run.status,
      itemsFound: run.itemsFound,
      errorCode: run.errorCode,
    };
  }

  const ops = (await call('/api/ops/heal-proposals')).body;
  out.selectorVersions = (ops.selectorVersions as Array<Record<string, unknown>>)
    .filter((version) => version.source_id === SWAPPA)
    .slice(0, 3)
    .map(({ version, status, activated_by }) => ({ version, status, activated_by }));
  const health = (await call('/api/ops/health')).body as Record<string, Array<Record<string, unknown>>>;
  out.openSwappaIncidents = health.incidents
    .filter((incident) => incident.source_id === SWAPPA && incident.status === 'open')
    .map((incident) => incident.kind);
  out.audit = health.audit
    .slice(0, 8)
    .map(({ actor, action }) => `${String(actor)}:${String(action)}`);
  console.log(JSON.stringify(out, null, 2));
};

void main();
