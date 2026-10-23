-- S5: collection runs for any active source, not only eBay, and the first HTML source.
INSERT INTO public.sources (id, name, domain, country, currency, connector_type, status)
VALUES ('00000000-0000-4000-a000-000000000004', 'Swappa', 'swappa.com', 'US', 'USD', 'scraping_provider', 'active')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, domain = EXCLUDED.domain, connector_type = EXCLUDED.connector_type,
  status = EXCLUDED.status, updated_at = NOW();

CREATE OR REPLACE FUNCTION public.request_collection_run(
  p_project_id UUID,
  p_idempotency_key TEXT,
  p_source_id UUID
)
RETURNS SETOF public.collection_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source public.sources%ROWTYPE;
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
  SELECT * INTO v_source FROM public.sources WHERE id = p_source_id AND status = 'active';
  IF v_source.id IS NULL THEN
    RAISE EXCEPTION 'source is not configured or inactive' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
    INSERT INTO public.collection_runs (project_id, source_id, idempotency_key, provider)
    VALUES (p_project_id, v_source.id, p_idempotency_key, v_source.domain)
    ON CONFLICT (project_id, idempotency_key) DO NOTHING
    RETURNING *;
  IF NOT FOUND THEN
    RETURN QUERY SELECT * FROM public.collection_runs
      WHERE project_id = p_project_id AND idempotency_key = p_idempotency_key;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.request_collection_run(UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_collection_run(UUID, TEXT, UUID) TO authenticated;
