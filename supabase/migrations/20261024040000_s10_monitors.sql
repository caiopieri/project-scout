-- S10: monitors and alerts. Users own their monitors and alerts (RLS); evaluation and the
-- collections it asks for run with the service role, deriving the owner from the monitor row.
CREATE TABLE IF NOT EXISTS public.monitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('search', 'listing')),
  project_id UUID REFERENCES public.research_projects(id) ON DELETE CASCADE,
  listing_id UUID REFERENCES public.listings(id) ON DELETE CASCADE,
  source_id UUID REFERENCES public.sources(id) ON DELETE SET NULL,
  cutoff JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(cutoff) = 'object'),
  baseline JSONB,
  cadence_minutes INTEGER NOT NULL CHECK (cadence_minutes BETWEEN 60 AND 10080),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_run_at TIMESTAMPTZ,
  last_collection_run_id UUID REFERENCES public.collection_runs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (kind = 'search' AND project_id IS NOT NULL AND listing_id IS NULL)
    OR (kind = 'listing' AND listing_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS monitors_one_search_per_project
  ON public.monitors (user_id, project_id) WHERE kind = 'search' AND active;
CREATE UNIQUE INDEX IF NOT EXISTS monitors_one_per_listing
  ON public.monitors (user_id, listing_id) WHERE kind = 'listing' AND active;
CREATE INDEX IF NOT EXISTS monitors_due_idx ON public.monitors (next_run_at) WHERE active;

CREATE TABLE IF NOT EXISTS public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  monitor_id UUID NOT NULL REFERENCES public.monitors(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('NEW_OPPORTUNITY', 'PRICE_DROP', 'ENDED', 'GONE')),
  dedupe_key TEXT NOT NULL CHECK (char_length(dedupe_key) BETWEEN 1 AND 200),
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  UNIQUE (monitor_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS alerts_user_unread_idx ON public.alerts (user_id, created_at DESC) WHERE read_at IS NULL;

ALTER TABLE public.monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY monitors_owner_read ON public.monitors FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY monitors_owner_insert ON public.monitors FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (project_id IS NULL OR EXISTS (
      SELECT 1 FROM public.research_projects project
      WHERE project.id = project_id AND project.user_id = auth.uid()
    ))
  );
CREATE POLICY monitors_owner_update ON public.monitors FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY alerts_owner_read ON public.alerts FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY alerts_owner_mark_read ON public.alerts FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT ON public.monitors TO authenticated;
GRANT UPDATE (active, cutoff, cadence_minutes, updated_at) ON public.monitors TO authenticated;
GRANT SELECT ON public.alerts TO authenticated;
GRANT UPDATE (read_at) ON public.alerts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.monitors, public.alerts TO service_role;

-- Claims due monitors atomically and pushes their next run forward, so concurrent cron ticks
-- never evaluate the same monitor twice.
CREATE OR REPLACE FUNCTION public.claim_due_monitors(p_limit INTEGER)
RETURNS SETOF public.monitors
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.monitors AS monitor
  SET last_run_at = NOW(),
      next_run_at = NOW() + make_interval(mins => monitor.cadence_minutes),
      updated_at = NOW()
  WHERE monitor.id IN (
    SELECT id FROM public.monitors
    WHERE active AND next_run_at <= NOW()
    ORDER BY next_run_at
    LIMIT LEAST(GREATEST(p_limit, 1), 50)
    FOR UPDATE SKIP LOCKED
  )
  RETURNING monitor.*;
$$;

-- Requests a collection on behalf of a monitor's owner: the project must be active and owned by
-- the monitor's user, and the source active. Idempotent per key, like the user-facing request.
CREATE OR REPLACE FUNCTION public.request_monitor_collection_run(
  p_monitor_id UUID, p_idempotency_key TEXT
)
RETURNS SETOF public.collection_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_monitor public.monitors%ROWTYPE;
  v_source public.sources%ROWTYPE;
BEGIN
  IF p_idempotency_key !~ '^[A-Za-z0-9._:-]{8,128}$' THEN
    RAISE EXCEPTION 'invalid idempotency key' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_monitor FROM public.monitors WHERE id = p_monitor_id AND active;
  IF v_monitor.id IS NULL OR v_monitor.project_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.research_projects
    WHERE id = v_monitor.project_id AND user_id = v_monitor.user_id AND status = 'active'
  ) THEN
    RETURN;
  END IF;
  SELECT * INTO v_source FROM public.sources
  WHERE id = COALESCE(
    v_monitor.source_id,
    (SELECT source_id FROM public.listings WHERE id = v_monitor.listing_id),
    '00000000-0000-4000-a000-000000000001'::UUID
  ) AND status = 'active';
  IF v_source.id IS NULL THEN
    RAISE EXCEPTION 'source is not configured or inactive' USING ERRCODE = 'P0002';
  END IF;
  RETURN QUERY
    INSERT INTO public.collection_runs (project_id, source_id, idempotency_key, provider)
    VALUES (v_monitor.project_id, v_source.id, p_idempotency_key, v_source.domain)
    ON CONFLICT (project_id, idempotency_key) DO NOTHING
    RETURNING *;
  IF NOT FOUND THEN
    RETURN QUERY SELECT * FROM public.collection_runs
      WHERE project_id = v_monitor.project_id AND idempotency_key = p_idempotency_key;
  END IF;
  UPDATE public.monitors SET last_collection_run_id = (
    SELECT id FROM public.collection_runs
    WHERE project_id = v_monitor.project_id AND idempotency_key = p_idempotency_key
  ) WHERE id = p_monitor_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_monitor_collection_queued(p_run_id UUID)
RETURNS SETOF public.collection_runs
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.collection_runs SET queued_at = COALESCE(queued_at, NOW())
  WHERE id = p_run_id AND status = 'pending'
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION public.claim_due_monitors(INTEGER),
  public.request_monitor_collection_run(UUID, TEXT),
  public.mark_monitor_collection_queued(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_monitors(INTEGER),
  public.request_monitor_collection_run(UUID, TEXT),
  public.mark_monitor_collection_queued(UUID) TO service_role;
