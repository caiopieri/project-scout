# Agent Guidelines & Development Standards — Project Scout

Welcome, Agent. This document defines the vision, standards, constraints, and operational protocols for autonomous development of **Project Scout**. Read this document fully before editing files, running scripts, or defining execution plans.

---

## 1. System Vision

Project Scout is an opportunity intelligence platform that observes marketplaces and auctions, understands candidates with layered evidence, values them against current market, recommends actions, and only executes financial operations after explicit deterministic user authorization. The system is governed by the strategy document `Estrategia_Plataforma_Inteligente_de_Oportunidades_v1.1.docx` (hereafter **DOCX v1.1**). Where this AGENTS.md and DOCX v1.1 diverge, DOCX v1.1 wins for product scope and this file wins for engineering constraints.

Constitutional rule (DOCX §1): **IA interprets, researches, repairs, recommends and negotiates. The system validates, limits and executes. The user authorizes any binding action.**

The MVP refatoração is bounded to **DOCX F0–F3** (event model + 3 sources + search intelligence + opportunity engine). Auctions, negotiation, self-healing, control/execution plane and local GUI agent are **deferred** and tracked in `docs/post-mvp-roadmap.md`.

---

## 2. MVP Scope: F0–F3 do DOCX v1.1

- **Strict Constraint**: Implement only DOCX Fases 0–3 in the MVP:
  - **F0 — Core**: contrato canônico, banco aditivo, event model, health checks semânticos.
  - **F1 — 3 fontes**: Mercado Livre (API oficial BR), eBay (API oficial já implementada), Xianyu (fonte difícil — fluxo de ingestão multi-camada). Ver risco Xianyu em docs/v1.1-deltas.md.
  - **F2 — Search Intelligence**: expansão de consultas aprendível por typo/abreviação/idioma/genérico.
  - **F3 — Opportunity**: valuation atual, histórico, liquidez, seller pressure.
- **Out of MVP, explicitly deferred to F4–F7**: self-healing AI Maintainer (F4), auction due-diligence + live monitor (F5), negotiation assistida (F6), Local Agent + control/execution plane + authorization determinística (F7). Tracking em `docs/post-mvp-roadmap.md`.
- **Don't start deferred phases without explicit user gate**. Each F4–F7 tema tem ponto de partida documentado mas não tem código implementado.
- **Categoria inicial mantida do PRD original**: eletrônicos usados, defeituosos e subavaliados. Veículos, imóveis e leilões permanecem fora mesmo do DOCX-reescrito MVP.

---

## 3. Architecture & Integration Boundaries

To maintain modularity and avoid vendor lock-in, follow the ports/adapters model defined in [architecture.md](file:///Users/caioamaraldepieri/Projetos/Sistema%20de%20Pesquisa/docs/architecture.md):

- **No direct API calls**: Do not call scraping endpoints or LLMs directly from client code. Use the Gateway ports defined in `packages/domain`.
- **Collection Gateway Rule**: All external network requests to marketplaces must route through `packages/collection`. The gateway escolhe a camada de ingestão por prioridade (DOCX §3): 1) API oficial → 2) endpoint JSON/GraphQL → 3) WebSocket/SSE → 4) HTTP/HTML → 5) browser (Playwright via Cloudflare Browser Rendering) → 6) DOM/MutationObserver → 7) screenshot/OCR/IA multimodal. Cada fonte declara sua camada primária e fallback.
- **Source connectors (F1)**: três adapters no MVP — `EbayApiAdapter` (camada 1, já implementado), `MlApiAdapter` (camada 1, OAuth BR), `XianyuConnector` (camada 2/4, com risco explicitado em `docs/v1.1-deltas.md`). Adicionar nova fonte exige manifest, health check semântico e fallback strategy (ver Apêndice C do DOCX).
- **Frontend Package Isolation**: `apps/web` is strictly restricted to importing frontend-safe packages (`@scout/config`, `@scout/domain`, `@scout/schemas`). It must never import backend infrastructure packages (`@scout/database`, `@scout/ebay-connector`, `@scout/collection`, `@scout/ai`).
- **Supabase Canonical CLI Layout**: Database configurations, SQL migrations, and seed scripts must strictly reside under `supabase/config.toml`, `supabase/migrations/`, and `supabase/seed.sql`.
- **Cloudflare Bindings Scope**: Top-level KV, R2 and Queue bindings are local development templates. `env.production` binds isolated `-prod` resources provisioned for the Marco 6.1 privacy endpoint; do not reuse them for tests.
- **Supabase Auth / RLS**: Respect PostgreSQL Row Level Security. All queries executing database actions must provide user JWT tokens (`auth.uid()`) to restrict data access strictly to the authenticated owner.
- **Storage Isolation**: Raw JSON is content-addressed in `RAW_BUCKET` (eBay hoje; ML e Xianyu idem); future image binaries belong in `IMAGE_BUCKET`. PostgreSQL stores only object keys, hashes and metadata.
- **Cloudflare KV Restriction**: Do not use KV for listing cache, raw payloads, HTML, or deduplication data. Restrict KV to feature flags, transient configuration cache, and rate limiters.
- **Vector Index Scope**: Relational schemas can support future vector extensions, but pgvector vector storage or RAG search remains inactive initially and will only be activated upon approved use cases.
- **Current Delivery State**: Milestones 1–7 and the Marco 6.1 privacy gate are implemented locally. Marco 7 uses deterministic/mock textual analysis; its production queue and any live LLM remain unprovisioned. Production collection still remains explicitly in mock mode and user-facing `/api/*` remains disabled. The refatoração DOCX v1.1 reorganiza marcos em F0–F3; a entrega atual cobre boa parte de F0 (schema base) e piloto eBay de F1. Próxima fronteira: T1 (event model + schema aditivo).
- **Remote API Gate**: `PUBLIC_API_ENABLED=false` in production. Keep user-facing `/api/*` disabled until rate limiting and the intended frontend origin are deployed and reviewed.
- **Project API Auth**: User-facing project routes validate Supabase Auth bearer tokens and forward that same JWT to PostgREST. Never introduce `service_role` into project CRUD or trust a payload `userId`.
- **Intent Metadata Ownership**: Criteria are user-reviewable; interpreter provider/model/version/timestamp metadata is generated by the Worker, not accepted from the browser.
- **Collection Task Contract**: Queue messages contain only `{version, runId}`. Consumers must claim the run and reload criteria from PostgreSQL; never embed or trust owner IDs, criteria, credentials or listing payloads in the message.
- **Collection Privileges**: Collection request/read routes use the authenticated user's JWT and narrow RPCs. `SUPABASE_SERVICE_ROLE_KEY` is restricted to the queue consumer that claims/finalizes runs.
- **eBay Call Budget**: The default gateway is hard-capped at one search page and five detailed candidates. Each live adapter instance permits at most six Browse requests, including retries. Do not raise these limits or enable Production collection without quota telemetry, reviewed filtering and an explicit decision.
- **Health Checks Semânticos (DOCX §15)**: HTTP 200 não é saudável. Cada connector reporta `collector_health` com completude (listing_id 100%, price > 95%, title > 98%) e page-state (NORMAL / LOGIN_REQUIRED / CAPTCHA / EMPTY_RESULTS / RATE_LIMITED / ERROR / MODAL_BLOCKING / CONTENT_CHANGED).

---

## 4. Directory Structure

```
├── docs/                      # Technical Documentation
│   ├── PRD.md                 # Product Requirements (Read-only)
│   ├── architecture.md        # Technical Stack & Architecture
│   ├── domain-model.md        # Domain Entity specs & Schemas
│   ├── database-schema.md     # Relational Database Schema & Mermaid ER
│   ├── database-security.md   # Row Level Security Policies & Token Rules
│   ├── security-DoD.md        # Required security verification checklist
│   ├── ebay-integration.md    # eBay mappings and HTML selectors
│   ├── collection-gateway.md  # Marco 4 queue, idempotency and mock contracts
│   ├── search-criteria.md      # Versioned structured intent contract
│   ├── intent-interpreter.md   # Deterministic rules, aliases & limitations
│   ├── text-analysis.md        # Marco 7 pipeline, evidence contract & limitations
│   ├── mvp-plan.md            # F0–F3 Implementation Plan (DOCX v1.1)
│   ├── roadmap.md             # Now/Next/Later (F1–F3 active, F4–F7 deferred)
│   ├── post-mvp-roadmap.md    # F4–F7 deferred phases with starting points
│   ├── v1.1-deltas.md         # DOCX v1.1 vs repo atual — reuse/generalize/discard
│   ├── decisions.md           # Architecture Decisions Log (ADR)
│   └── environment.md         # Environment Setup & local variables
├── supabase/                  # Canonical Supabase CLI Folder
│   ├── config.toml            # Supabase Local Settings
│   ├── seed.sql               # Auth users & domain seed data
│   └── migrations/            # SQL Migration Files (aditive, nunca destrutivo)
├── AGENTS.md                  # This Guidelines file
├── .env.example               # Template environment variables (safe placeholders only)
├── package.json               # Monorepo root package configuration
├── apps/
│   ├── web/                   # Next.js Frontend App
│   └── worker/                # Cloudflare Workers API Gateway & Queue Consumers
└── packages/
    ├── domain/                # Pure vendor-agnostic domain models & interfaces
    ├── database/              # PostgreSQL/Supabase queries, migrations, & RLS
    ├── ebay-connector/        # eBay official API integration adapter & fixtures
    ├── ml-connector/          # Mercado Livre official API adapter (F1, TBD)
    ├── xianyu-connector/      # Xianyu multi-layer connector (F1, TBD)
    ├── collection/            # Collection Gateway interfaces & orchestration
    ├── ai/                    # Prompts, LLM JSON extractors, & mock clients
    ├── search-intelligence/   # Query family generation & learning (F2, TBD)
    ├── identity/              # Product Identity Engine (F2.5, TBD)
    ├── scoring/               # Parametric opportunity score engine (to be rewritten as valuation)
    ├── valuation/             # Deal/Trend/Liquidity/Seller Pressure (F3, TBD)
    ├── schemas/               # Shared Zod validation schemas
    ├── exports/               # Spreadsheet (CSV/XLSX) formatting helpers
    └── config/                # Shared TypeScript, ESLint, & environment configs
```

Packages marcados **(TBD)** ainda não existem; são criados nas T1–T7 conforme `docs/mvp-plan.md`. Não antecipe a criação de um package além da tarefa que o exige.

---

## 5. Development & Testing Commands

Execute commands in their corresponding folder using `npm`.

- **Install Dependencies**: `npm install` (run in workspace root).
- **Build App & Packages**: `npm run build` (run in workspace root).
- **Explicit Typecheck**: `npm run typecheck` (verifies TypeScript compilation across all workspaces).
- **Dev Environment (Worker API)**: `npm run dev --prefix apps/worker`
- **Dev Environment (Next.js UI)**: `npm run dev --prefix apps/web`
- **Run Tests**: `npm run test` (uses Vitest across packages).
- **eBay Smoke**: `npm run ebay:smoke` (skips without explicit Sandbox/Production mode and private credentials).
- **eBay Local Setup**: `npm run ebay:setup` (interactive; opens official keys portal, stores credentials only in ignored `apps/worker/.dev.vars`, then offers a smoke test).
- **Code Formatting**: `npm run format` (uses Prettier).
- **Code Linting**: `npm run lint` (uses ESLint).
- **Database Commands**:
  - `npm run db:start` (starts local Supabase containers)
  - `npm run db:migrate` (applies local migrations: `npx supabase migration up --local`)
  - `npm run db:reset` / `npm run db:seed` (resets DB locally and applies `supabase/seed.sql`: `npx supabase db reset --local`)
  - `npm run db:test` (runs unit + integration database test suites)

---

## 6. Coding Conventions & Standards

- **Strict TypeScript**: Never use `any` unless parsing mapping explicitly requires dynamic objects (which must be justified close to the implementation line). Define interfaces for all function params and returns.
- **Zod Schemas**: Every data payload entering or leaving the system (API requests, LLM outputs, collection results) must be validated using Zod schemas in `packages/schemas`.
- **Project Lifecycle**: Use `draft`, `active`, `archived`, and soft-deleted `deleted`. Default project reads must exclude `deleted`.
- **Collection Lifecycle**: Use `pending`, `running`, `completed`, `failed`; enforce idempotency per project, atomic claims, bounded transient retries and terminal permanent errors.
- **Text Analysis Lifecycle**: Queue only analysis-run UUIDs, reload canonical text, validate strict output and preserve provider/model/prompt metadata. Deterministic/mock are the only Marco 7 runtime providers; do not claim Gemini integration.
- **eBay Runtime Mode**: `EBAY_CONNECTOR_MODE` defaults to `mock`. `sandbox` and `production` are explicit server-side opt-ins; never claim live connectivity unless `npm run ebay:smoke` actually ran with the matching private keyset.
- **Listing Identity**: `(source_id, external_id)` is canonical identity. A canonical SHA-256 raw hash suppresses duplicate snapshots and detects updates; different external IDs are never auto-merged.
- **eBay Privacy Deletion**: Never select the no-persistence exemption. The public webhook must verify `x-ebay-signature`, enqueue durably and delete R2 before PostgreSQL finalization. Account identifiers must not enter audit tables or logs; R2 seller prefixes use the stable `EBAY_IDENTITY_HASH_SECRET` HMAC key. This rule survives the refatoração DOCX v1.1 — qualquer marketplace que exija data-retention compliance (ML, Xianyu futuramente) segue regra equivalente quando aplicável.
- **DRY & SOLID**: Avoid duplicating mapping logic. Keep scrapers decoupled from analysis functions.
- **Error Resilience**: Implement try-catch blocks with detailed logging inside Workers. In case of scraping failures, gracefully update the database status to `failed` and log the error trace without crashing the queue processor.

---

## 7. Security Protocols

### 7.1 Prompt Injection Protection

Listing descriptions (eBay, ML, Xianyu e futuras fontes) can contain malicious strings (e.g., instructions telling the LLM to ignore defects and assign a score of 100).

- **Treat data as untrusted**: Do not interpolate description text directly into prompts.
- **XML Wrapping**: Wrap scraped description values in strict `<listing_description>` tags.
- **Enforced JSON Schemas**: Require LLM tools to return JSON output that adheres to schemas, reducing the risk of textual hijacking.

### 7.2 Credentials Handling

- **No hardcoded secrets**: Never commit API keys, database passwords, or JWT secrets to code.
- Use Wrangler environment secrets (`wrangler secret put`) and `.env.local` variables.

---

## 8. Out of Scope

Agents are strictly prohibited from implementing:

- Real automated buying or bidding scripts (the platform is strictly read-only).
- Custom web crawlers running on raw server threads (all external network requests must route through the `CollectionGateway`; the official `EbayApiAdapter` is primary, and `ScrapingProvider` is an unimplemented future fallback).
- Live payment integrations, subscriptions, or credit card paywalls.
- Connectors, scrapers, APIs, mock data, or integration tests referencing marketplaces fora do escopo atual: **OLX, AliExpress, Goofish, Amazon**. Para o MVP DOCX v1.1, apenas **eBay, Mercado Livre e Xianyu** são permitidas (F1).
- Analysis or structures for other product domains, including but not limited to: **vehicles (cars), real estate (houses/apartments), and auction assets**.
- Live public **MCP Servers** (Model Context Protocol endpoints) or related public tool catalogs.
- Automatic connector generation tools/factories.
- **F4–F7 do DOCX v1.1 sem gate explícito**: self-healing AI Maintainer (F4), auction due-diligence + live monitor (F5), negotiation assistida (F6), Local Agent + control/execution plane + authorization determinística (F7). Tracking em `docs/post-mvp-roadmap.md`.
