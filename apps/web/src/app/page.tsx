'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AgentChatResponse,
  AuthSession,
  CollectionRunTransport,
  CrossSourceIdentityCandidateTransport,
  InterpretIntentResult,
  ListingFeedGroup,
  ListingFeedPage,
  ListingFeedSort,
  ListingTextAnalysisTransport,
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
  agentChatResponseSchema,
  authSessionSchema,
  collectionRunTransportSchema,
  crossSourceIdentityCandidateReviewRequestSchema,
  crossSourceIdentityCandidateTransportSchema,
  interpretIntentResultSchema,
  listingFeedPageSchema,
  listingFeedSortSchema,
  listingTextAnalysisTransportSchema,
  listingUserActionSchema,
  textAnalysisScheduleResultSchema,
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

const refusalLabels: Record<string, string> = {
  CUSTO_INDETERMINADO: 'custo indeterminado',
  SEGMENTO_DESCONHECIDO: 'marca, modelo ou condição desconhecidos',
  AMOSTRA_INSUFICIENTE: 'amostra insuficiente no segmento',
};

function ReferenceDiscountSummary({ listing }: { listing: ListingTransport }) {
  const discount = listing.referenceDiscount;
  if (!discount) return null;
  if (discount.status === 'NAO_RANQUEAVEL') {
    return (
      <p className="muted">
        Não ranqueável ·{' '}
        {discount.reasons.map((reason) => refusalLabels[reason] ?? reason).join(' + ')}
        {discount.sample
          ? ` · n ${discount.sample.nRaw}/${discount.policy.minimumObservations}`
          : ''}
      </p>
    );
  }
  const percent = (discount.discountBasisPoints / 100).toFixed(1);
  return (
    <div className="muted">
      <p>
        Distância da referência:{' '}
        {formatMinorMoney(discount.segment.currency, discount.discountMinor)} ({percent}%) · custo{' '}
        {formatMinorMoney(discount.segment.currency, discount.landedCostMinor)} vs mediana{' '}
        {formatMinorMoney(discount.segment.currency, discount.referenceMedianMinor)}
      </p>
      <p>
        n {discount.sample.nRaw} → {discount.sample.nTrimmed} em {discount.sample.windowDays} dias
        {discount.sample.selfObservationsExcluded
          ? ` · ${discount.sample.selfObservationsExcluded} observação(ões) do próprio anúncio fora da referência`
          : ''}{' '}
        · {discount.policy.version}
      </p>
      <p>
        Não é margem nem oportunidade: é distância do preço pedido mediano. Desconto grande costuma
        indicar defeito que a mediana não captura.
      </p>
    </div>
  );
}

const factorSymbols: Record<string, string> = {
  positive: '+',
  negative: '−',
  absent: '?',
  contradictory: '≠',
};

function ScoreSummary({ listing }: { listing: ListingTransport }) {
  const score = listing.score;
  if (!score) return null;
  return (
    <details className="muted">
      <summary>
        {score.status === 'known' ? `Score ${score.value}` : 'Score incompleto'} ·{' '}
        {score.policyVersion} · abrir a conta
      </summary>
      <p>50 pontos de base. Não é margem nem recomendação de compra.</p>
      <ul>
        {score.factors.map((factor, index) => (
          <li key={`${factor.code}-${index}`}>
            {factorSymbols[factor.kind]} {factor.label}
            {factor.points !== null
              ? ` (${factor.points > 0 ? '+' : ''}${factor.points})`
              : ' (sem pontos: desconhecido)'}
          </li>
        ))}
      </ul>
    </details>
  );
}

function MarketMetricsSummary({ metrics }: { metrics: MarketMetricsTransport | null }) {
  if (!metrics) return null;
  return (
    <section>
      <div className="results-head">
        <div className="eyebrow">Preço pedido · mediana limpa · {metrics.windowDays} dias</div>
      </div>
      {metrics.segments.map((segment) => (
        <p
          className="muted"
          key={`${segment.product.brand}-${segment.product.model}-${segment.product.variant ?? ''}-${segment.condition}-${segment.currency}`}
        >
          {segment.product.brand} {segment.product.model}
          {segment.product.variant ? ` ${segment.product.variant}` : ''} · {segment.condition} ·{' '}
          {segment.status === 'known'
            ? `Mediana: ${formatMinorMoney(segment.currency, segment.medianMinor)}`
            : 'Amostra insuficiente'}{' '}
          · n {segment.nRaw}/{metrics.minimumObservations} → {segment.nTrimmed} (
          {segment.nDiscarded} descartado(s))
        </p>
      ))}
    </section>
  );
}

const feedSortLabels: Record<ListingFeedSort, string> = {
  score: 'Score explicável',
  discount: 'Distância da referência',
  totalCost: 'Custo total',
  price: 'Preço',
  newest: 'Mais recentes',
};

const refusalGroupLabel =
  'Sem lastro: custo, segmento ou amostra desconhecidos. Não é pior — é desconhecido, por isso não é ordenado por desconto.';

interface FeedGroupState {
  items: ListingTransport[];
  nextOffset: number | null;
}

interface FeedLens {
  favorite: boolean;
  label: '' | 'none' | 'discarded' | 'shortlisted' | 'monitored';
  hideDiscarded: boolean;
  condition: string;
  minScore: string;
  q: string;
  maxTotalCostMinor: string;
}

const emptyLens: FeedLens = {
  favorite: false,
  label: '',
  hideDiscarded: true,
  condition: '',
  minScore: '',
  q: '',
  maxTotalCostMinor: '',
};

const labelNames: Record<string, string> = {
  discarded: 'descartado',
  shortlisted: 'shortlist',
  monitored: 'monitorar',
};

const sellerQuestions: Record<string, string> = {
  ICLOUD_NAO_MENCIONADO:
    'O aparelho está sem iCloud / bloqueio de ativação? Pode enviar foto da tela de ajustes?',
  BATERIA_NAO_MENCIONADA: 'Qual a saúde da bateria (Ajustes › Bateria) e ela segura carga?',
  ANALISE_DE_TEXTO_AUSENTE:
    'Pode descrever o estado de funcionamento e qualquer defeito conhecido?',
};

function Dossier({
  projectId,
  listing,
  request,
  onClose,
}: {
  projectId: string;
  listing: ListingTransport;
  request: (path: string, init?: RequestInit) => Promise<unknown>;
  onClose: () => void;
}) {
  const [analysis, setAnalysis] = useState<ListingTextAnalysisTransport | undefined>(undefined);
  const [history, setHistory] = useState<PriceHistoryTransport[] | null>(null);
  useEffect(() => {
    void request(`/api/projects/${projectId}/listings/${listing.id}/analysis`)
      .then((raw) => setAnalysis(listingTextAnalysisTransportSchema.parse(raw)))
      .catch(() => setAnalysis(undefined));
    void request(`/api/projects/${projectId}/listings/${listing.id}/price-history`)
      .then((raw) => setHistory(priceHistoryTransportSchema.array().parse(raw)))
      .catch(() => setHistory([]));
  }, [projectId, listing.id, request]);
  const unknownFactors = (listing.score?.factors ?? []).filter(
    (factor) => factor.kind === 'absent',
  );
  const questions = [
    ...unknownFactors.map((factor) => sellerQuestions[factor.code]).filter(Boolean),
    ...(analysis?.evidences ?? [])
      .filter((evidence) => evidence.status === 'unknown')
      .map((evidence) => `Pode confirmar: ${evidence.claim}?`),
  ];
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Dossiê">
        <div className="actions">
          <div className="eyebrow">Dossiê</div>
          <button type="button" className="button secondary" onClick={onClose}>
            Fechar (Esc)
          </button>
        </div>
        <h3>{listing.title}</h3>
        <p className="meta">
          {listing.condition} · {listing.currency} ·{' '}
          <a href={listing.url} target="_blank" rel="noreferrer">
            anúncio na fonte
          </a>
        </p>
        <div className="section-title">Custo total, linha a linha</div>
        <LandedCostSummary listing={listing} />
        <div className="section-title">Distância da referência</div>
        <ReferenceDiscountSummary listing={listing} />
        <div className="section-title">Score</div>
        <ScoreSummary listing={listing} />
        <div className="section-title">Evidências graduadas (texto)</div>
        <TextAnalysisSummary analysis={analysis} />
        <div className="section-title">Perguntas ao vendedor</div>
        {questions.length ? (
          <ul>
            {questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">Nada desconhecido de alto impacto para perguntar.</p>
        )}
        <div className="section-title">Histórico de preço do anúncio</div>
        {history === null ? (
          <p className="muted">Carregando…</p>
        ) : history.length === 0 ? (
          <p className="muted">Nenhuma observação registrada.</p>
        ) : (
          <ul>
            {history.map((observation) => (
              <li key={observation.id}>
                {listing.currency} {observation.price.toFixed(2)} ·{' '}
                {observation.collectedAt.toLocaleString('pt-BR')}
              </li>
            ))}
          </ul>
        )}
        <div className="section-title">Outros níveis da cadeia</div>
        <p className="muted">Ainda não existe: fornecedores e cadeia chegam na S12.</p>
      </aside>
    </>
  );
}

function ListingFeed({
  projectId,
  request,
  download,
  agentFilter,
  openRequest,
  renderListingCard,
}: {
  projectId: string;
  request: (path: string, init?: RequestInit) => Promise<unknown>;
  download: (path: string) => Promise<void>;
  agentFilter: { filter: Record<string, unknown>; nonce: number } | null;
  openRequest: { id: string; nonce: number } | null;
  renderListingCard: (listing: ListingTransport) => JSX.Element;
}) {
  const [sort, setSort] = useState<ListingFeedSort>('discount');
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [groups, setGroups] = useState<Record<ListingFeedGroup, FeedGroupState>>({
    rankable: { items: [], nextOffset: null },
    unbacked: { items: [], nextOffset: null },
  });
  const [totals, setTotals] = useState({ rankable: 0, unbacked: 0 });
  const [newSinceSnapshot, setNewSinceSnapshot] = useState(0);
  const [sources, setSources] = useState<ListingFeedPage['sources']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [lens, setLens] = useState<FeedLens>(emptyLens);
  const [filteredOut, setFilteredOut] = useState(0);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [dossier, setDossier] = useState<ListingTransport | null>(null);

  useEffect(() => {
    if (!agentFilter) return;
    const filter = agentFilter.filter;
    setLens({
      favorite: filter.favorite === 'true',
      label: (typeof filter.label === 'string' ? filter.label : '') as FeedLens['label'],
      hideDiscarded: filter.hideDiscarded !== 'false',
      condition: typeof filter.condition === 'string' ? filter.condition : '',
      minScore: filter.minScore !== undefined ? String(filter.minScore) : '',
      q: typeof filter.q === 'string' ? filter.q : '',
      maxTotalCostMinor:
        filter.maxTotalCostMinor !== undefined ? String(filter.maxTotalCostMinor) : '',
    });
    if (typeof filter.sort === 'string' && listingFeedSortSchema.safeParse(filter.sort).success)
      setSort(filter.sort as ListingFeedSort);
  }, [agentFilter]);

  useEffect(() => {
    if (!openRequest) return;
    void request(`/api/projects/${projectId}/listings`)
      .then((raw) => {
        const listing = listingTransportSchema
          .array()
          .parse(raw)
          .find(({ id }) => id === openRequest.id);
        if (listing) setDossier(listing);
        else setError('Anúncio citado não pertence a esta pesquisa.');
      })
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : 'Falha ao abrir o anúncio.'),
      );
  }, [openRequest, projectId, request]);

  const lensParams = useCallback(
    (at: string | null) => {
      const params = new URLSearchParams({
        sort,
        hideDiscarded: lens.hideDiscarded ? 'true' : 'false',
      });
      if (at) params.set('snapshot', at);
      if (lens.favorite) params.set('favorite', 'true');
      if (lens.label) params.set('label', lens.label);
      if (lens.condition.trim()) params.set('condition', lens.condition.trim());
      if (lens.minScore.trim()) params.set('minScore', lens.minScore.trim());
      if (lens.q.trim()) params.set('q', lens.q.trim());
      if (lens.maxTotalCostMinor.trim())
        params.set('maxTotalCostMinor', lens.maxTotalCostMinor.trim());
      return params;
    },
    [sort, lens],
  );

  const exportSelection = async (format: 'csv' | 'xlsx') => {
    const params = lensParams(snapshot);
    params.set('format', format);
    try {
      await download(`/api/projects/${projectId}/export?${params}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao exportar.');
    }
  };

  const fetchPage = useCallback(
    async (group: ListingFeedGroup, offset: number, at: string | null, limit = 25) => {
      const params = lensParams(at);
      params.set('group', group);
      params.set('offset', String(offset));
      params.set('limit', String(limit));
      return listingFeedPageSchema.parse(
        await request(`/api/projects/${projectId}/feed?${params}`),
      );
    },
    [projectId, request, lensParams],
  );

  const items = useMemo(() => [...groups.rankable.items, ...groups.unbacked.items], [groups]);

  const applyAction = useCallback(
    async (listing: ListingTransport, update: Record<string, unknown>) => {
      try {
        const action = listingUserActionSchema.parse(
          await request(`/api/listings/${listing.id}/actions`, {
            method: 'PUT',
            body: JSON.stringify(update),
          }),
        );
        const patch = (state: FeedGroupState): FeedGroupState => ({
          ...state,
          items: state.items.map((item) =>
            item.id === listing.id ? { ...item, userAction: action } : item,
          ),
        });
        setGroups((current) => ({
          rankable: patch(current.rankable),
          unbacked: patch(current.unbacked),
        }));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Falha ao salvar a ação.');
      }
    },
    [request],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if (dossier) {
        if (event.key === 'Escape') setDossier(null);
        return;
      }
      const current = items[focusedIndex];
      const key = event.key.toLowerCase();
      if (key === 'j') setFocusedIndex((index) => Math.min(items.length - 1, index + 1));
      else if (key === 'k') setFocusedIndex((index) => Math.max(0, index - 1));
      else if (!current) return;
      else if (key === 'x')
        void applyAction(current, {
          label: current.userAction?.label === 'discarded' ? null : 'discarded',
        });
      else if (key === 's')
        void applyAction(current, {
          label: current.userAction?.label === 'shortlisted' ? null : 'shortlisted',
        });
      else if (key === 'm')
        void applyAction(current, {
          label: current.userAction?.label === 'monitored' ? null : 'monitored',
        });
      else if (key === 'h') void applyAction(current, { favorite: !current.userAction?.favorite });
      else if (event.key === 'Enter') setDossier(current);
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, focusedIndex, dossier, applyAction]);

  useEffect(() => {
    document.querySelector('.feed-item.focused')?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex]);

  const renderFeedItem = (listing: ListingTransport) => {
    const index = items.findIndex((item) => item.id === listing.id);
    return (
      <div
        key={listing.id}
        className={`feed-item${index === focusedIndex ? ' focused' : ''}`}
        onClick={() => setFocusedIndex(index)}
      >
        <div className="actions">
          {listing.userAction?.favorite && <span className="badge">♥ coração</span>}
          {listing.userAction?.label && (
            <span className="badge">{labelNames[listing.userAction.label]}</span>
          )}
          <button
            type="button"
            className="button secondary"
            onClick={() => void applyAction(listing, { favorite: !listing.userAction?.favorite })}
          >
            {listing.userAction?.favorite ? 'Tirar coração' : '♥ Coração'}
          </button>
          <button type="button" className="button secondary" onClick={() => setDossier(listing)}>
            Abrir dossiê
          </button>
        </div>
        {renderListingCard(listing)}
      </div>
    );
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const rankable = await fetchPage('rankable', 0, null);
        const at = rankable.snapshot.toISOString();
        const unbacked = await fetchPage('unbacked', 0, at);
        if (cancelled) return;
        setSnapshot(at);
        setGroups({
          rankable: { items: rankable.items, nextOffset: rankable.nextOffset },
          unbacked: { items: unbacked.items, nextOffset: unbacked.nextOffset },
        });
        setTotals(rankable.totals);
        setNewSinceSnapshot(0);
        setSources(rankable.sources);
        setFilteredOut(rankable.filteredOut);
        setFocusedIndex(0);
      } catch (caught) {
        if (!cancelled)
          setError(caught instanceof Error ? caught.message : 'Falha ao carregar a lista.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchPage, reloadKey]);

  useEffect(() => {
    if (!snapshot) return;
    const timer = setInterval(() => {
      void fetchPage('rankable', 0, snapshot, 1)
        .then((page) => {
          setNewSinceSnapshot(page.newSinceSnapshot);
          setSources(page.sources);
        })
        .catch(() => undefined);
    }, 20_000);
    return () => clearInterval(timer);
  }, [fetchPage, snapshot]);

  const loadMore = async (group: ListingFeedGroup) => {
    const current = groups[group];
    if (current.nextOffset === null || !snapshot) return;
    try {
      const page = await fetchPage(group, current.nextOffset, snapshot);
      setGroups((previous) => ({
        ...previous,
        [group]: { items: [...previous[group].items, ...page.items], nextOffset: page.nextOffset },
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao carregar mais itens.');
    }
  };

  const collecting = sources.some((source) => source.state === 'collecting');
  const failed = sources.filter((source) => source.state === 'failed');
  const truncated = sources.filter((source) => source.state === 'truncated');
  const empty = !loading && !error && totals.rankable + totals.unbacked === 0 && filteredOut === 0;
  const emptyByLens =
    !loading && !error && totals.rankable + totals.unbacked === 0 && filteredOut > 0;

  return (
    <section>
      <div className="results-head">
        <div className="eyebrow">Anúncios coletados</div>
        <strong>
          {loading
            ? 'Carregando primeira página…'
            : `${totals.rankable} ranqueável(is) · ${totals.unbacked} sem lastro`}
        </strong>
      </div>
      <label className="muted">
        Ordenar ranqueáveis por{' '}
        <select value={sort} onChange={(event) => setSort(event.target.value as ListingFeedSort)}>
          {listingFeedSortSchema.options.map((option) => (
            <option key={option} value={option}>
              {feedSortLabels[option]}
            </option>
          ))}
        </select>
      </label>
      {newSinceSnapshot > 0 && (
        <button
          type="button"
          className="button secondary"
          onClick={() => setReloadKey((key) => key + 1)}
        >
          +{newSinceSnapshot} novo(s) · atualizar
        </button>
      )}
      {collecting && (
        <div className="notice">Coletando ao vivo — novos itens não reordenam esta lista.</div>
      )}
      {failed.length > 0 && (
        <div className="notice">
          Resultado parcial: {failed.length} fonte(s) falharam (
          {failed.map((source) => source.reason).join(', ')}).
        </div>
      )}
      {truncated.length > 0 && (
        <div className="notice">
          Coleta truncada pelo orçamento de chamadas em {truncated.length} fonte(s).
        </div>
      )}
      {error && <div className="notice">{error}</div>}
      <div className="lens">
        <label>
          <input
            type="checkbox"
            checked={lens.favorite}
            onChange={(event) => setLens({ ...lens, favorite: event.target.checked })}
          />{' '}
          só coração
        </label>
        <label>
          Etiqueta{' '}
          <select
            value={lens.label}
            onChange={(event) =>
              setLens({ ...lens, label: event.target.value as FeedLens['label'] })
            }
          >
            <option value="">qualquer</option>
            <option value="none">sem etiqueta</option>
            <option value="shortlisted">shortlist</option>
            <option value="monitored">monitorar</option>
            <option value="discarded">descartados</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={lens.hideDiscarded}
            onChange={(event) => setLens({ ...lens, hideDiscarded: event.target.checked })}
          />{' '}
          esconder descartados
        </label>
        <label>
          Condição{' '}
          <input
            type="text"
            value={lens.condition}
            onChange={(event) => setLens({ ...lens, condition: event.target.value })}
          />
        </label>
        <label>
          Texto{' '}
          <input
            type="text"
            value={lens.q}
            onChange={(event) => setLens({ ...lens, q: event.target.value })}
          />
        </label>
        <label>
          Custo máx. (centavos){' '}
          <input
            type="number"
            min={1}
            value={lens.maxTotalCostMinor}
            onChange={(event) => setLens({ ...lens, maxTotalCostMinor: event.target.value })}
          />
        </label>
        <label>
          Score mínimo{' '}
          <input
            type="number"
            min={0}
            max={100}
            value={lens.minScore}
            onChange={(event) => setLens({ ...lens, minScore: event.target.value })}
          />
        </label>
        {filteredOut > 0 && <span className="muted">{filteredOut} fora da lente</span>}
        <button
          type="button"
          className="button secondary"
          onClick={() => void exportSelection('csv')}
        >
          Exportar CSV
        </button>
        <button
          type="button"
          className="button secondary"
          onClick={() => void exportSelection('xlsx')}
        >
          Exportar XLSX
        </button>
      </div>
      <p className="keyhint">
        Teclado: J/K navegar · X descartar · S shortlist · M monitorar · H coração · Enter dossiê ·
        Esc fecha
      </p>
      {empty && <p className="muted">Nenhum anúncio foi associado a este projeto ainda.</p>}
      {emptyByLens && (
        <div className="notice">
          Nenhum item passa pela lente atual ({filteredOut} escondido(s)).{' '}
          <button type="button" className="button secondary" onClick={() => setLens(emptyLens)}>
            Afrouxar filtros
          </button>
        </div>
      )}
      {!loading && totals.rankable > 0 && (
        <>
          <p className="muted">
            Ranqueáveis: distância do custo até a mediana de preço pedido do segmento. Não é margem;
            desconto grande costuma ser defeito que a mediana não captura.
          </p>
          {sort === 'score' && (
            <p className="muted">
              Score completo primeiro; itens com score incompleto (texto não analisado) vêm depois,
              na ordem da distância da referência, sem serem comparados ao score.
            </p>
          )}
          <div className="listing-list">{groups.rankable.items.map(renderFeedItem)}</div>
          {groups.rankable.nextOffset !== null && (
            <button
              type="button"
              className="button secondary"
              onClick={() => void loadMore('rankable')}
            >
              Carregar mais ranqueáveis
            </button>
          )}
        </>
      )}
      {!loading && totals.unbacked > 0 && (
        <>
          <div className="results-head">
            <div className="eyebrow">Sem lastro</div>
            <strong>{totals.unbacked}</strong>
          </div>
          <p className="muted">{refusalGroupLabel}</p>
          <div className="listing-list">{groups.unbacked.items.map(renderFeedItem)}</div>
          {groups.unbacked.nextOffset !== null && (
            <button
              type="button"
              className="button secondary"
              onClick={() => void loadMore('unbacked')}
            >
              Carregar mais sem lastro
            </button>
          )}
        </>
      )}
      {snapshot && <p className="meta">Snapshot {new Date(snapshot).toLocaleString('pt-BR')}</p>}
      {dossier && (
        <Dossier
          projectId={projectId}
          listing={dossier}
          request={request}
          onClose={() => setDossier(null)}
        />
      )}
    </section>
  );
}

function TextAnalysisSummary({ analysis }: { analysis?: ListingTextAnalysisTransport }) {
  if (!analysis) return <p className="muted">Carregando análise…</p>;
  if (!analysis.run)
    return <p className="muted">Nenhuma análise de texto para este anúncio ainda.</p>;
  if (analysis.run.status !== 'completed')
    return (
      <p className="muted">
        Análise {analysis.run.status}
        {analysis.run.errorCode ? ` · ${analysis.run.errorCode}` : ''} · {analysis.run.provider}
      </p>
    );
  return (
    <div className="history">
      <strong>Análise de texto</strong>
      <p className="meta">
        {analysis.run.producedBy
          ? `${analysis.run.producedBy.provider} · ${analysis.run.producedBy.model} · ${analysis.run.producedBy.promptVersion}`
          : `${analysis.run.provider} · ${analysis.run.promptVersion}`}
      </p>
      {analysis.defects.length === 0 ? (
        <p className="muted">
          Nenhum defeito declarado ou inferido no texto. Ausência no texto não prova funcionamento.
        </p>
      ) : (
        <ul>
          {analysis.defects.map((defect) => (
            <li key={defect.key}>
              {defect.component}: {defect.defectType} · {defect.status} · severidade{' '}
              {defect.severity} · confiança {Math.round(defect.confidence * 100)}% · evidência{' '}
              {defect.evidenceKeys.join(', ')}
            </li>
          ))}
        </ul>
      )}
      <ul>
        {analysis.evidences.map((evidence) => (
          <li key={evidence.key} className="muted">
            [{evidence.key}] {evidence.claim} · {evidence.assessmentKind} · origem{' '}
            {evidence.sourceReference} · {evidence.model ?? 'modelo desconhecido'}
          </li>
        ))}
      </ul>
    </div>
  );
}

function InventoryPanel({
  request,
}: {
  request: (path: string, init?: RequestInit) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [label, setLabel] = useState('');
  const [sinceDays, setSinceDays] = useState('');
  const [result, setResult] = useState<{
    total: number;
    matched: number;
    items: ListingTransport[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const params = new URLSearchParams();
    if (favorite) params.set('favorite', 'true');
    if (label) params.set('label', label);
    if (sinceDays.trim()) params.set('sinceDays', sinceDays.trim());
    void request(`/api/inventory?${params}`)
      .then((raw) => {
        const body = raw as { total: number; matched: number; items: unknown[] };
        setResult({
          total: body.total,
          matched: body.matched,
          items: listingTransportSchema.array().parse(body.items),
        });
        setError(null);
      })
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : 'Falha ao carregar o inventário.'),
      );
  }, [open, favorite, label, sinceDays, request]);
  return (
    <article className="panel detail">
      <div className="actions">
        <div className="eyebrow">Inventário · acervo inteiro, fora de qualquer pesquisa</div>
        <button type="button" className="button secondary" onClick={() => setOpen(!open)}>
          {open ? 'Fechar inventário' : 'Abrir inventário'}
        </button>
      </div>
      {open && (
        <>
          <div className="lens">
            <label>
              <input
                type="checkbox"
                checked={favorite}
                onChange={(event) => setFavorite(event.target.checked)}
              />{' '}
              só coração
            </label>
            <label>
              Etiqueta{' '}
              <select value={label} onChange={(event) => setLabel(event.target.value)}>
                <option value="">qualquer</option>
                <option value="shortlisted">shortlist</option>
                <option value="monitored">monitorar</option>
                <option value="discarded">descartados</option>
              </select>
            </label>
            <label>
              Últimos dias{' '}
              <input
                type="number"
                min={1}
                value={sinceDays}
                onChange={(event) => setSinceDays(event.target.value)}
              />
            </label>
            {result && (
              <span className="muted">
                {result.matched} de {result.total} no acervo
              </span>
            )}
          </div>
          {error && <div className="notice">{error}</div>}
          <div className="listing-list">
            {result?.items.map((listing) => (
              <article className="listing-card" key={listing.id}>
                <div>
                  <div className="meta">
                    {listing.condition} · {listing.status}
                    {listing.userAction?.favorite ? ' · ♥' : ''}
                    {listing.userAction?.label ? ` · ${labelNames[listing.userAction.label]}` : ''}
                  </div>
                  <h3>{listing.title}</h3>
                  <LandedCostSummary listing={listing} />
                  <ScoreSummary listing={listing} />
                </div>
                <a className="button secondary" href={listing.url} target="_blank" rel="noreferrer">
                  Ver anúncio
                </a>
              </article>
            ))}
          </div>
        </>
      )}
    </article>
  );
}

const ID_TOKEN = /\[id:([0-9a-f-]{36})\]/gi;

function AgentPanel({
  projectId,
  request,
  onApplyFilter,
  onOpenListing,
}: {
  projectId: string;
  request: (path: string, init?: RequestInit) => Promise<unknown>;
  onApplyFilter: (filter: Record<string, unknown>) => void;
  onOpenListing: (listingId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>(
    [],
  );
  const [turn, setTurn] = useState<AgentChatResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async (body: Record<string, unknown>, nextHistory: typeof history) => {
    setBusy(true);
    setError(null);
    try {
      const response = agentChatResponseSchema.parse(
        await request('/api/agent/chat', {
          method: 'POST',
          body: JSON.stringify({ projectId, ...body }),
        }),
      );
      setTurn(response);
      setHistory([...nextHistory, { role: 'assistant', content: response.reply }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'O agente falhou.');
    } finally {
      setBusy(false);
    }
  };

  const ask = async () => {
    if (!draft.trim()) return;
    const nextHistory = [...history, { role: 'user' as const, content: draft.trim() }];
    setHistory(nextHistory);
    setDraft('');
    await send({ messages: nextHistory }, nextHistory);
  };

  const renderReply = (text: string) => {
    const parts: Array<string | JSX.Element> = [];
    let last = 0;
    for (const match of text.matchAll(ID_TOKEN)) {
      parts.push(text.slice(last, match.index));
      const id = match[1];
      parts.push(
        <button
          key={`${id}-${match.index}`}
          type="button"
          className="badge"
          onClick={() => onOpenListing(id)}
        >
          {id.slice(0, 8)}
        </button>,
      );
      last = (match.index ?? 0) + match[0].length;
    }
    parts.push(text.slice(last));
    return parts;
  };

  return (
    <article className="panel detail">
      <div className="actions">
        <div className="eyebrow">Agente · responde só com o que as ferramentas devolvem</div>
        <button type="button" className="button secondary" onClick={() => setOpen(!open)}>
          {open ? 'Fechar agente' : 'Perguntar ao agente'}
        </button>
      </div>
      {open && (
        <>
          {history.map((message, index) => (
            <p
              key={index}
              className={message.role === 'user' ? 'meta' : undefined}
              style={{ whiteSpace: 'pre-wrap' }}
            >
              {message.role === 'user' ? `Você: ${message.content}` : renderReply(message.content)}
            </p>
          ))}
          {turn && turn.appliedFilters.length > 0 && (
            <div className="notice">
              Filtro aplicado pelo agente:
              {turn.appliedFilters.map((filter, index) => (
                <div key={index} className="actions">
                  <code>
                    {Object.entries(filter)
                      .filter(
                        ([key]) => !['projectId', 'offset', 'limit', 'hideDiscarded'].includes(key),
                      )
                      .map(([key, value]) => `${key}=${String(value)}`)
                      .join(' · ')}
                  </code>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => onApplyFilter(filter)}
                  >
                    Aplicar na lista
                  </button>
                </div>
              ))}
            </div>
          )}
          {turn?.uncitedIds.length ? (
            <div className="notice">
              {turn.uncitedIds.length} id(s) citados sem vir de ferramenta foram removidos.
            </div>
          ) : null}
          {turn?.pendingConfirmation && (
            <div className="notice">
              Confirmação necessária: {turn.pendingConfirmation.tool} ·{' '}
              {turn.pendingConfirmation.estimate}
              <div className="actions">
                <button
                  type="button"
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    void send(
                      {
                        messages: history.length
                          ? history
                          : [{ role: 'user', content: 'confirmar' }],
                        confirm: {
                          tool: turn.pendingConfirmation!.tool,
                          args: turn.pendingConfirmation!.args,
                        },
                      },
                      history,
                    )
                  }
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setTurn({ ...turn, pendingConfirmation: null })}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {error && <div className="notice">{error}</div>}
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder='Ex.: "quantos iPhone 13 usados abaixo de US$ 300?"'
            rows={3}
            style={{ width: '100%' }}
          />
          <div className="actions">
            <button type="button" className="button" disabled={busy} onClick={() => void ask()}>
              {busy ? 'Consultando…' : 'Perguntar'}
            </button>
            {turn && (
              <span className="meta">
                {turn.provider} · {turn.model}
              </span>
            )}
          </div>
        </>
      )}
    </article>
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

  const download = useCallback(
    async (path: string) => {
      if (!session) throw new Error('Faça login para continuar.');
      const response = await fetch(`${apiUrl}${path}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) await readJson(response);
      const disposition = response.headers.get('Content-Disposition') ?? '';
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'scout-export';
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
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
          {selected && <ProjectDetail project={selected} request={request} download={download} />}
          <InventoryPanel request={request} />
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
  download,
}: {
  project: ResearchProject;
  request: (path: string, init?: RequestInit) => Promise<unknown>;
  download: (path: string) => Promise<void>;
}) {
  const [listings, setListings] = useState<ListingTransport[]>([]);
  const [marketMetrics, setMarketMetrics] = useState<MarketMetricsTransport | null>(null);
  const [valuations, setValuations] = useState<Record<string, OpportunityValuationTransport>>({});
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
  const [textAnalyses, setTextAnalyses] = useState<Record<string, ListingTextAnalysisTransport>>(
    {},
  );
  const [expandedAnalysisId, setExpandedAnalysisId] = useState<string | null>(null);
  const [analysisNotice, setAnalysisNotice] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState<{
    filter: Record<string, unknown>;
    nonce: number;
  } | null>(null);
  const [openRequest, setOpenRequest] = useState<{ id: string; nonce: number } | null>(null);

  const scheduleTextAnalysis = async () => {
    setAnalysisNotice('Enfileirando análise de texto…');
    try {
      const result = textAnalysisScheduleResultSchema.parse(
        await request(`/api/projects/${project.id}/analysis`, { method: 'POST' }),
      );
      setAnalysisNotice(
        `${result.queued} de ${result.requested} anúncio(s) enfileirado(s) para ${result.provider} (${result.model}); os já analisados com o mesmo texto e prompt foram pulados.`,
      );
    } catch (error) {
      setAnalysisNotice(error instanceof Error ? error.message : 'Falha ao enfileirar a análise.');
    }
  };

  const toggleTextAnalysis = async (listingId: string) => {
    if (expandedAnalysisId === listingId) {
      setExpandedAnalysisId(null);
      return;
    }
    setExpandedAnalysisId(listingId);
    try {
      const raw = await request(`/api/projects/${project.id}/listings/${listingId}/analysis`);
      setTextAnalyses((current) => ({
        ...current,
        [listingId]: listingTextAnalysisTransportSchema.parse(raw),
      }));
    } catch (error) {
      setAnalysisNotice(error instanceof Error ? error.message : 'Falha ao carregar a análise.');
    }
  };

  useEffect(() => {
    let cancelled = false;
    setListingError(null);
    void request(`/api/projects/${project.id}/listings`)
      .then((raw) => {
        if (!cancelled) setListings(listingTransportSchema.array().parse(raw));
      })
      .catch((error) => {
        if (!cancelled)
          setListingError(error instanceof Error ? error.message : 'Falha ao carregar anúncios.');
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, request]);

  useEffect(() => {
    let cancelled = false;
    void request(`/api/projects/${project.id}/market-metrics`)
      .then((raw) => {
        if (!cancelled) setMarketMetrics(marketMetricsTransportSchema.parse(raw));
      })
      .catch(() => {
        if (!cancelled) setMarketMetrics(null);
      });
    return () => {
      cancelled = true;
    };
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

  const renderListingCard = (listing: ListingTransport) => (
    <article className="listing-card" key={listing.id}>
      <div>
        <div className="meta">eBay · {listing.condition}</div>
        <h3>{listing.title}</h3>
        <LandedCostSummary listing={listing} />
        <ReferenceDiscountSummary listing={listing} />
        <ScoreSummary listing={listing} />
        {listing.location ? <p className="muted">{listing.location}</p> : null}
        {valuations[listing.id] && listing.landedCost?.status === 'known' && (
          <p className="valuation">
            Mercado estimado: {listing.currency}{' '}
            {(valuations[listing.id].estimatedMarketPriceMinor / 100).toFixed(2)} · Compra máxima:{' '}
            {listing.currency} {(valuations[listing.id].maxPurchasePriceMinor / 100).toFixed(2)} ·
            Deal {Math.round(valuations[listing.id].scores.dealScore)}
          </p>
        )}
        {triageDecisions.find((decision) => decision.listingId === listing.id) && (
          <>
            <p className="muted">
              Triagem:{' '}
              {
                triageDecisions.find((decision) => decision.listingId === listing.id)!.investigation
                  .state
              }
              {triageReviews[listing.id] ? ` · revisão ${triageReviews[listing.id].status}` : ''}
            </p>
            <p className="muted">
              Identidade:{' '}
              {[
                triageDecisions.find((decision) => decision.listingId === listing.id)!.identity
                  .attributes.brand,
                triageDecisions.find((decision) => decision.listingId === listing.id)!.identity
                  .attributes.model,
              ]
                .filter(Boolean)
                .join(' · ') || 'não identificada'}{' '}
              ·{' '}
              {
                triageDecisions.find((decision) => decision.listingId === listing.id)!.identity
                  .media.imageCount
              }{' '}
              imagem(ns)
            </p>
          </>
        )}
        {expandedAnalysisId === listing.id && (
          <TextAnalysisSummary analysis={textAnalyses[listing.id]} />
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
          onClick={() => void toggleTextAnalysis(listing.id)}
        >
          {expandedAnalysisId === listing.id ? 'Ocultar análise de texto' : 'Ver análise de texto'}
        </button>
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
  );

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
      {listingError && <div className="notice">{listingError}</div>}
      {triageError && <div className="notice">{triageError}</div>}
      <div className="actions">
        <button type="button" className="button" onClick={() => void scheduleTextAnalysis()}>
          Analisar texto com IA
        </button>
      </div>
      {analysisNotice && <div className="notice">{analysisNotice}</div>}
      <AgentPanel
        projectId={project.id}
        request={request}
        onApplyFilter={(filter) => setAgentFilter({ filter, nonce: Date.now() })}
        onOpenListing={(id) => setOpenRequest({ id, nonce: Date.now() })}
      />
      <ListingFeed
        projectId={project.id}
        request={request}
        download={download}
        agentFilter={agentFilter}
        openRequest={openRequest}
        renderListingCard={renderListingCard}
      />
    </article>
  );
}
