# Local Environment Setup Guide — Project Scout

This document provides step-by-step instructions to configure and run the Project Scout local development environment.

---

## 1. Prerequisites

Before starting, ensure the following tools are installed on your machine:

- **Node.js**: `v20.x` or later (LTS version recommended).
- **npm**: `v10.x` or later (comes with Node.js).
- **Docker Desktop**: Required to run the local Supabase PostgreSQL container instance. Ensure Docker daemon is running before executing `npm run db:start`.
- **Cloudflare Wrangler CLI**: Installed as the Worker workspace dev dependency; use `npx wrangler` from the repository.
- **Supabase CLI**: Runs locally via `npx supabase`.

---

## 2. Environment Configurations

Do not commit actual credential secrets to the git repository. Template configurations are provided in [.env.example](file:///Users/caioamaraldepieri/Projetos/Sistema%20de%20Pesquisa/.env.example) located in the root of the project.

### 2.1 Next.js Frontend Configuration (`.env.local`)

Create a file named `.env.local` in the root of the project or inside `apps/web/.env.local`:

```bash
# Supabase Credentials (Public API access)
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_placeholder

# Project Scout API URL (Points to local Cloudflare Worker)
NEXT_PUBLIC_API_URL=http://localhost:8787
```

### 2.2 Cloudflare Workers API Configuration (`apps/worker/.dev.vars`)

Create a `.dev.vars` file under `apps/worker`. Marco 4 adds the local service-role key for the queue consumer:

> [!CAUTION]
> The project CRUD flow deliberately does not load `SUPABASE_SERVICE_ROLE_KEY`. The Worker validates and forwards the authenticated user's JWT so RLS applies. A service-role key is reserved for later trusted background ingestion and must never reach user routes or the browser.

```bash
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=your_local_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_local_service_role_key
WEB_ORIGIN=http://localhost:3000
EBAY_CONNECTOR_MODE=mock
EBAY_MARKETPLACE_ID=EBAY_US
TEXT_ANALYZER_MODE=deterministic
GEMINI_MODEL=gemini-2.5-flash
# Required when mode is sandbox or production. Choose the value only after
# checking the approved application's effective Browse quota:
EBAY_BROWSE_BUDGET_PER_RUN=103
# Production also requires the atomic Durable Object binding and this policy:
EBAY_GLOBAL_REQUESTS_PER_MINUTE=2
# Required only when mode is sandbox or production:
EBAY_APP_ID_CLIENT_ID=your_environment_specific_client_id
EBAY_CERT_ID_CLIENT_SECRET=your_environment_specific_client_secret
```

After `npm run db:start`, obtain local Supabase values with `npx supabase status -o env`. Local `.env.local` and `.dev.vars` files are gitignored. Service-role and eBay secrets stay only in `apps/worker/.dev.vars` or Wrangler secrets and must never use a `NEXT_PUBLIC_` name. No eBay credentials are needed in mock mode.

Mercado Livre remains unavailable unless `ML_CONNECTOR_MODE=production` and
either the server-only `ML_ACCESS_TOKEN` or the complete trio
`ML_CLIENT_ID`/`ML_CLIENT_SECRET`/`ML_REFRESH_TOKEN` are configured. With the
refresh trio, the adapter obtains a new access token on startup and refreshes it
once after `401` only, coalescing concurrent refreshes. A `403` policy denial
does not consume the refresh token. It does not perform a browser login or
expose credentials to the frontend. Keep all
values in `apps/worker/.dev.vars` or Wrangler secrets.

Even with a valid token, live Mercado Livre search remains a separate external
gate: the current account/API path returned `403` policy denials during smoke
testing. The adapter reports this as `ML_POLICY_UNAUTHORIZED` and does not
rotate the refresh token.

To obtain the first Mercado Livre token pair locally, run `npm run ml:setup`.
The setup opens the official authorization URL, uses the exact registered
redirect `https://eletrofy.com.br/oauth/mercadolivre/callback`, validates the
returned `state`, exchanges the authorization code server-side from the CLI,
and atomically writes the access/refresh tokens to the ignored
`apps/worker/.dev.vars` file with mode `0600`. The public callback displays no
token; paste its full URL only into the local terminal prompt. The redirect
page must be deployed with the web app before using the production domain.

The existing local `.dev.vars` from Marco 3 must be updated manually with `SUPABASE_SERVICE_ROLE_KEY` before exercising the real local queue consumer. Do not paste the value into logs or documentation.

### 2.3 eBay Developer account

Live validation requires an active eBay Developer Program account and an application keyset for the exact target environment:

1. obtain Sandbox or Production App ID (Client ID) and Cert ID (Client Secret);
2. confirm the keyset has Buy/Browse API access and the base `https://api.ebay.com/oauth/api_scope` scope;
3. set `EBAY_CONNECTOR_MODE=sandbox` or `production` and use credentials from that same environment;
4. keep `EBAY_MARKETPLACE_ID=EBAY_US` for the initial MVP validation;
5. verify effective Browse/OAuth quotas in the eBay developer dashboard before increasing volume.
6. set `EBAY_BROWSE_BUDGET_PER_RUN` explicitly in the Worker environment. A value
   of `103` is the minimum starting point for targeting 100 detailed records
   when the run uses three query-family searches; the runtime remains capped by
   the configured value and fails closed when it is absent or invalid.

Sandbox and Production credentials are not interchangeable. Never commit, print or send either secret or an application access token to the browser.

---

## 3. Step-by-Step Installation & Database Execution

### Step 3.1: Install Dependencies

Run npm install in the root folder to download all required packages:

```bash
npm install
```

### Step 3.2: Database Management Commands (Supabase CLI)

Ensure Docker Desktop is open and running on your machine, then execute:

```bash
# Start local Supabase PostgreSQL containers
npm run db:start   # executes: npx supabase start

# Apply local SQL migrations located in supabase/migrations/
npm run db:migrate # executes: npx supabase migration up --local

# Reset database and insert seed fixtures from supabase/seed.sql (Destructive local operation!)
npm run db:reset   # executes: npx supabase db reset --local

# Insert seed data into local database (executes local db reset with seed.sql)
npm run db:seed    # executes: npx supabase db reset --local

# Run database unit and live integration suites, including textual analysis RLS/idempotency
npm run db:test

# Stop local Supabase PostgreSQL containers
npm run db:stop    # executes: npx supabase stop
```

### Step 3.3: Run the Edge API Gateway (Cloudflare Worker)

Start the Wrangler local dev server from the repository root:

```bash
npm run dev --prefix apps/worker
```

The Worker API will boot and listen on `http://localhost:8787`.

To request an asynchronous collection using the configured connector mode, authenticate first and send an 8–128 character retry-stable key:

```bash
curl -X POST http://localhost:8787/api/projects/PROJECT_UUID/collection-runs \
  -H "Authorization: Bearer USER_ACCESS_TOKEN" \
  -H "Idempotency-Key: iphone13-first-collection"
```

Reusing the same key returns the same run. Inspect it with `GET /api/projects/PROJECT_UUID/collection-runs/RUN_UUID`.

With the top-level local Wrangler configuration, normalized listing IDs are published to
`analysis-queue` as minimal run-ID messages and consumed by the same Worker. Use
Use `TEXT_ANALYZER_MODE=deterministic` for normal local development, `mock` for explicit fixtures, or `gemini` only with the server-side `GEMINI_API_KEY`. The Gemini mode uses structured JSON output and never exposes the key to the browser. Keep the deterministic mode as the default until live privacy and quota review is complete.
No Gemini key is accepted or required in Marco 7. Inspect `analysis_runs`, `evidence`, `defects` and
`defect_evidence` in local Supabase Studio after a completed collection.

### Step 3.4: Validate the eBay adapter

For first-time local configuration, run:

```bash
npm run ebay:setup
```

The interactive assistant opens the official Application Keys page, asks for Sandbox or Production, reads the Client Secret without terminal echo, preserves unrelated `.dev.vars` values, writes the managed eBay values atomically with owner-only `0600` permissions and offers one connection test. It refuses to write if `.dev.vars` is not gitignored or is a symbolic link.

The standalone credential-aware smoke command is safe by default:

```bash
npm run ebay:smoke
```

With mock mode or missing credentials it prints `SKIPPED` and sends no eBay request. The command reads the three eBay values from the ignored `apps/worker/.dev.vars` created by setup; explicitly exported shell variables take precedence. A successful smoke reports only provider, marketplace and item count; it never prints a token or response body.

The setup is local only. It does not upload secrets to Cloudflare; remote provisioning, when explicitly approved, must use `wrangler secret put` separately.

### Step 3.4: eBay Production privacy webhook

The dedicated HTTPS endpoint is deployed and validated. Local values belong only in ignored
`apps/worker/.dev.vars`; remote values use Wrangler secrets. Required names:

```text
EBAY_NOTIFICATION_ENVIRONMENT=production
EBAY_ACCOUNT_DELETION_ENDPOINT_URL=https://<worker-domain>/webhooks/ebay/account-deletion
EBAY_DELETION_VERIFICATION_TOKEN=<32-80 allowed characters>
EBAY_APP_ID_CLIENT_ID=<production App ID>
EBAY_CERT_ID_CLIENT_SECRET=<production Cert ID>
SUPABASE_SERVICE_ROLE_KEY=<server-only remote key>
EBAY_IDENTITY_HASH_SECRET=<stable random secret with at least 32 characters>
```

The remote Worker also requires `EBAY_DELETION_QUEUE`, `RAW_BUCKET` and `IMAGE_BUCKET`. Follow
[ebay-account-deletion.md](./ebay-account-deletion.md); do not register a challenge-only endpoint
until the queue, database migration and storage bindings can actually complete a POST deletion.

### Step 3.4.1: Local R2 bindings

Wrangler defines two local R2 bindings: `RAW_BUCKET` for canonical raw listing JSON and `IMAGE_BUCKET` for future image binaries. Marco 6 writes only `RAW_BUCKET`; image URLs remain PostgreSQL metadata. These local bindings do not provision remote buckets. Remote bucket creation and access policies require a separate approved deployment task.

### Step 3.4.2: Current remote privacy environment

The approved Marco 6.1 deployment uses the Wrangler `production` environment and isolated
`-prod` Queue, R2 and KV resources. Its public base URL is:

```text
https://project-scout-worker-production.caioamaralpieri.workers.dev
```

The remote Supabase project is `project-scout` in `sa-east-1`. Apply only versioned migrations;
never apply `supabase/seed.sql` remotely because it contains fixture users, projects and listings.
Server-only values are configured with commands such as:

```bash
npx wrangler secret put SECRET_NAME --cwd apps/worker --env production
npx wrangler deploy --cwd apps/worker --env production --dry-run
npx wrangler deploy --cwd apps/worker --env production
```

`PUBLIC_API_ENABLED=false` keeps `/api/*` unavailable on this public deployment. `/health` and
`/webhooks/ebay/account-deletion` remain active. Do not enable the project API until rate limiting
and the exact frontend origin have passed security review.

The GET challenge, signed POST delivery, deletion queue consumption and remote database completion
were verified through the eBay portal on 2026-07-29. Production application OAuth/Browse search was
also verified separately. `EBAY_CONNECTOR_MODE` remains `mock`: these validations do not authorize
turning on remote collection or user-facing APIs.

Marco 7 is not deployed in that production environment: the Wrangler configuration now declares
the isolated production analysis producer, consumer and DLQ, but the remote queues, migration and
consumer deployment still need a separate reviewed deployment task. That task requires the
Cloudflare account credential and the approved provider configuration; no queue payload contains
listing text or credentials.

The internal `/internal/ebay/probe` route is fail-closed and returns `404` unless the optional
`EBAY_PROBE_TOKEN` secret contains exactly 64 lowercase hexadecimal characters. It is only for an
approved, bounded operational test, never for frontend use. A probe performs at most one search and
five detail requests, persists nothing, and the secret must be deleted immediately after use. The
2026-07-29 Production test for `MacBook Pro M4 Max` completed within all six Browse calls; the secret
was removed and the route was rechecked as `404` afterward.

### Step 3.5: Run the Next.js Frontend

In a second terminal, start Next.js:

```bash
npm run dev --prefix apps/web
```

The client dashboard will open on `http://localhost:3000`.

Create a local account on the sign-in screen. The Worker creates the matching `profiles` row on the first authenticated API request. Inspect projects at `http://localhost:54323` in Supabase Studio.
