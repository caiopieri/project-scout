-- Collection-run lifecycle is system-owned. Authenticated users may request and
-- read their own runs, but cannot forge status, attempts or result counters.
REVOKE INSERT, UPDATE, DELETE ON public.collection_runs FROM authenticated;

CREATE OR REPLACE FUNCTION public.request_ebay_collection_run(
  p_project_id UUID,
  p_idempotency_key TEXT
)
RETURNS SETOF public.collection_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  source_id UUID;
BEGIN
  IF p_idempotency_key !~ '^[A-Za-z0-9._:-]{8,128}$' THEN
    RAISE EXCEPTION 'invalid idempotency key' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.research_projects
    WHERE id = p_project_id AND user_id = auth.uid() AND status = 'active'
  ) THEN
    RETURN;
  END IF;
  SELECT id INTO source_id FROM public.sources
  WHERE domain = 'ebay.com' AND status = 'active'
  ORDER BY created_at LIMIT 1;
  IF source_id IS NULL THEN
    RAISE EXCEPTION 'eBay source is not configured' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
    INSERT INTO public.collection_runs (project_id, source_id, idempotency_key, provider)
    VALUES (p_project_id, source_id, p_idempotency_key, 'ebay-mock-v1')
    ON CONFLICT (project_id, idempotency_key) DO NOTHING
    RETURNING *;
  IF NOT FOUND THEN
    RETURN QUERY SELECT * FROM public.collection_runs
      WHERE project_id = p_project_id AND idempotency_key = p_idempotency_key;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_collection_run_queued(p_run_id UUID)
RETURNS SETOF public.collection_runs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.collection_runs AS run
  SET queued_at = COALESCE(run.queued_at, NOW())
  WHERE run.id = p_run_id
    AND run.status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.research_projects project
      WHERE project.id = run.project_id AND project.user_id = auth.uid()
    )
  RETURNING run.*;
$$;

REVOKE ALL ON FUNCTION public.request_ebay_collection_run(UUID, TEXT) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.mark_collection_run_queued(UUID) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.request_ebay_collection_run(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_collection_run_queued(UUID) TO authenticated;

