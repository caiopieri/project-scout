'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AuthSession,
  CollectionRunTransport,
  CrossSourceIdentityCandidateTransport,
  InterpretIntentResult,
  ListingTransport,
  ListingTriageDecisionTransport,
  ListingTriageReviewTransport,
  MarketMetricsTransport,
  OpportunityValuationTransport,
  PriceHistoryTransport,
  ResearchProject,
  SearchTermObservationTransport,
} from '@scout/schemas';
import {
  authSessionSchema,
  collectionRunTransportSchema,
  crossSourceIdentityCandidateReviewRequestSchema,
  crossSourceIdentityCandidateTransportSchema,
  interpretIntentResultSchema,
  listingTransportSchema,
  listingTriageDecisionTransportSchema,
  listingTriageReviewTransportSchema,
  listingTriageReviewRequestSchema,
  marketMetricsTransportSchema,
  opportunityValuationTransportSchema,
  priceHistoryTransportSchema,
  researchCriteriaSchema,
  researchProjectTransportSchema,
  searchTermObservationTransportSchema,
} from '@scout/schemas';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const sessionKey = 'scout.auth.session';
const defaultValuationPolicy = {
  processingCost: '0',
  repairReserve: '0',
  desiredMargin: '0',
  transactionRate: '0',
};

const formatMinorMoney = (currency: string, amountMinor: number | null) =>
  amountMinor === null ? 'indeterminado' : `${currency} ${(amountMinor / 100).toFixed(2)}`;

function LandedCostSummary({ listing }: { listing: ListingTransport }) {
  const landedCost = listing.landedCost;
  if (!landedCost || landedCost.status === 'indeterminate') {
    return (
      <p className="muted">
        Custo indeterminado · falta: {landedCost?.missing.join(', ') || 'shipping'}
      </p>
    );
  }
  return (
    <div className="muted">
      <p>
        Preço: {formatMinorMoney(landedCost.currency, landedCost.components.itemPrice.amountMinor)}{' '}
        · {landedCost.components.itemPrice.origin}
      </p>
      <p>
        Frete: {formatMinorMoney(landedCost.currency, landedCost.components.shipping.amountMinor)} ·{' '}
        {landedCost.components.shipping.origin}
      </p>
      <p>Custo na porta: {formatMinorMoney(landedCost.currency, landedCost.totalMinor)}</p>
    </div>
  );
}

function MarketMetricsSummary({ metrics }: { metrics: MarketMetricsTransport | null }) {
  if (!metrics) return null;
  return (
    <section>
      <div className="results-head"><div className="eyebrow">Preço pedido · mediana limpa · {metrics.windowDays} dias</div></div>
      {metrics.segments.map((segment) => (
        <p className="muted" key={`${segment.product.brand}-${segment.product.model}-${segment.product.variant ?? ''}-${segment.condition}-${segment.currency}`}>
          {segment.product.brand} {segment.product.model}{segment.product.variant ? ` ${segment.product.variant}` : ''} · {segment.condition} · {segment.status === 'known' ? `Mediana: ${formatMinorMoney(segment.currency, segment.medianMinor)}` : 'Amostra insuficiente'} · n {segment.nRaw}/{metrics.minimumObservations} → {segment.nTrimmed} ({segment.nDiscarded} descartado(s))
        </p>
      ))}
    </section>
  );
}

async function readJson(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => ({ error: 'Resposta inválida do servidor.' }));
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body
        ? String(body.error)
        : `Erro HTTP ${response.status}`;
    throw new Error(message);
  }
  return body;
}

export default function HomePage() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [selected, setSelected] = useState<ResearchProject | null>(null);
  const [collectionRuns, setCollectionRuns] = useState<Record<string, CollectionRunTransport>>({});
  const [collectionReasonCounts, setCollectionReasonCounts] = useState<
    Record<string, Record<string, number>>
  >({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(sessionKey);
    if (stored) {
      const parsed = authSessionSchema.safeParse(JSON.parse(stored));
      if (parsed.success) setSession(parsed.data);
    }
  }, []);

  const request = useCallback(
    async (path: string, init: RequestInit = {}) => {
      if (!session) throw new Error('Faça login para continuar.');
      return readJson(
        await fetch(`${apiUrl}${path}`, {
          ...init,
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            ...init.headers,
          },
        }),
      );
    },
    [session],
  );

  const loadProjects = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const raw = await request('/api/projects');
      const parsed = researchProjectTransportSchema.array().parse(raw);
      setProjects(parsed);
      setSelected((current) =>
        current ? (parsed.find((project) => project.id === current.id) ?? null) : null,
      );
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Falha ao carregar projetos.',
      });
    } finally {
      setLoading(false);
    }
  }, [request, session]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  if (!session) return <AuthScreen onSession={setSession} />;

  const signOut = () => {
    localStorage.removeItem(sessionKey);
    setSession(null);
    setProjects([]);
  };

  return (
    <main className="shell">
      <header className="masthead">
        <div>
          <div className="eyebrow">eBay research desk / Marco 3</div>
          <div className="brand">Scout.</div>
        </div>
        <div className="actions">
          <span className="meta">{session.user.email}</span>
          <button className="button secondary" onClick={signOut}>
            Sair
          </button>
        </div>
      </header>
      <div className="grid">
        <aside className="rail">
          <ProjectEditor
            project={selected}
            request={request}
            busy={busy}
            setBusy={setBusy}
            notify={setMessage}
            onSaved={async () => {
              setSelected(null);
              await loadProjects();
            }}
            onCancel={() => setSelected(null)}
          />
        </aside>
        <section className="workspace">
          {message && (
            <div role="status" className={`notice ${message.kind === 'success' ? 'success' : ''}`}>
              {message.text}
            </div>
          )}
          <div className="panel">
            <div className="eyebrow">Arquivo de pesquisas</div>
            <h2>Seus projetos</h2>
            {loading ? (
              <p>Carregando projetos…</p>
            ) : (
              <ProjectList
                projects={projects}
                onSelect={setSelected}
                request={request}
                reload={loadProjects}
                notify={setMessage}
                collectionRuns={collectionRuns}
                onRunUpdate={(projectId, run) => {
                  setCollectionRuns((current) => ({ ...current, [projectId]: run }));
                  if (run.attemptCount === 0)
                    setCollectionReasonCounts((current) => ({ ...current, [projectId]: {} }));
                }}
                collectionReasonCounts={collectionReasonCounts}
                onReasonUpdate={(projectId, counts) =>
                  setCollectionReasonCounts((current) => ({ ...current, [projectId]: counts }))
                }
              />
            )}
          </div>
          {selected && <ProjectDetail project={selected} request={request} />}
        </section>
      </div>
    </main>
  );
}

function AuthScreen({ onSession }: { onSession: (session: AuthSession) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (!supabaseUrl || !supabaseAnonKey)
        throw new Error('Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.');
      const path = mode === 'login' ? '/auth/v1/token?grant_type=password' : '/auth/v1/signup';
      const raw = await readJson(
        await fetch(`${supabaseUrl}${path}`, {
          method: 'POST',
          headers: { apikey: supabaseAnonKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        }),
      );
      const parsed = authSessionSchema.safeParse(raw);
      if (!parsed.success)
        throw new Error('Conta criada, mas a sessão depende de confirmação por e-mail.');
      localStorage.setItem(sessionKey, JSON.stringify(parsed.data));
      onSession(parsed.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha de autenticação.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="shell">
      <div className="auth panel">
        <div className="eyebrow">Acesso interno</div>
        <h2>Entre no Scout.</h2>
        <p className="muted">
          A sessão vem do Supabase Auth local; o Worker encaminha seu JWT e o banco aplica RLS.
        </p>
        {error && (
          <div role="alert" className="notice">
            {error}
          </div>
        )}
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              minLength={6}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div className="actions">
            <button className="button" disabled={busy}>
              {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            >
              {mode === 'login' ? 'Criar conta local' : 'Já tenho conta'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

interface EditorProps {
  project: ResearchProject | null;
  request: (path: string, init?: RequestInit) => Promise<unknown>;
  busy: boolean;
  setBusy: (value: boolean) => void;
  notify: (message: { kind: 'error' | 'success'; text: string }) => void;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}

function ProjectEditor({
  project,
  request,
  busy,
  setBusy,
  notify,
  onSaved,
  onCancel,
}: EditorProps) {
  const [name, setName] = useState('iPhone 13 para reparo');
  const [description, setDescription] = useState(
    'Candidatos reparáveis com risco técnico controlado.',
  );
  const [query, setQuery] = useState(
    'Quero encontrar iPhone 13 de 128 GB com tela quebrada, mas que ligue. Aceito traseira quebrada e bateria degradada. Não quero iCloud, Activation Lock, defeito de placa ou que não ligue. Quero pagar no máximo R$ 1.800.',
  );
  const [status, setStatus] = useState<'draft' | 'active'>('draft');
  const [criteriaText, setCriteriaText] = useState('');
  const [interpretation, setInterpretation] = useState<InterpretIntentResult | null>(null);
  const [valuationEnabled, setValuationEnabled] = useState(false);
  const [valuationPolicy, setValuationPolicy] = useState(defaultValuationPolicy);

  useEffect(() => {
    if (!project) return;
    setName(project.name);
    setDescription(project.description ?? '');
    setQuery(project.naturalLanguageQuery);
    setStatus(project.status === 'draft' ? 'draft' : 'active');
    setCriteriaText(JSON.stringify(project.structuredQuery, null, 2));
    setInterpretation({ criteria: project.structuredQuery, ...project.interpretation });
    const policy = project.structuredQuery.opportunityPolicy;
    setValuationEnabled(Boolean(policy));
    setValuationPolicy(
      policy
        ? {
            processingCost: String(policy.processingCostMinor / 100),
            repairReserve: String(policy.repairReserveMinor / 100),
            desiredMargin: String(policy.desiredMarginMinor / 100),
            transactionRate: String(policy.transactionCostRate * 100),
          }
        : defaultValuationPolicy,
    );
  }, [project]);

  const interpret = async () => {
    setBusy(true);
    try {
      const result = interpretIntentResultSchema.parse(
        await request('/api/intent/interpret', { method: 'POST', body: JSON.stringify({ query }) }),
      );
      setInterpretation(result);
      setCriteriaText(JSON.stringify(result.criteria, null, 2));
      notify({
        kind: 'success',
        text: 'Consulta interpretada. Revise os critérios antes de salvar.',
      });
    } catch (error) {
      notify({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Falha ao interpretar.',
      });
    } finally {
      setBusy(false);
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (!interpretation) throw new Error('Interprete a consulta antes de salvar.');
      const parsedCriteria = researchCriteriaSchema.parse(JSON.parse(criteriaText));
      const criteria = researchCriteriaSchema.parse({
        ...parsedCriteria,
        opportunityPolicy: valuationEnabled
          ? {
              processingCostMinor: Math.round(Number(valuationPolicy.processingCost) * 100),
              repairReserveMinor: Math.round(Number(valuationPolicy.repairReserve) * 100),
              desiredMarginMinor: Math.round(Number(valuationPolicy.desiredMargin) * 100),
              transactionCostRate: Number(valuationPolicy.transactionRate) / 100,
            }
          : undefined,
      });
      const payload = {
        name,
        description: description || undefined,
        naturalLanguageQuery: query,
        structuredQuery: criteria,
      };
      if (project)
        await request(`/api/projects/${project.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      else
        await request('/api/projects', {
          method: 'POST',
          body: JSON.stringify({ ...payload, status }),
        });
      notify({ kind: 'success', text: project ? 'Projeto atualizado.' : 'Projeto criado.' });
      await onSaved();
    } catch (error) {
      notify({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Não foi possível salvar.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel" onSubmit={save}>
      <div className="eyebrow">{project ? 'Editar pesquisa' : 'Nova pesquisa'}</div>
      <h2>{project ? project.name : 'Defina o alvo.'}</h2>
      <div className="field">
        <label htmlFor="project-name">Nome</label>
        <input
          id="project-name"
          required
          minLength={2}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="description">Descrição opcional</label>
        <input
          id="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="query">Pedido em linguagem natural</label>
        <textarea
          id="query"
          required
          minLength={8}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {!project && (
        <div className="field">
          <label htmlFor="status">Status inicial</label>
          <select
            id="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as 'draft' | 'active')}
          >
            <option value="draft">Rascunho</option>
            <option value="active">Ativo</option>
          </select>
        </div>
      )}
      <div className="actions">
        <button type="button" className="button secondary" disabled={busy} onClick={interpret}>
          Interpretar consulta
        </button>
      </div>
      {interpretation && (
        <>
          <div className="notice">
            Confiança: {Math.round(interpretation.confidence * 100)}%.{' '}
            {interpretation.ambiguities.length} ambiguidade(s), {interpretation.warnings.length}{' '}
            aviso(s).
          </div>
          <div className="field">
            <label htmlFor="criteria">Critérios estruturados — JSON revisável</label>
            <textarea
              id="criteria"
              className="criteria"
              value={criteriaText}
              onChange={(event) => setCriteriaText(event.target.value)}
            />
          </div>
          <fieldset className="valuation-settings">
            <legend>Valuation de oportunidade</legend>
            <label className="check-row">
              <input
                type="checkbox"
                checked={valuationEnabled}
                onChange={(event) => setValuationEnabled(event.target.checked)}
              />
              Calcular preço de mercado e compra máxima após a coleta
            </label>
            {valuationEnabled && (
              <div className="policy-grid">
                <div className="field">
                  <label htmlFor="processing-cost">Processamento</label>
                  <input
                    id="processing-cost"
                    type="number"
                    min="0"
                    step="0.01"
                    value={valuationPolicy.processingCost}
                    onChange={(event) =>
                      setValuationPolicy({ ...valuationPolicy, processingCost: event.target.value })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="repair-reserve">Reserva de reparo</label>
                  <input
                    id="repair-reserve"
                    type="number"
                    min="0"
                    step="0.01"
                    value={valuationPolicy.repairReserve}
                    onChange={(event) =>
                      setValuationPolicy({ ...valuationPolicy, repairReserve: event.target.value })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="desired-margin">Margem desejada</label>
                  <input
                    id="desired-margin"
                    type="number"
                    min="0"
                    step="0.01"
                    value={valuationPolicy.desiredMargin}
                    onChange={(event) =>
                      setValuationPolicy({ ...valuationPolicy, desiredMargin: event.target.value })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="transaction-rate">Taxa transacional (%)</label>
                  <input
                    id="transaction-rate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={valuationPolicy.transactionRate}
                    onChange={(event) =>
                      setValuationPolicy({
                        ...valuationPolicy,
                        transactionRate: event.target.value,
                      })
                    }
                  />
                </div>
              </div>
            )}
          </fieldset>
        </>
      )}
      <div className="actions">
        <button className="button" disabled={busy || !interpretation}>
          {busy ? 'Processando…' : project ? 'Salvar alterações' : 'Salvar projeto'}
        </button>
        {project && (
          <button type="button" className="button secondary" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

const collectionRunLabel = (run: CollectionRunTransport) => {
  if (run.status === 'pending') return 'aguardando fila';
  if (run.status === 'running') return 'coletando';
  if (run.status === 'failed') return 'degradada';
  if (run.truncated) return 'parcial';
  if (run.status === 'completed') return 'ok';
  return 'indisponível';
};

function CollectionExecutionPanel({
  run,
  reasonCounts = {},
}: {
  run: CollectionRunTransport;
  reasonCounts?: Record<string, number>;
}) {
  const persisted = run.itemsCreated + run.itemsUpdated;
  const notPersisted = Math.max(0, run.itemsFound - persisted);
  const reasons = Object.entries(reasonCounts).sort((left, right) => right[1] - left[1]);
  return (
    <div className="execution-panel" aria-live="polite">
      <div className="eyebrow">Execução · {collectionRunLabel(run)}</div>
      <div className="execution-head">
        <strong>{run.provider}</strong>
        <span className="meta">
          {run.status === 'failed' ? `erro: ${run.errorCode ?? 'não classificado'}` : run.status}
        </span>
      </div>
      <div className="funnel" aria-label="Funil da coleta">
        <div>
          <strong>{run.itemsFound}</strong>
          <span>descobertos</span>
        </div>
        <div>
          <strong>{persisted}</strong>
          <span>persistidos</span>
        </div>
        <div>
          <strong>{run.itemsCreated}</strong>
          <span>novos</span>
        </div>
        <div>
          <strong>{run.itemsUpdated}</strong>
          <span>atualizados</span>
        </div>
      </div>
      {notPersisted > 0 && (
        <p className="muted execution-note">
          {notPersisted} descoberto(s) ainda não aparece(m) como persistido(s).
        </p>
      )}
      <div className="meta execution-cost">
        Custo registrado: {run.estimatedCost.toFixed(2)} · chamadas:{' '}
        {run.requestsUsed !== undefined && run.requestBudget !== undefined
          ? `${run.requestsUsed}/${run.requestBudget}`
          : 'não informadas'}
      </div>
      {reasons.length > 0 && (
        <div className="execution-reasons">
          <span className="meta">Motivos registrados na triagem</span>
          <ul>
            {reasons.map(([reason, count]) => (
              <li key={reason}>
                {count} · {reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      {run.status === 'failed' && run.error && <p className="execution-error">{run.error}</p>}
    </div>
  );
}

function ProjectList({
  projects,
  onSelect,
  request,
  reload,
  notify,
  onRunUpdate,
  collectionRuns,
  collectionReasonCounts,
  onReasonUpdate,
}: {
  projects: ResearchProject[];
  onSelect: (project: ResearchProject) => void;
  request: EditorProps['request'];
  reload: () => Promise<void>;
  notify: EditorProps['notify'];
  onRunUpdate: (projectId: string, run: CollectionRunTransport) => void;
  collectionRuns: Record<string, CollectionRunTransport>;
  collectionReasonCounts: Record<string, Record<string, number>>;
  onReasonUpdate: (projectId: string, counts: Record<string, number>) => void;
}) {
  const groups = useMemo(
    () =>
      [
        ['Ativos', projects.filter((project) => project.status === 'active')],
        ['Rascunhos', projects.filter((project) => project.status === 'draft')],
        ['Arquivados', projects.filter((project) => project.status === 'archived')],
      ] as const,
    [projects],
  );
  if (!projects.length)
    return (
      <p className="muted">
        Nenhum projeto ainda. A primeira pesquisa começa no formulário ao lado.
      </p>
    );
  const act = async (project: ResearchProject, action: 'archive' | 'restore' | 'delete') => {
    try {
      await request(`/api/projects/${project.id}${action === 'delete' ? '' : `/${action}`}`, {
        method: action === 'delete' ? 'DELETE' : 'POST',
      });
      notify({
        kind: 'success',
        text:
          action === 'archive'
            ? 'Projeto arquivado.'
            : action === 'restore'
              ? 'Projeto restaurado.'
              : 'Projeto excluído logicamente.',
      });
      await reload();
    } catch (error) {
      notify({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Ação não concluída.',
      });
    }
  };
  const loadRunReasons = async (projectId: string, startedAt?: Date) => {
    const raw = await request(`/api/projects/${projectId}/triage-decisions`);
    const decisions = listingTriageDecisionTransportSchema.array().parse(raw);
    const counts: Record<string, number> = {};
    for (const decision of decisions) {
      if (startedAt && new Date(decision.createdAt) < startedAt) continue;
      for (const reason of decision.filter.reasons) counts[reason] = (counts[reason] ?? 0) + 1;
    }
    onReasonUpdate(projectId, counts);
  };
  const collect = async (project: ResearchProject) => {
    let run: CollectionRunTransport;
    try {
      onSelect(project);
      const idempotencyKey = `collect-${project.id}-${Date.now()}`;
      const raw = await request(`/api/projects/${project.id}/collection-runs`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
      });
      run = collectionRunTransportSchema.parse(raw);
      onRunUpdate(project.id, run);
      notify({
        kind: 'success',
        text: `Coleta ${run.id.slice(0, 8)} iniciada. Status: ${run.status}.`,
      });
    } catch (error) {
      notify({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Não foi possível iniciar a coleta.',
      });
      return;
    }
    try {
      await pollRun(project.id, run.id);
    } catch (error) {
      notify({
        kind: 'error',
        text:
          error instanceof Error
            ? `Coleta iniciada, mas o acompanhamento falhou: ${error.message}`
            : 'Coleta iniciada, mas o acompanhamento falhou.',
      });
    }
  };
  const pollRun = async (projectId: string, runId: string) => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const raw = await request(`/api/projects/${projectId}/collection-runs/${runId}`);
      const run: CollectionRunTransport = collectionRunTransportSchema.parse(raw);
      onRunUpdate(projectId, run);
      if (run.status === 'completed') {
        await loadRunReasons(projectId, run.startedAt).catch(() => undefined);
        notify({
          kind: 'success',
          text: `Coleta concluída: ${run.itemsFound} encontrados, ${run.itemsCreated} novos.`,
        });
        return;
      }
      if (run.status === 'failed') {
        await loadRunReasons(projectId, run.startedAt).catch(() => undefined);
        notify({
          kind: 'error',
          text: `Coleta falhou: ${run.errorCode ?? 'erro não classificado'}.`,
        });
        return;
      }
    }
    notify({
      kind: 'success',
      text: 'A coleta continua em processamento. Reabra o projeto para consultar o status.',
    });
  };
  return (
    <div>
      {groups.map(
        ([label, items]) =>
          items.length > 0 && (
            <section key={label}>
              <div className="section-title">
                {label} · {items.length}
              </div>
              <div className="project-list">
                {items.map((project) => (
                  <article className="project" key={project.id}>
                    <div>
                      <h3>{project.name}</h3>
                      <p className="summary">{project.naturalLanguageQuery}</p>
                      <div className="meta">
                        <span className="status">{project.status}</span> · alterado{' '}
                        {project.updatedAt.toLocaleString('pt-BR')}
                      </div>
                    </div>
                    <div className="actions">
                      <button className="button secondary" onClick={() => onSelect(project)}>
                        Abrir
                      </button>
                      {project.status === 'active' && (
                        <button className="button" onClick={() => void collect(project)}>
                          Coletar agora
                        </button>
                      )}
                      {project.status === 'archived' ? (
                        <button
                          className="button secondary"
                          onClick={() => void act(project, 'restore')}
                        >
                          Restaurar
                        </button>
                      ) : (
                        <button
                          className="button secondary"
                          onClick={() => void act(project, 'archive')}
                        >
                          Arquivar
                        </button>
                      )}
                      <button className="button danger" onClick={() => void act(project, 'delete')}>
                        Excluir
                      </button>
                    </div>
                    {collectionRuns[project.id] && (
                      <CollectionExecutionPanel
                        run={collectionRuns[project.id]}
                        reasonCounts={collectionReasonCounts[project.id]}
                      />
                    )}
                  </article>
                ))}
              </div>
            </section>
          ),
      )}
    </div>
  );
}

function ProjectDetail({
  project,
  request,
}: {
  project: ResearchProject;
  request: (path: string, init?: RequestInit) => Promise<unknown>;
}) {
  const [listings, setListings] = useState<ListingTransport[]>([]);
  const [marketMetrics, setMarketMetrics] = useState<MarketMetricsTransport | null>(null);
  const [valuations, setValuations] = useState<Record<string, OpportunityValuationTransport>>({});
  const [loadingListings, setLoadingListings] = useState(true);
  const [listingError, setListingError] = useState<string | null>(null);
  const [observations, setObservations] = useState<SearchTermObservationTransport[]>([]);
  const [observationError, setObservationError] = useState<string | null>(null);
  const [reviewingObservationId, setReviewingObservationId] = useState<string | null>(null);
  const [triageDecisions, setTriageDecisions] = useState<ListingTriageDecisionTransport[]>([]);
  const [triageReviews, setTriageReviews] = useState<Record<string, ListingTriageReviewTransport>>(
    {},
  );
  const [triageError, setTriageError] = useState<string | null>(null);
  const [reviewingListingId, setReviewingListingId] = useState<string | null>(null);
  const [identityCandidates, setIdentityCandidates] = useState<
    CrossSourceIdentityCandidateTransport[]
  >([]);
  const [reviewingCandidateId, setReviewingCandidateId] = useState<string | null>(null);
  const [priceHistories, setPriceHistories] = useState<Record<string, PriceHistoryTransport[]>>({});
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [loadingHistoryId, setLoadingHistoryId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingListings(true);
    setListingError(null);
    void request(`/api/projects/${project.id}/listings`)
      .then((raw) => {
        if (!cancelled) setListings(listingTransportSchema.array().parse(raw));
      })
      .catch((error) => {
        if (!cancelled)
          setListingError(error instanceof Error ? error.message : 'Falha ao carregar anúncios.');
      })
      .finally(() => {
        if (!cancelled) setLoadingListings(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, request]);

  useEffect(() => {
    let cancelled = false;
    void request(`/api/projects/${project.id}/market-metrics`)
      .then((raw) => { if (!cancelled) setMarketMetrics(marketMetricsTransportSchema.parse(raw)); })
      .catch(() => { if (!cancelled) setMarketMetrics(null); });
    return () => { cancelled = true; };
  }, [project.id, request]);

  useEffect(() => {
    let cancelled = false;
    setTriageError(null);
    void Promise.all([
      request(`/api/projects/${project.id}/triage-decisions`),
      request(`/api/projects/${project.id}/triage-reviews`),
      request(`/api/projects/${project.id}/cross-source-candidates`),
    ])
      .then(([rawDecisions, rawReviews, rawCandidates]) => {
        if (cancelled) return;
        const decisions = listingTriageDecisionTransportSchema.array().parse(rawDecisions);
        const reviews = listingTriageReviewTransportSchema.array().parse(rawReviews);
        setTriageDecisions(decisions);
        setTriageReviews(Object.fromEntries(reviews.map((review) => [review.listingId, review])));
        setIdentityCandidates(
          crossSourceIdentityCandidateTransportSchema.array().parse(rawCandidates),
        );
      })
      .catch((error) => {
        if (!cancelled)
          setTriageError(error instanceof Error ? error.message : 'Falha ao carregar a triagem.');
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, request]);

  useEffect(() => {
    let cancelled = false;
    setObservationError(null);
    void request(`/api/projects/${project.id}/search-term-observations`)
      .then((raw) => {
        if (!cancelled) setObservations(searchTermObservationTransportSchema.array().parse(raw));
      })
      .catch((error) => {
        if (!cancelled)
          setObservationError(
            error instanceof Error ? error.message : 'Falha ao carregar termos para revisão.',
          );
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, request]);

  const reviewObservation = async (
    observationId: string,
    status: SearchTermObservationTransport['status'],
  ) => {
    if (status === 'candidate') return;
    setReviewingObservationId(observationId);
    setObservationError(null);
    try {
      const raw = await request(
        `/api/projects/${project.id}/search-term-observations/${observationId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        },
      );
      const updated = searchTermObservationTransportSchema.parse(raw);
      setObservations((current) =>
        current.map((observation) => (observation.id === updated.id ? updated : observation)),
      );
    } catch (error) {
      setObservationError(
        error instanceof Error ? error.message : 'Não foi possível salvar a revisão.',
      );
    } finally {
      setReviewingObservationId(null);
    }
  };

  const reviewListing = async (listingId: string, status: 'accepted' | 'rejected') => {
    setReviewingListingId(listingId);
    setTriageError(null);
    try {
      const raw = await request(`/api/projects/${project.id}/triage-reviews/${listingId}`, {
        method: 'PATCH',
        body: JSON.stringify(listingTriageReviewRequestSchema.parse({ status })),
      });
      const review = listingTriageReviewTransportSchema.parse(raw);
      setTriageReviews((current) => ({ ...current, [review.listingId]: review }));
    } catch (error) {
      setTriageError(error instanceof Error ? error.message : 'Não foi possível salvar a triagem.');
    } finally {
      setReviewingListingId(null);
    }
  };

  const reviewIdentityCandidate = async (candidateId: string, status: 'accepted' | 'rejected') => {
    setReviewingCandidateId(candidateId);
    setTriageError(null);
    try {
      const raw = await request(
        `/api/projects/${project.id}/cross-source-candidates/${candidateId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(crossSourceIdentityCandidateReviewRequestSchema.parse({ status })),
        },
      );
      const updated = crossSourceIdentityCandidateTransportSchema.parse(raw);
      setIdentityCandidates((current) =>
        current.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
      );
    } catch (error) {
      setTriageError(
        error instanceof Error ? error.message : 'Não foi possível salvar o candidato.',
      );
    } finally {
      setReviewingCandidateId(null);
    }
  };

  const showPriceHistory = async (listingId: string) => {
    if (expandedHistoryId === listingId) {
      setExpandedHistoryId(null);
      return;
    }
    setExpandedHistoryId(listingId);
    if (priceHistories[listingId]) return;
    setLoadingHistoryId(listingId);
    try {
      const raw = await request(`/api/projects/${project.id}/listings/${listingId}/price-history`);
      setPriceHistories((current) => ({
        ...current,
        [listingId]: priceHistoryTransportSchema.array().parse(raw),
      }));
    } catch (error) {
      setTriageError(
        error instanceof Error ? error.message : 'Não foi possível carregar o histórico.',
      );
      setExpandedHistoryId(null);
    } finally {
      setLoadingHistoryId(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      listings
        .filter((listing) => listing.landedCost?.status === 'known')
        .map(async (listing) => {
          try {
            const raw = await request(
              `/api/projects/${project.id}/listings/${listing.id}/valuation`,
            );
            return [listing.id, opportunityValuationTransportSchema.parse(raw)] as const;
          } catch {
            return null;
          }
        }),
    ).then((entries) => {
      const validEntries = entries.filter(
        (entry): entry is readonly [string, OpportunityValuationTransport] => entry !== null,
      );
      if (!cancelled) setValuations(Object.fromEntries(validEntries));
    });
    return () => {
      cancelled = true;
    };
  }, [listings, project.id, request]);

  return (
    <article className="panel detail">
      <div className="eyebrow">Detalhe persistido</div>
      <h2>{project.name}</h2>
      <p>{project.naturalLanguageQuery}</p>
      <p className="meta">
        Provider {project.interpretation.provider} · regra{' '}
        {project.interpretation.promptOrRuleVersion} · taxonomia{' '}
        {project.interpretation.taxonomyVersion} · confiança{' '}
        {Math.round(project.interpretation.confidence * 100)}%
      </p>
      {project.interpretation.ambiguities.map((item) => (
        <div className="notice" key={`${item.field}-${item.message}`}>
          {item.message}
        </div>
      ))}
      {project.interpretation.warnings.map((item) => (
        <div className="notice" key={`${item.field}-${item.message}`}>
          {item.message}
        </div>
      ))}
      <pre>{JSON.stringify(project.structuredQuery, null, 2)}</pre>
      <MarketMetricsSummary metrics={marketMetrics} />
      <div className="results-head">
        <div className="eyebrow">Identidade entre fontes</div>
        <strong>
          {identityCandidates.filter((candidate) => candidate.reviewStatus === 'pending').length}{' '}
          pendente(s)
        </strong>
      </div>
      {identityCandidates.length === 0 ? (
        <p className="muted">Nenhum candidato cross-source persistido ainda.</p>
      ) : (
        <div className="listing-list">
          {identityCandidates.map((candidate) => (
            <article className="listing-card" key={candidate.id}>
              <div>
                <strong>{candidate.relation}</strong>
                <p className="muted">
                  Confiança {Math.round(candidate.confidence * 100)}% · {candidate.reviewStatus}
                </p>
                <p className="muted">
                  {candidate.leftListingId.slice(0, 8)} ↔ {candidate.rightListingId.slice(0, 8)}
                </p>
                <p className="muted">{candidate.evidence.join(' · ')}</p>
              </div>
              <div className="actions">
                <button
                  type="button"
                  className="button"
                  disabled={reviewingCandidateId === candidate.id}
                  onClick={() => void reviewIdentityCandidate(candidate.id, 'accepted')}
                >
                  Aceitar candidato
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={reviewingCandidateId === candidate.id}
                  onClick={() => void reviewIdentityCandidate(candidate.id, 'rejected')}
                >
                  Rejeitar candidato
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="results-head">
        <div className="eyebrow">Revisão de termos</div>
        <strong>
          {observations.filter((observation) => observation.status === 'candidate').length}{' '}
          candidato(s)
        </strong>
      </div>
      {observationError && <div className="notice">{observationError}</div>}
      {observations.length === 0 && !observationError && (
        <p className="muted">Nenhum termo candidato persistido ainda.</p>
      )}
      <div className="listing-list">
        {observations.map((observation) => (
          <article className="listing-card" key={observation.id}>
            <div>
              <strong>{observation.term}</strong>
              <p className="muted">
                {observation.kind} · {observation.status} · {observation.source}
              </p>
            </div>
            <div className="actions">
              <button
                type="button"
                className="button"
                disabled={reviewingObservationId === observation.id}
                onClick={() => void reviewObservation(observation.id, 'accepted')}
              >
                Aceitar
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={reviewingObservationId === observation.id}
                onClick={() => void reviewObservation(observation.id, 'rejected')}
              >
                Rejeitar
              </button>
            </div>
          </article>
        ))}
      </div>
      <div className="results-head">
        <div className="eyebrow">Anúncios coletados</div>
        <strong>{loadingListings ? 'Carregando…' : `${listings.length} resultado(s)`}</strong>
      </div>
      {listingError && <div className="notice">{listingError}</div>}
      {triageError && <div className="notice">{triageError}</div>}
      {!loadingListings && !listingError && listings.length === 0 && (
        <p className="muted">Nenhum anúncio foi associado a este projeto ainda.</p>
      )}
      <div className="listing-list">
        {listings.map((listing) => (
          <article className="listing-card" key={listing.id}>
            <div>
              <div className="meta">eBay · {listing.condition}</div>
              <h3>{listing.title}</h3>
              <LandedCostSummary listing={listing} />
              {listing.location ? <p className="muted">{listing.location}</p> : null}
              {valuations[listing.id] && listing.landedCost?.status === 'known' && (
                <p className="valuation">
                  Mercado estimado: {listing.currency}{' '}
                  {(valuations[listing.id].estimatedMarketPriceMinor / 100).toFixed(2)} · Compra
                  máxima: {listing.currency}{' '}
                  {(valuations[listing.id].maxPurchasePriceMinor / 100).toFixed(2)} · Deal{' '}
                  {Math.round(valuations[listing.id].scores.dealScore)}
                </p>
              )}
              {triageDecisions.find((decision) => decision.listingId === listing.id) && (
                <>
                  <p className="muted">
                    Triagem:{' '}
                    {
                      triageDecisions.find((decision) => decision.listingId === listing.id)!
                        .investigation.state
                    }
                    {triageReviews[listing.id]
                      ? ` · revisão ${triageReviews[listing.id].status}`
                      : ''}
                  </p>
                  <p className="muted">
                    Identidade:{' '}
                    {[
                      triageDecisions.find((decision) => decision.listingId === listing.id)!
                        .identity.attributes.brand,
                      triageDecisions.find((decision) => decision.listingId === listing.id)!
                        .identity.attributes.model,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'não identificada'}{' '}
                    ·{' '}
                    {
                      triageDecisions.find((decision) => decision.listingId === listing.id)!
                        .identity.media.imageCount
                    }{' '}
                    imagem(ns)
                  </p>
                </>
              )}
              {expandedHistoryId === listing.id && priceHistories[listing.id] && (
                <div className="history">
                  <strong>Histórico de preço</strong>
                  {priceHistories[listing.id].length === 0 ? (
                    <p className="muted">Nenhuma observação registrada.</p>
                  ) : (
                    <ul>
                      {priceHistories[listing.id].map((observation) => (
                        <li key={observation.id}>
                          {listing.currency} {observation.price.toFixed(2)} · {observation.status} ·{' '}
                          {observation.collectedAt.toLocaleString('pt-BR')}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <div className="actions">
              <a className="button secondary" href={listing.url} target="_blank" rel="noreferrer">
                Ver anúncio
              </a>
              <button
                type="button"
                className="button secondary"
                disabled={loadingHistoryId === listing.id}
                onClick={() => void showPriceHistory(listing.id)}
              >
                {loadingHistoryId === listing.id
                  ? 'Carregando histórico…'
                  : expandedHistoryId === listing.id
                    ? 'Ocultar histórico'
                    : 'Ver histórico de preço'}
              </button>
              <button
                type="button"
                className="button"
                disabled={reviewingListingId === listing.id}
                onClick={() => void reviewListing(listing.id, 'accepted')}
              >
                Aprovar triagem
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={reviewingListingId === listing.id}
                onClick={() => void reviewListing(listing.id, 'rejected')}
              >
                Rejeitar triagem
              </button>
            </div>
          </article>
        ))}
      </div>
    </article>
  );
}
