-- S9: self-heal. Canaries keep the page they saw, selector maps are versioned data with exactly
-- one active version per source, and every repair proposal records its evidence, sandbox replay,
-- canary measurement and who decided.
ALTER TABLE public.canary_runs
  ADD COLUMN IF NOT EXISTS raw_sha256 TEXT CHECK (raw_sha256 ~ '^[a-f0-9]{64}$');

CREATE TABLE IF NOT EXISTS public.connector_selector_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  selectors JSONB NOT NULL CHECK (jsonb_typeof(selectors) = 'object'),
  status TEXT NOT NULL CHECK (status IN ('active', 'retired')),
  proposal_id UUID,
  activated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS connector_selector_versions_one_active
  ON public.connector_selector_versions (source_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.heal_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID REFERENCES public.incidents(id) ON DELETE SET NULL,
  source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  failure_class TEXT NOT NULL
    CHECK (failure_class IN ('source_block', 'network', 'auth', 'parser', 'semantic', 'unknown')),
  evidence JSONB NOT NULL DEFAULT '{}'::JSONB,
  report TEXT NOT NULL,
  base_selectors JSONB,
  proposed_selectors JSONB,
  patch TEXT,
  proposer TEXT,
  baseline_sha256 TEXT CHECK (baseline_sha256 ~ '^[a-f0-9]{64}$'),
  broken_sha256 TEXT CHECK (broken_sha256 ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL DEFAULT 'diagnosed' CHECK (status IN (
    'diagnosed', 'no_fix', 'sandbox_passed', 'sandbox_failed', 'canary_passed', 'canary_failed',
    'applied', 'rolled_back', 'rejected'
  )),
  sandbox JSONB,
  canary JSONB,
  autonomous BOOLEAN NOT NULL DEFAULT FALSE,
  decided_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS heal_proposals_source_idx ON public.heal_proposals (source_id, created_at DESC);

ALTER TABLE public.connector_selector_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.heal_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY connector_selector_versions_read ON public.connector_selector_versions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY heal_proposals_read ON public.heal_proposals FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.connector_selector_versions, public.heal_proposals TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.connector_selector_versions, public.heal_proposals TO service_role;

-- Retires the active map and activates a new version in one transaction; used both to apply a
-- proposal and to roll back (by activating the previous selectors again as a new version).
CREATE OR REPLACE FUNCTION public.activate_selector_version(
  p_source_id UUID, p_selectors JSONB, p_proposal_id UUID, p_actor TEXT
)
RETURNS public.connector_selector_versions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_next INTEGER;
  v_row public.connector_selector_versions%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('selector:' || p_source_id::TEXT));
  UPDATE public.connector_selector_versions SET status = 'retired'
  WHERE source_id = p_source_id AND status = 'active';
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next
  FROM public.connector_selector_versions WHERE source_id = p_source_id;
  INSERT INTO public.connector_selector_versions (source_id, version, selectors, status, proposal_id, activated_by)
  VALUES (p_source_id, v_next, p_selectors, 'active', p_proposal_id, p_actor)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_selector_version(UUID, JSONB, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_selector_version(UUID, JSONB, UUID, TEXT) TO service_role;
