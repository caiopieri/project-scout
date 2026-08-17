# MVP Implementation Plan — DOCX v1.1 (F0–F3)

This is the operational plan for the refactoring of Project Scout toward the
strategy in `Estrategia_Plataforma_Inteligente_de_Oportunidades_v1.1.docx`.
The existing eBay implementation is reused where its contracts are compatible;
the plan is additive and does not authorize a rewrite of working milestones.

## Boundary and delivery rules

- MVP scope is F0–F3 only: core/event model, three sources, search intelligence,
  and opportunity intelligence.
- The initial product category remains used, defective and under-valued
  electronics. Vehicles, real estate, auctions, automated buying and public MCP
  servers remain out of scope.
- eBay is the already implemented source. Mercado Livre and Xianyu are the two
  new F1 source boundaries; their adapters must be introduced incrementally and
  behind `CollectionGateway`.
- Raw, normalized and derived data remain separate. Original source data is
  never overwritten by interpretation.
- Production collection, public `/api/*`, live LLMs and financial execution
  remain disabled until their explicit gates are reviewed.
- Every external payload is untrusted and must pass Zod validation. Every
  connector must expose semantic health, not only HTTP status.

## F0 — Core: canonical contract, events and semantic health

### Objective

Extend the existing eBay-oriented foundation into a vendor-neutral event and
health model without breaking current auth, RLS, queue, privacy or storage
boundaries.

### Deliverables

- Versioned canonical listing, product identity, seller, source and evidence
  contracts in `packages/domain` and `packages/schemas`.
- Additive event model for discovered, updated, price-changed, removed and
  reappeared listings; market, collector and analysis events are extensible but
  do not require live producers in F0.
- Semantic collector health contract with completeness checks and page states:
  `NORMAL`, `LOGIN_REQUIRED`, `CAPTCHA`, `EMPTY_RESULTS`, `RATE_LIMITED`,
  `ERROR`, `MODAL_BLOCKING` and `CONTENT_CHANGED`.
- Database migrations for event and health facts, preserving the current RLS
  model and content-addressed raw storage.
- Replayable fixtures and migration tests from an empty local database.

### Acceptance

- Existing eBay tests and API contracts remain green.
- An invalid or incomplete source response produces a typed degraded health
  result rather than a false healthy result.
- Events are idempotent and carry source identity, observed time and schema
  version.
- `npm run typecheck`, `npm run lint` and `npm run test` pass.

## F1 — Three-source collection boundary

### Objective

Prove that the same canonical pipeline can accept an official national source,
the existing international source and a difficult source without coupling the
domain to a vendor.

### Source order

1. eBay — official Browse API adapter, already implemented and kept as the
   reference adapter.
2. Mercado Livre — official BR API/OAuth adapter, introduced only after its
   limits, permissions and response contract are documented.
3. Xianyu — connector boundary with source discovery and explicit degraded
   modes; use structured endpoints when legitimate and available, then the
   approved lower layers from the collection strategy.

The Xianyu discovery result is recorded in
`docs/xianyu-source-discovery.md`; no public catalog-search API is assumed
until an authorized contract is confirmed.

### Deliverables

- Connector manifests declaring primary source layer, fallback layers, limits,
  health checks and fixture versions.
- Mercado Livre and Xianyu packages with schemas, mocks/fixtures and no direct
  client-side network calls.
- Collection gateway routing by source and layer, with bounded retries,
  circuit-breaking and the existing `{version, runId}` queue contract.
- Canonical normalization and identity mapping for all three sources.
- Documentation of rate limits, authentication, terms/policy assumptions and
  unresolved source risks before any live enablement.

### Acceptance

- Each connector can be exercised without network access through fixtures.
- A source failure degrades that source and does not corrupt another source's
  run.
- Cross-source identity is evidence-based; equal titles or prices never merge
  listings by themselves.
- No production source is enabled by default.

## F2 — Search Intelligence and identity

### Objective

Expand user intent into a reviewable family of searches with high recall, then
apply strict product identity and deduplication before expensive enrichment.

### Deliverables

- Versioned query-family model for exact terms, aliases, abbreviations, typos,
  local-language terms, variants and safe generic queries.
- Deterministic first implementation; learned terms are stored as observations
  with evidence and never silently become authoritative.
- Cheap screening for category mismatch, bait-price signals and obvious
  duplicates.
- Product Identity Engine combining title, description, category, attributes
  and media evidence with confidence and explicit `NEEDS_HUMAN_REVIEW` support.
- Investigation states from `DISCOVERED` through `HIGH_CONFIDENCE_DEAL`, plus
  `WATCH`, `SCAM_SUSPECTED`, `PRICE_BAIT`, `WRONG_PRODUCT`, `BAD_CONDITION`,
  `OVERPRICED`, `LOW_MARGIN`, `DUPLICATE` and `NEEDS_HUMAN_REVIEW`.

### Acceptance

- Query interpretation remains user-reviewable and versioned.
- Ambiguous evidence lowers confidence and requests investigation; it does not
  automatically classify an item as fraud.
- The pipeline spends detail, media and multimodal cost only after cheap
  screening. Live multimodal analysis remains deferred.

## F3 — Opportunity intelligence

### Objective

Rank candidates using current comparable market data plus historical context,
liquidity and seller pressure.

### Deliverables

- Current-market comparable model with outlier handling and condition,
  version, location, shipping and quantity adjustments.
- Immutable listing snapshots/events for price changes, disappearance,
  reappearance and meaningful description changes.
- Versioned valuation outputs: `Deal Score`, `Trend Score`, `Liquidity Score`,
  `Seller Pressure` and `Risk/Confidence`.
- Opportunity explanation containing evidence, missing information, score
  version and confidence; no score is treated as financial authorization.
- Collection consumer integration that persists a valuation only when the
  project declares a validated `opportunityPolicy`, plus an owner-scoped
  read-only valuation endpoint.
- Deterministic fixtures for under-valued, over-priced, stale, ambiguous and
  contradictory listings.

### Acceptance

- Current comparable prices are primary; historical prices provide context,
  not an automatic valuation override.
- A high-risk or contradictory listing cannot rank as a high-confidence deal
  solely because its price is low.
- Ranking is reproducible for the same inputs and version.
- A clean collection run can persist and retrieve its valuation without
  granting browser clients write access to the valuation table.
- F3 does not send messages, place bids, buy, or execute any financial action.

## Gates and sequencing

1. Baseline the existing repository before each slice: tests, typecheck and
   lint.
2. Complete F0 schema/contracts and migration tests before adding F1 adapters.
3. Complete fixture-based F1 routing before live source credentials or traffic.
4. Complete F2 identity evidence before F3 ranking consumes candidates.
5. Review security and scope at every gate; keep each change set small and
   reversible.

## Deferred

F4 self-healing collectors, F5 auction intelligence, F6 negotiation assistance
and F7 local action/control plane are specified in `docs/post-mvp-roadmap.md`.
