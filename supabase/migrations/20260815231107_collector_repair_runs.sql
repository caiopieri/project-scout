-- F4.5: internal, service-role-only history of sandbox replay results.
CREATE TABLE IF NOT EXISTS public.collector_repair_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_version TEXT NOT NULL CHECK (proposal_version = 'repair-proposal.v1'),
  proposal_source TEXT NOT NULL CHECK (proposal_source ~ '^[a-z][a-z0-9-]{1,63}$'),
  proposal_provider TEXT NOT NULL CHECK (proposal_provider ~ '^[a-z][a-z0-9-]{1,63}$'),
  status TEXT NOT NULL CHECK (status IN ('COMPLETED', 'ROLLED_BACK')),
  environment TEXT NOT NULL CHECK (environment = 'sandbox'),
  fixture_results JSONB NOT NULL CHECK (jsonb_typeof(fixture_results) = 'array' AND jsonb_array_length(fixture_results) BETWEEN 0 AND 10),
  executed_count INTEGER NOT NULL CHECK (executed_count BETWEEN 0 AND 10),
  passed_count INTEGER NOT NULL CHECK (passed_count BETWEEN 0 AND 10),
  failed_count INTEGER NOT NULL CHECK (failed_count BETWEEN 0 AND 10),
  canary_used NUMERIC NOT NULL CHECK (canary_used BETWEEN 0 AND 25),
  rollback_applied BOOLEAN NOT NULL,
  executable BOOLEAN NOT NULL CHECK (executable IS FALSE),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS collector_repair_runs_source_provider_created_idx
  ON public.collector_repair_runs (proposal_source, proposal_provider, created_at ASC);

REVOKE ALL ON public.collector_repair_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.collector_repair_runs TO service_role;
ALTER TABLE public.collector_repair_runs ENABLE ROW LEVEL SECURITY;
