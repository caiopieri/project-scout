# eBay Official API Integration — Project Scout

The MVP integrates only eBay. `MockEbayConnector` remains the safe local default; `EbayApiAdapter` is implemented and is enabled only by explicit server-side configuration. No scraping adapter is active.

```text
CollectionGateway
  ├─ MockEbayConnector              provider=ebay-mock-v1 (default)
  ├─ EbayApiAdapter sandbox         provider=ebay-api-sandbox-v1 (opt-in)
  ├─ EbayApiAdapter production      provider=ebay-api-production-v1 (opt-in)
  └─ ScrapingProvider               future port; no adapter
```

## Authentication

Browse API calls use an OAuth Application access token created by the client-credentials grant:

- Sandbox token endpoint: `POST https://api.sandbox.ebay.com/identity/v1/oauth2/token`.
- Production token endpoint: `POST https://api.ebay.com/identity/v1/oauth2/token`.
- Scope: `https://api.ebay.com/oauth/api_scope`.
- Authorization: HTTP Basic over `client_id:client_secret`; the resulting token is sent only as `Authorization: Bearer ...` to eBay.

Tokens are cached in memory per Worker isolate and client ID until 60 seconds before expiration. This avoids minting a token for every item while keeping credentials and tokens out of KV, PostgreSQL, queue payloads and logs. Because isolate memory is best-effort, multiple isolates can mint independent tokens; monitor the account quota before scaling concurrency.

Official references:

- <https://developer.ebay.com/develop/guides-v2/authorization#the-client-credentials-grant-flow>
- <https://developer.ebay.com/develop/api/buy/browse_api>
- <https://developer.ebay.com/develop/get-started/api-call-limits>

## Search mapping

`EbayApiAdapter.search` calls `GET /buy/browse/v1/item_summary/search` with:

- `q`: brand, model, variant, storage, memory and reviewed additional keywords;
- `filter=buyingOptions:{FIXED_PRICE}` because auctions are outside this MVP;
- `conditionIds:{...}`: `7000` for parts/repair, `3000` for used and the documented refurbished IDs when explicitly selected;
- default condition `7000` when the user did not select a condition;
- `fieldgroups=EXTENDED` for `shortDescription` when available;
- `limit` and numeric `offset` pagination;
- `X-EBAY-C-MARKETPLACE-ID`, default `EBAY_US`.

Before details are fetched, the adapter applies a conservative title gate. It honors
the project's `excludedKeywords` and rejects obvious component-only/accessory titles
such as replacement parts, palmrests, digitizers and empty boxes. It deliberately
keeps repair candidates such as `cracked screen`, `for parts` and `parts only`.
Because Browse does not document a negative-keyword operator for `q`, this gate is
local and the pagination cursor advances by the raw eBay page size. It is not a
substitute for full description/image review.

The maximum-price filter is sent only when the criteria currency equals the marketplace listing currency. A BRL ceiling is not incorrectly applied as USD; currency conversion and estimated landed cost remain future scoring concerns.

Supported configuration in this milestone is deliberately narrow: `EBAY_US` plus EUR marketplaces `EBAY_AT`, `EBAY_DE`, `EBAY_ES`, `EBAY_FR`, `EBAY_IE`, `EBAY_IT` and `EBAY_NL`. Unknown marketplace IDs fail as permanent configuration errors.

## Details and raw contract

For each summary, `fetchDetails` calls `GET /buy/browse/v1/item/{itemId}`. The adapter validates and retains these API fields in the raw payload when present:

- item ID, canonical URL, title, price and currency;
- condition and condition ID;
- description and short description;
- seller username and feedback metadata;
- primary/additional images;
- shipping options;
- localized aspects;
- location and lifecycle dates.

`EbayListingMapper` now normalizes the validated detail record into exact minor-unit money, description, condition, seller feedback, minimum same-currency visible shipping, location, lifecycle, localized specifications, image URL metadata and an initial deterministic Apple product inference. Missing shipping remains explicitly unknown rather than being presented as free.

The complete raw record is canonicalized and stored under `raw/ebay/{external-id}/{sha256}.json` in `RAW_BUCKET`. Image binaries are not downloaded yet; that remains Milestone 8.

## Pagination and quotas

`DefaultCollectionGateway` uses the manifest defaults of one page and at most five detailed candidates for local/mock execution. The Production Worker derives its item and query limits from the explicit `EBAY_BROWSE_BUDGET_PER_RUN`. `EbayApiAdapter` rejects requests after that per-execution budget, so searches, details and HTTP retries share the same ceiling instead of bypassing it. Queue messages receive a fresh connector instance, isolating one execution's budget from another.

Each adapter can emit an optional sanitized `EbayRequestTelemetryEvent` to its
caller. The event identifies only the operation (`search` or `details`), attempt,
status, stable error code, retry-after value and local budget position; it never
contains the URL, token, credentials or response body. `getRequestBudgetSnapshot()`
reports the authoritative calls used/remaining for the instance. Telemetry
callbacks are isolated from connector behavior: an observer exception is ignored.
The manual probe exposes this snapshot for controlled verification.

The Worker applies `EBAY_GLOBAL_REQUESTS_PER_MINUTE` before each Browse request.
The development and isolated production configuration templates use a
conservative value of `2`; this is an operational safety policy, not a claim
about the application's eBay quota. Production requires the
`EBAY_RATE_LIMITER` Durable Object binding and fails closed when it or the
policy is missing. The Durable Object uses SQLite-backed serialized state per
marketplace key, while the existing KV limiter remains available for local and
sandbox execution. KV is not used as the Production atomic reservation.

The published default Browse API quota is 5,000 calls/day for most methods, but the effective quota must be checked for the approved application using eBay Developer Analytics. The per-execution cap is the explicitly configured `EBAY_BROWSE_BUDGET_PER_RUN`; a future global daily token bucket and usage telemetry remain mandatory before normal Production collection is enabled.

## Timeouts, retries and errors

Browse requests have a 10-second timeout and at most three local attempts. Network errors, timeouts, HTTP 408, 429 and 5xx are transient. HTTP 401 invalidates the cached token once before retrying; if it remains unauthorized, it maps to `EBAY_UNAUTHORIZED` and semantic health maps it to `LOGIN_REQUIRED`. Other 4xx responses are permanent; 404 maps to `EBAY_ITEM_NOT_FOUND`.

Retry delays are bounded to two seconds in-process; after local attempts are exhausted, the existing queue policy performs bounded task-level retries. Third-party response text is not persisted or logged. Only sanitized messages and stable internal error codes reach `collection_runs`.

Connector payload, JSON, mapping, pagination and repeated-cursor failures map to
`CONTENT_CHANGED` health. This is an operational signal that the provider
contract or page shape changed; it does not authorize a scraper fallback.

## Configuration and smoke test

The Worker defaults to mock mode. Real calls require all of:

```bash
EBAY_CONNECTOR_MODE=sandbox # or production
EBAY_APP_ID_CLIENT_ID=...
EBAY_CERT_ID_CLIENT_SECRET=...
EBAY_MARKETPLACE_ID=EBAY_US
```

Run `npm run ebay:smoke`. Without explicit mode and credentials it reports `SKIPPED` and performs no network request. With credentials it mints one application token and requests one condition-7000 iPhone result. Never paste credentials or tokens into tickets, chat, logs or documentation.

Sandbox connectivity was live-verified on 2026-07-29. The request authenticated and searched `EBAY_US`, but the Sandbox catalog returned zero items. Production application OAuth/Browse connectivity was verified on 2026-07-29 and rechecked on 2026-08-15; the controlled smoke mapped one `EBAY_US` catalog item. Remote collection remains explicitly in mock mode; the smoke does not validate the complete queue-to-persistence production path.

A later controlled probe queried `MacBook Pro M4 Max` in condition 7000 using exactly six Browse calls (one search plus five details). All five responses were technically valid, but the set included screens, a palmrest, a partial machine and an empty box. This confirms that title-level exclusion of components/accessories is required before expanding collection volume.

For first-time local onboarding, `npm run ebay:setup` opens <https://developer.ebay.com/my/keys>, collects the Client ID and hidden Client Secret in the terminal, updates only the managed eBay keys in ignored `apps/worker/.dev.vars` using an atomic owner-only file and offers the same smoke test. It never reads browser cookies or scrapes the developer portal.

## External account requirements

Before a live smoke test, the owner must provide privately configured values from an active eBay Developer Program application keyset for the selected environment and confirm Buy/Browse API access. Production use must also satisfy eBay Buy API license and application requirements and verify current quotas.

## Deferred fallback

`EBAY_SCRAPING_FALLBACK` is an explicit disabled marker and `ScrapingProvider` remains a domain port only. No HTML fetch, browser automation, selector, proxy or managed scraping vendor is implemented. Missing data from the official contract must first be measured before a fallback is proposed.
