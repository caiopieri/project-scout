-- F4.3: internal, service-role-only history of safe repair proposals.
CREATE TABLE IF NOT EXISTS public.collector_repair_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL CHECK (version = 'repair-proposal.v1'),
  status TEXT NOT NULL CHECK (status IN ('PROPOSED', 'APPROVED', 'REJECTED', 'ROLLED_BACK')),
  source TEXT NOT NULL CHECK (source ~ '^[a-z][a-z0-9-]{1,63}$'),
  provider TEXT NOT NULL CHECK (provider ~ '^[a-z][a-z0-9-]{1,63}$'),
  failure_class TEXT NOT NULL CHECK (failure_class IN ('parser', 'network', 'auth', 'proxy', 'semantic', 'source')),
  stable_code TEXT NOT NULL CHECK (stable_code ~ '^COLLECTOR_[A-Z0-9_]{2,127}$'),
  change_summary TEXT NOT NULL CHECK (char_length(btrim(change_summary)) BETWEEN 1 AND 1000),
  fixtures JSONB NOT NULL CHECK (jsonb_typeof(fixtures) = 'array' AND jsonb_array_length(fixtures) BETWEEN 1 AND 20),
  canary_percentage NUMERIC NOT NULL CHECK (canary_percentage BETWEEN 0 AND 25),
  max_executions INTEGER NOT NULL CHECK (max_executions BETWEEN 1 AND 10),
  window_seconds INTEGER NOT NULL CHECK (window_seconds BETWEEN 1 AND 3600),
  rollback_conditions JSONB NOT NULL CHECK (
    jsonb_typeof(rollback_conditions) = 'array'
    AND jsonb_array_length(rollback_conditions) BETWEEN 1 AND 20
  ),
  requires_human_approval BOOLEAN NOT NULL CHECK (requires_human_approval IS TRUE),
  executable BOOLEAN NOT NULL CHECK (executable IS FALSE),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS collector_repair_proposals_source_provider_created_idx
  ON public.collector_repair_proposals (source, provider, created_at ASC);

REVOKE ALL ON public.collector_repair_proposals FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.collector_repair_proposals TO service_role;
ALTER TABLE public.collector_repair_proposals ENABLE ROW LEVEL SECURITY;
