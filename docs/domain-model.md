# Domain Model & Entity Specification — Project Scout

This document specifies the core domain entities, schemas, and relational database structures for **Project Scout**.

---

## 1. Domain Entities & Schemas

### 1.0 Research Project (`ResearchProject`)

A user-owned research definition. Its original wording and structured interpretation are separate fields.

- **`id` / `userId`**: Internal project UUID and authenticated owner UUID.
- **`name` / `description`**: User-facing project metadata.
- **`naturalLanguageQuery`**: Original user wording; never replaced as a side effect of interpretation.
- **`structuredQuery`**: Validated `ResearchCriteria` JSON, documented in `search-criteria.md`.
- **`interpretation`**: Confidence, ambiguities, warnings, unidentified fields, provider/model, rule version, taxonomy version and timestamp.
- **`status`**: `draft | active | archived | deleted`.
- **`deletedAt`**: Set only by logical deletion.
- **`createdAt` / `updatedAt`**: Timezone-aware lifecycle timestamps.

`ResearchProjectRepository` exposes `create`, `findById`, `findByUserId`, `update`, `archive`, `restore` and `softDelete`. Domain ports have no Supabase, Cloudflare or AI-provider dependency.

### 1.1 Listing Entity (`Listing`)

Represents an ingested marketplace listing entry.

- **`id`**: `UUID` (Primary Key).
- **`sourceId`**: `UUID` (Foreign Key referencing `sources.id`).
- **`externalId`**: `string` (External marketplace item identifier, e.g. eBay item ID `v1|123456789|0`).
- **`url`**: `string` (Canonical URL).
- **`title`**: `string`.
- **`description`**: `string` (HTML or plain text listing description).
- **`condition`**: `string` (Condition description or ID, e.g., eBay ID 7000).
- **`currency`**: `string` (3-letter ISO currency code, default `'USD'`).
- **`price`**: `number` (Price in listing currency, non-negative `NUMERIC(12, 2)`).
- **`shippingCost`**: `number` (Shipping cost in listing currency, non-negative `NUMERIC(12, 2)`).
- **`totalVisibleCost`**: `number` (`price + shippingCost`).
- **`sellerId`**: `UUID` (Optional Foreign Key referencing `sellers.id`).
- **`location`**: `string` (Seller item location).
- **`status`**: `'active' | 'completed' | 'out_of_stock'`.
- **`publishedAt`**: `Date` (Optional item creation timestamp).
- **`firstCollectedAt`**: `Date`.
- **`lastUpdatedAt`**: `Date`.
- **`specifications`**: `Record<string, string>` (Extracted item specifics key-value pairs).
- **`images`**: `ListingImage[]`.
- **`inferredProduct`**: `InferredProduct | null`.
- **`rawDataPath`**: `string` (Storage path or R2 object key for raw JSON payload).
- **`rawContentHash`**: `string` (Optional SHA-256 hash of the raw payload for audit and deduplication).
- **`rawSchemaVersion`**: `string` (Payload version identifier, e.g., `'1.0'`).
- **`rawDataMetadata`**: `JsonObject` (Payload metadata summary).

Milestone 6 introduces `NormalizedListingInput` as the ingestion DTO. Price and shipping remain integer minor units until the PostgreSQL adapter converts them to `NUMERIC(12, 2)`. `shippingCostMinor=null` means shipping was not visible; `totalVisibleCostMinor` then contains only the visible item price and metadata records `shippingCostKnown=false`.

`(sourceId, externalId)` defines identity. `rawContentHash` is a canonical SHA-256 change detector, not a cross-listing identity. Equal hashes produce no duplicate snapshot; changed hashes preserve a new snapshot. Different external IDs are never merged automatically.

`EbayListingMapper` deterministically extracts seller feedback, localized aspects, image URL metadata, item lifecycle and an initial Apple product inference. It performs no textual defect analysis and creates no AI evidence.

### 1.0.0.1 Cross-source identity comparison

`CrossSourceIdentityComparator` produces an auditable recommendation for a pair
of listings without changing either listing or source identity. A
`MATCH_CANDIDATE` requires distinct sources, two `MATCHED` product identities,
equal canonical keys, and corroborating structured brand/model attributes. If
optional attributes are missing, the result is `REVIEW`; conflicts in brand,
model, variant, storage or memory produce `NO_MATCH`. Unresolved identities
produce `INSUFFICIENT_EVIDENCE`.

The result always carries evidence, confidence and `mergeEligible=false`.
Titles, prices, media presence and equal raw hashes are not sufficient by
themselves to authorize a cross-source merge. Persisting or exposing these
recommendations is handled by `cross_source_identity_candidates`: only
`MATCH_CANDIDATE` and `REVIEW` results are stored, with an owner-scoped review
status. Accepting one records human review but does not modify canonical listing
identity or authorize a merge.

### 1.0.1 Collection Run (`CollectionRun`)

An owner-visible, system-managed attempt to collect eBay candidates for one active project.

- **Identity**: internal UUID plus a caller-supplied idempotency key unique within the project.
- **Lifecycle**: `pending → running → completed | failed`; a transient failure may return `running → pending` before the bounded retry.
- **Execution metadata**: queued/start/finish timestamps, five-minute claim lease and attempt count.
- **Counters**: items found is populated by Marco 4; created/updated remain zero until normalization and persistence in Marco 6.
- **Failure metadata**: sanitized message, stable error code and `transient | permanent` kind.
- **Provider**: `ebay-mock-v1` by default; `ebay-api-sandbox-v1` or `ebay-api-production-v1` after a configured Marco 5 consumer claims the run. The consumer updates provider metadata before collection and completion.

`CollectionRunRepository` owns request/find/queue/claim/provider/complete/retry/fail transitions. `SourceConnector` exposes paginated raw search and detail lookup; `CollectionGateway` orchestrates those calls without depending on Cloudflare, PostgreSQL or eBay HTTP details. Marco 6 adds vendor-neutral `ListingMapper`, `RawListingObjectStore`, `ListingIngestionRepository` and `CollectionResultIngestor` ports, with eBay, R2 and Supabase adapters at the boundaries.

### 1.0.2 Text Analysis Run (`AnalysisRun`)

A system-owned analysis of one immutable textual input hash. Lifecycle is `pending → running → completed | failed`; transient failures may return to `pending`. Identity is unique by listing, `analysisType=text`, SHA-256 input hash, model and prompt version. It records provider, model, prompt/rule version, queued/start/completion timestamps, lease, attempt count, token usage, sanitized error metadata and contradiction metadata.

`TextAnalyzer` accepts only bounded listing UUID/title/description/condition and returns strict evidence, defect and contradiction JSON. `TextAnalysisRunRepository` owns request, queue marker, claim, complete, retry and fail transitions. Cloudflare and Supabase remain adapters outside the domain.

---

### 1.2 Defect Entity (`Defect`)

Represents an identified functional, cosmetic, or structural flaw in a listing.

- **`id`**: `UUID` (Primary Key).
- **`listingId`**: `UUID` (Foreign Key referencing `listings.id`).
- **`analysisRunId` / `defectKey`**: Versioned run association and result-local idempotency key for Marco 7 records.
- **`component`**: `string` (Affected part, e.g., `'screen'`, `'battery'`, `'logic_board'`).
- **`defectType`**: `string` (Flaw classification, e.g., `'cracked_glass'`, `'water_damage'`).
- **`status`**: `'declared' | 'visible' | 'inferred' | 'unknown'`.
- **`confidence`**: `number` (0.0 to 1.0).
- **`severity`**: `'low' | 'medium' | 'high' | 'critical'`.
- **`declared`**: `boolean`.
- **`visible`**: `boolean`.
- **`inferred`**: `boolean`.
- **`estimatedRepairCost`**: `number` (Estimated repair cost in BRL, `NUMERIC(12, 2)`).
- **`repairCostCurrency`**: `string` (Default `'BRL'`).
- **`evidenceIds`**: `string[]` (Transient write DTO property used during ingestion; **not persisted as an array column in PostgreSQL**. The `defect_evidence` relational junction table is the canonical source of truth for linking defects to evidence).

---

### 1.3 Listing Score Entity (`ListingScore`)

Calculated opportunity rating for technical buyers.

- **`id`**: `UUID` (Primary Key).
- **`listingId`**: `UUID` (Foreign Key referencing `listings.id`).
- **`analysisRunId`**: `UUID` (Optional Foreign Key referencing `analysis_runs.id` to track scoring history over time).
- **`queryMatchScore`**: `number` (0 to 100).
- **`technicalRiskScore`**: `number` (0 to 100).
- **`fraudRiskScore`**: `number` (0 to 100).
- **`evidenceQualityScore`**: `number` (0 to 100).
- **`priceScore`**: `number` (0 to 100).
- **`opportunityScore`**: `number` (0 to 100 parametric overall score).
- **`scoreFactors`**: `ScoreFactors` (`positive`, `negative`, `missing`, `contradictions`).
- **`formulaVersion`**: `string` (Default `'1.0.0'`).
- **`explanation`**: `string` (Human-readable markdown summary explaining score rationale).
