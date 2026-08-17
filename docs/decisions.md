# Architectural Decisions Log (ADR) — Project Scout

This document records the architectural choices proposed for **Project Scout**, detailing options, trade-offs, and distinguishing between decisions closed by the user and open recommendations.

---

## 1. Closed Decisions (Approved by User)

### 1.1 Core Platform Strategy

- **Decision**: The DOCX v1.1 MVP uses exactly three staged sources: eBay, Mercado Livre and Xianyu. The legacy eBay adapter remains the reference; Mercado Livre is introduced through its official BR API, while Xianyu requires a separate source-discovery gate. Other marketplaces and product categories remain out of scope.

### 1.2 Monorepo Codebase & Directory Structure

- **Decision**: Adopt a modular monorepo workspace architecture structured around `apps/` and `packages/`.
- **Structure Layout**:
  - `apps/web`: Next.js SPA Frontend Dashboard.
  - `apps/worker`: Cloudflare Workers API Gateway & async Queue Consumers.
  - `packages/domain`: Pure vendor-agnostic domain models, value objects, and ports interfaces.
  - `packages/database`: PostgreSQL/Supabase queries, migrations, and typed database models.
  - `packages/ebay-connector`: Official eBay Browse API adapter and payload mappers.
  - `packages/collection`: `CollectionGateway` orchestration and caching logic.
  - `packages/ai`: Prompts, LLM JSON extractors, and mock AI implementations.
  - `packages/scoring`: Parametric opportunity score engine.
  - `packages/schemas`: Shared Zod validation schemas.
  - `packages/exports`: Spreadsheet formatting utilities (CSV/XLSX).
  - `packages/config`: Shared TypeScript, ESLint, and environment configurations.

### 1.3 Data Acquisition Adapter

- **Decision**: Use the **official eBay Browse/Buy API** as the primary adapter. An external scraping provider is reserved as a separate future adapter for parsing missing HTML descriptions, but is **not implemented** in this phase. The **Mock Connector** (`MockConnector`) is the active integration strategy during early development.

### 1.4 Asynchronous Pipeline Architecture

- **Decision**: Implement all background tasks, dispatchers, queue workers, and API routing on **Cloudflare Workers** (`apps/worker`). Use Cloudflare Workflows for state management and Cloudflare Queues for message processing.

### 1.5 Database and Vector Storage Scope Policy

- **Decision**: Store all structured data (projects, listings, defects, evidence) in a relational database. **No embeddings, full RAG, or pgvector extensions will be implemented in the initial state or Milestone 1/2**.

### 1.6 Foundation Tooling & Verification CI (Milestone 1)

- **Decision**: Standardize monorepo management on **`npm` workspaces**, with **Vitest** as unit test runner, **ESLint/Prettier** for code formatting, and **GitHub Actions** (`.github/workflows/ci.yml`) for automated verification.

### 1.7 Frontend Package Isolation Boundary

- **Decision**: The Next.js frontend app (`apps/web`) is strictly restricted to importing and transpiling frontend-safe, infrastructure-agnostic packages: `@scout/config`, `@scout/domain`, and `@scout/schemas`. Backend infrastructure packages (`@scout/database`, `@scout/ebay-connector`, `@scout/collection`, `@scout/ai`) must never be imported into or transpiled by the frontend app.

### 1.8 Database Monetary Representation (Milestone 2)

- **Decision**: Store monetary amounts using PostgreSQL `NUMERIC(12, 2)` columns, validated by Zod non-negative number schemas.

### 1.9 Canonical Supabase CLI Layout & Seed Source (Milestone 2)

- **Decision**: Adopt the canonical Supabase layout under `supabase/config.toml`, `supabase/migrations/20260728160000_initial_schema.sql`, and `supabase/seed.sql` as the single source of truth for database migrations and seed data.

### 1.10 Explicit Project-Listing Mediation & Collection Runs Isolation (Milestone 2)

- **Decision**: Create an explicit junction table `research_project_listings` linking projects to listings with owner RLS policies. Restrict `collection_runs` RLS strictly to the project owner via `research_projects`.

### 1.11 Relational Defect-Evidence Linkage & Score UUID History (Milestone 2)

- **Decision**: Replace `defects.evidence_ids UUID[]` with a relational junction table `defect_evidence`. Model `scores` with a dedicated UUID primary key (`id`) and `analysis_run_id` reference to preserve scoring history over time.

### 1.12 R2 Audit Metadata Storage for Snapshots (Milestone 2)

- **Decision**: Replace raw payload JSONB blobs in `listing_snapshots` with `raw_object_key`, `raw_content_hash`, and `raw_schema_version` linking to Cloudflare R2 object storage.

### 1.13 Principle of Least Privilege Database Grants (Milestone 2)

- **Decision**: Refuse global `GRANT ALL` to `authenticated` or `anon`. The internal MVP grants no table access to `anon`. Role `authenticated` receives CRUD on user private tables (controlled by RLS) and read-only access on shared marketplace tables. Role `service_role` receives full privileges for backend worker ingestion pipelines.

### 1.14 User-request database path (Milestone 3)

- **Decision**: The browser authenticates with Supabase Auth and sends the access token to the Cloudflare Worker. The Worker validates the token with Auth and forwards that same JWT to PostgREST. RLS—not a client-supplied `userId`—authorizes every project operation. `service_role` is excluded from this flow.

### 1.15 Canonical project criteria storage (Milestone 3)

- **Decision**: `research_projects.structured_query` is the canonical, versioned `ResearchCriteria` JSONB document for the interactive project editor. The older `research_project_criteria` table remains for compatibility with Milestone 2 and must not be dual-written until a concrete normalized-query use case appears.

### 1.16 Deterministic interpretation before real AI (Milestone 3)

- **Decision**: Portuguese rules and a versioned taxonomy provide the operational interpreter. A real AI adapter is an explicit disabled stub. Provider/model/version/timestamp metadata is generated by the Worker and is not trusted from the browser.

### 1.17 Soft deletion and hidden authorization failures (Milestone 3)

- **Decision**: Project deletion sets `status='deleted'` and `deleted_at`; default reads exclude deleted rows. Reads blocked by RLS return the same 404 as nonexistent projects to avoid disclosing another user's identifiers.

### 1.18 Minimal queue envelope and canonical database reload (Milestone 4)

- **Decision**: Collection queue messages contain only schema version and collection-run UUID. The consumer atomically claims the run and reloads the active project's canonical criteria from PostgreSQL; it never trusts criteria, owner, source or provider values embedded in a queue message.

### 1.19 Collection idempotency and retry lease (Milestone 4)

- **Decision**: A unique `(project_id, idempotency_key)` constraint protects request retries. Queue redelivery is protected by `claim_collection_run`, which transitions `pending → running` atomically, increments attempts and sets a five-minute lease. An active-lease redelivery is delayed instead of acknowledged; the consumer allows 12 delivery retries to survive a post-claim infrastructure outage. Explicit transient connector errors retry at most three execution attempts; permanent or exhausted failures become terminal and retain safe error kind/code metadata.

### 1.20 System-owned collection lifecycle (Milestone 4)

- **Decision**: Authenticated users may read their owner-scoped collection runs but cannot directly insert/update/delete them. Narrow `request_ebay_collection_run` and `mark_collection_run_queued` RPCs validate ownership and allowed transitions. Only the queue consumer receives `service_role` to claim and complete/fail runs; that secret is never used by browser code or project CRUD.

### 1.21 Opt-in official eBay adapter with mock-safe default (Milestone 5)

- **Decision**: `EBAY_CONNECTOR_MODE` defaults to `mock`. `sandbox` or `production` selects `EbayApiAdapter` only inside the queue consumer and only with server-side credentials. Missing or invalid live configuration becomes a permanent, sanitized run failure instead of silently falling back or retrying forever.

### 1.22 Application OAuth tokens cached only in isolate memory (Milestone 5)

- **Decision**: Browse API uses the client-credentials grant and base `api_scope`. Tokens are cached until 60 seconds before expiration in Worker isolate memory, never in queue messages, PostgreSQL, KV or logs. This avoids durable secret-bearing state; the trade-off is duplicate token minting across isolates, which must be monitored against the account quota before scaling.

### 1.23 Conservative eBay query translation (Milestone 5)

- **Decision**: Search uses fixed-price listings only, defaults to condition ID 7000 and maps explicitly reviewed conditions. Maximum price is sent only when criteria and marketplace currencies match; BRL is not treated as USD. The gateway defaults to one page and at most five detailed candidates, while each live adapter instance rejects a seventh Browse request, including retries. Currency conversion, market-price comparison and broader candidate collection remain later work.

### 1.24 Validate external payloads and persist only stable errors (Milestone 5)

- **Decision**: OAuth, search and detail JSON are validated before crossing the connector boundary. HTTP 408/429/5xx, timeouts and network errors are transient; ordinary 4xx errors are permanent, with one 401 token refresh. Third-party error text is not persisted or logged; only internal codes and sanitized messages are retained.

### 1.25 Local eBay credential onboarding without browser credential capture (Milestone 5)

- **Decision**: `npm run ebay:setup` may open the fixed official Application Keys URL, but credentials are copied by the owner into a local hidden terminal prompt. The assistant updates only ignored `apps/worker/.dev.vars`, rejects symlinks, writes atomically with mode `0600` and never logs values. It does not automate developer-portal login/cookies and does not provision remote Cloudflare secrets.

### 1.26 Canonical listing identity and hash semantics (Milestone 6)

- **Decision**: Treat `(source_id, external_id)` as the only automatic listing identity. Store canonical raw JSON under a SHA-256-addressed R2 key and use that hash to suppress unchanged snapshots and identify updates. Never merge different external IDs from title, seller or image similarity without a later reviewed duplicate-link model.

### 1.27 Exact normalization and transactional ingestion boundary (Milestone 6)

- **Decision**: Keep money in integer minor units through connector and normalization contracts, converting to PostgreSQL `NUMERIC(12, 2)` only inside a service-role-only transactional RPC. The RPC owns seller/listing upsert, project linkage, image metadata, snapshots and price history. Raw R2 storage occurs before the RPC; retrying is safe because both the object key and database upserts are idempotent.

### 1.28 Generated Cloudflare binding contract (Milestone 6)

- **Decision**: Generate the non-secret Worker binding interface from Wrangler configuration and refine only optional/secret fields in `env.ts`. KV and R2 use actual top-level bindings, including the new `RAW_BUCKET`; compatibility date and `nodejs_compat` are explicit. Remote observability and Wrangler v4 migration remain deployment-readiness work rather than being introduced inside Marco 6.

### 1.29 Subscription instead of eBay data-persistence exemption (Marco 6.1)

- **Decision**: The application must subscribe to Marketplace Account Deletion notifications because it persists normalized listings, seller identifiers and raw JSON. It must never claim the “Not persisting eBay data” exemption.

### 1.30 Verify before durable acceptance; delete storage before relations (Marco 6.1)

- **Decision**: The public Worker validates the official signature before publishing a minimal deletion task. The consumer removes R2 objects before the PostgreSQL finalization RPC so a database failure can safely retry while object paths remain discoverable.

### 1.31 Minimal deletion audit and keyed seller raw prefix (Marco 6.1)

- **Decision**: PostgreSQL retains only notification ID, lifecycle, counts and timestamps. Account identifiers remain transient in Cloudflare Queue. New raw keys include an HMAC-SHA-256 seller prefix, which enables cleanup of unlinked R2 objects without exposing a dictionary-testable username hash. Rotating the HMAC key requires an explicit migration/retention strategy.

### 1.32 Canonical eBay source as reference data (Marco 6.1 deployment)

- **Decision**: Provision the single eBay US source through an idempotent migration with a stable well-known UUID. Collection RPCs require this row in every environment, while `seed.sql` remains restricted to local users, projects and listing fixtures and is never applied to the remote production database.

### 1.33 Isolated Cloudflare production bindings and Wrangler 4 (Marco 6.1 deployment)

- **Decision**: Keep top-level Wrangler bindings for local development and declare a separate `production` environment using `-prod` Queue/R2/KV resources. Production collection remains explicitly in mock mode even after credential validation; enabling it additionally requires quota telemetry and reviewed candidate filtering. Upgrade Wrangler to v4 because the current Cloudflare Queues API rejects queue creation issued by the obsolete v3 client.

### 1.34 Disable user APIs on the privacy-only production deployment (Marco 6.1)

- **Decision**: Deploy `/health` and the eBay account-deletion webhook publicly, but return 404 for `/api/*` when `PUBLIC_API_ENABLED=false`. The authenticated API must not be enabled remotely until rate limiting and the production frontend origin are configured; local development remains enabled.

### 1.35 Use the standard SHA-1 digest name for eBay ECDSA verification (Marco 6.1)

- **Decision**: Verify the eBay Marketplace Account Deletion signature with Node `createVerify('sha1')`. The prior OpenSSL alias `ssl3-sha1` is equivalent on local Node but is not portable to the Cloudflare Workers runtime. The digest remains the one required by the received eBay signature contract; this is a runtime-compatibility correction, not a weakening or fallback that bypasses verification.

### 1.36 Fail-closed manual Production probe and six-call Browse budget

- **Decision**: Keep normal Production collection in mock mode and expose the manual eBay probe only while a 64-hex server secret exists. The probe validates a bounded request, performs one condition-7000 search and fetches at most five details with retries disabled. Removing the secret makes the route indistinguishable from an unknown route (`404`). The probe does not persist results and is not a substitute for user API rate limiting or quota telemetry.

### 1.37 Deterministic textual analysis before live LLM use (Milestone 7)

- **Decision**: Make `TextAnalyzer` provider-neutral and ship deterministic/mock providers first. Gemini 2.5 Flash remains a candidate, not an implemented integration. This follows the Milestone 7 boundary, avoids sending persisted seller text to a third party without a privacy decision, and preserves truthful provider/model metadata.

### 1.38 Text-hash idempotency and minimal analysis task (Milestone 7)

- **Decision**: Identify a textual analysis by listing UUID, SHA-256 of title/description/condition, analysis type, model and prompt version. Queue messages contain only the analysis-run UUID. Consumers claim with a five-minute lease and reload input from PostgreSQL; no listing text, credentials or user/project identifiers enter the queue payload.

### 1.39 Transactional evidence graph and local-only analysis queue (Milestone 7)

- **Decision**: Persist one validated result transactionally into `analysis_runs`, `evidence`, `defects` and `defect_evidence`; model references are resolved by result-local keys and cannot target another run. The top-level Wrangler config runs the analysis queue locally. Production provisioning/deployment is a separate gate and must not be inferred from local completion.

### 1.40 Sanitized eBay request telemetry and per-instance budget snapshot

- **Decision**: Expose optional, in-process eBay request telemetry and an authoritative budget snapshot to the trusted caller. Events carry operation, attempt, status, stable error code, retry-after and budget position, but never URLs, tokens, credentials or response bodies. Observer exceptions are swallowed. This makes the existing six-call guard auditable without introducing durable quota state, a global rate limiter or Production collection enablement.

### 1.41 eBay semantic health mapping stays fail-closed

- **Decision**: Map a final unauthorized eBay response to `LOGIN_REQUIRED`; rate-limit responses to `RATE_LIMITED`; and invalid JSON, payload, mapping, pagination or repeated-cursor failures to `CONTENT_CHANGED`. Keep stable internal codes as diagnostics, discard provider error text, and do not activate a scraping fallback when the official contract changes.

### 1.42 eBay request guard with atomic Production reservation

- **Decision**: Apply a conservative `EBAY_GLOBAL_REQUESTS_PER_MINUTE` policy before each Browse request. Production requires the SQLite-backed `EBAY_RATE_LIMITER` Durable Object, which serializes reservations for each marketplace key and fails closed when unavailable; local and sandbox execution may use the KV guard. This closes the atomicity gate, but not the effective eBay quota or operational alerting gates.

### 1.43 Collection DLQ before alerting and replay policy

- **Decision**: Configure Cloudflare Queue dead-letter destinations for collection and analysis consumers after their 12 delivery retries. Do not configure one for the account-deletion queue yet: its transient task contains eBay account identifiers, so retention and replay controls must be reviewed before creating a second durable copy. A DLQ without alerting and a documented replay/retention procedure is not considered an operational gate completion.

### 1.44 Repositório sob controle de versão (reestruturação 2026-08-17)

- **Decisão**: O workspace passa a ser um repositório Git. O commit `a3c7c27`
  preserva integralmente o estado entregue por M1–M7 e F0–F7 antes de qualquer
  remoção. `.browser-profile/`, `supabase/.temp/` e `.maestri/` entram no
  `.gitignore` por conterem sessão de navegador e estado local de ferramenta.
  Motivo: 12 mil linhas e 30 handoffs existiam sem histórico, rollback ou
  revisão de diff.

### 1.45 Núcleo próprio de coleta em vez de provedor externo (2026-08-17)

- **Decisão**: A cascata de coleta é construída internamente. Provedor externo
  (Firecrawl, Apify) pode ser usado pontualmente para **estudar** o
  comportamento de uma fonte, nunca no caminho crítico. Motivo do fundador:
  custo por chamada escala com o volume do garimpo e é definido por terceiro;
  parte da coleta precisa rodar na máquina do usuário com a sessão dele, o que
  nenhum SaaS de scraping faz. Isso **revoga** a orientação anterior de §9.3 do
  PRD original e o item de "crawler próprio proibido" do AGENTS.md anterior.

### 1.46 Local Agent é núcleo, não fase futura (2026-08-17)

- **Decisão**: A execução na máquina do usuário deixa de ser F7/pós-MVP e passa
  a ser um plano de execução de primeira classe (fatia S6), em modo
  somente-leitura. O agente **puxa** tarefas e nunca expõe porta de entrada;
  credencial e cookie do usuário não saem da máquina. Motivo: monitorar leilão e
  fonte autenticada é requisito de produto, não conveniência.

### 1.47 Remoção de F4–F7 do código ativo (2026-08-17)

- **Decisão**: Funções puras de auto-cura, leilão, negociação e autorização
  saem do build (commit `1291a6e`), preservadas em `a3c7c27`. Nenhuma tinha
  rota, fila, consumidor ou tela que as alcançasse; mantê-las fazia a suíte
  verde representar capacidade inexistente. As tabelas correspondentes
  permanecem no banco, órfãs, até uma migration de limpeza revisada. As
  capacidades voltam pelo ROADMAP (S8, S10, S12) quando houver tráfego real.

### 1.48 Costura `SourceDocument` entre núcleo e vertical (2026-08-17)

- **Decisão**: O núcleo trafega documento com proveniência, sem preço nem
  vocabulário de comércio; a vertical possui o mapper e o schema normalizado. A
  desnarrowing de `rawListingPreviewSchema` (preço obrigatório) e de
  `researchCriteriaSchema` (`category`/`brands` como enum global) acontece na
  fatia S5, junto com a primeira fonte sem API oficial — não antes, para não
  criar abstração sem segundo caso concreto.

### 1.49 Extração por LLM é dirigida por schema (2026-08-17)

- **Decisão**: A porta de IA recebe o schema de saída do chamador e não conhece
  o domínio. A vertical de comércio pede defeitos e evidências; outra vertical
  pediria outra coisa. Motivo: é o mesmo custo de implementação e evita que o
  núcleo nasça amarrado a eletrônicos. Testes usam resposta gravada; a suíte não
  chama a rede.

### 1.50 Filtrar é lente, não exclusão (2026-08-17)

- **Decisão**: O funil decide **onde o sistema gasta**, nunca **o que existe**.
  Todo anúncio permanece no acervo etiquetado com a camada alcançada e o motivo
  de ter parado ali; a UI decide o que exibir. Consequências: cota de IA esgotada
  não é erro (o item fica na camada atual e é analisado depois), e o vendedor de
  preço normal continua disponível para uma decisão futura do usuário.

### 1.51 Golpe vira lápide, não exclusão (2026-08-17)

- **Decisão**: Anúncio identificado como golpe conserva apenas id, url, hash
  perceptual, motivo, data e fonte; payload e imagens são descartados. Motivo:
  sem o registro mínimo, o sistema paga para redescobrir o mesmo golpe em toda
  pesquisa futura. Alinhado ao DOCX v1.1 §9.

### 1.52 Imagem: exibir, baixar e analisar são coisas separadas (2026-08-17)

- **Decisão**: Exibir usa a URL da fonte, sem download. A camada de risco baixa
  apenas a miniatura, calcula hash perceptual e descarta o binário. Alta
  resolução (~1024px) só para até três imagens dos finalistas. Preservação
  permanente em R2 apenas para itens marcados pelo usuário. Motivo: o custo
  proibitivo não é armazenamento, e sim volume de requests (bloqueio pela fonte)
  e tokens multimodais.

### 1.53 Análise de texto em lote, com isolamento por item (2026-08-17)

- **Decisão**: Requisições de análise carregam 10–20 anúncios, cada um envelopado
  individualmente, com saída em array validado e id de retorno. Motivo: o limite
  do free tier é requisições por dia, não tokens; lote reduz o consumo em ~95%.
  Risco aceito e mitigado: injeção cruzada entre itens do mesmo lote.

### 1.54 Recuperação estruturada antes de vetorial (2026-08-17)

- **Decisão**: O agente responde por filtro estruturado (95% dos casos), depois
  busca lexical (`tsvector`/`pg_trgm`), e só então vetores (`pgvector`) —
  reservados a identidade semântica, similaridade e pergunta vaga. Motivo:
  o pipeline existe para transformar texto em coluna; RAG sobre dado estruturado
  descarta essa estrutura e não sabe contar. A inteligência está na extração, não
  na recuperação.

### 1.55 Extrator genérico sob demanda é permitido; fábrica de connector não (2026-08-17)

- **Decisão**: Um único extrator dirigido por schema pode receber uma URL colada
  pelo usuário e devolver dado estruturado (S7). Continua proibido gerar **código
  de connector** automaticamente. Motivo: o primeiro não cria dívida de código
  não revisado; o segundo cria. Fonte recorrente vira connector dedicado escrito
  por humano.

### 1.56 Memória de mercado começa a ser gravada na S1 (2026-08-17)

- **Decisão**: Observação de preço com data passa a ser persistida desde a
  primeira coleta real, muito antes de existir qualquer métrica na tela. Séries
  de **preço pedido** e **preço realizado** nunca são misturadas. Estatística usa
  mediana com limpeza por IQR, janela móvel e `n` sempre visível. Motivo:
  histórico não se recupera — começar seis meses depois custa seis meses.

### 1.57 Acervo é global, favorito é por usuário e anúncio (2026-08-17)

- **Decisão**: O anúncio pertence ao acervo, não à pesquisa; a pesquisa é uma
  consulta sobre ele. `user_listing_actions` deve ser único por
  `(user_id, listing_id)` e não por projeto, corrigido na S3 antes de existir
  dado. Semântica separada: coração = "quero olhar depois"; `decision` = "o que
  eu fiz".
