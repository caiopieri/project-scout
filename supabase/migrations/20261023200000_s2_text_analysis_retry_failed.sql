-- S2: an explicit analysis request reopens a failed run for the same input, prompt and model.
-- Without this, a provider outage turned every affected listing into a permanent failure that
-- no user action could retry. Completed and in-flight runs are never touched.
CREATE OR REPLACE FUNCTION public.request_text_analysis(
  p_listing_id UUID,
  p_provider TEXT,
  p_model TEXT,
  p_prompt_version TEXT
)
RETURNS TABLE(analysis_run_id UUID, should_queue BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hash TEXT;
  v_run public.analysis_runs%ROWTYPE;
BEGIN
  SELECT encode(extensions.digest(concat_ws(E'\x1f', title, description, condition), 'sha256'), 'hex')
    INTO v_hash FROM public.listings WHERE id = p_listing_id;
  IF v_hash IS NULL THEN
    RAISE EXCEPTION 'listing not found' USING ERRCODE = 'P0002';
  END IF;
  IF COALESCE(p_provider, '') = '' OR COALESCE(p_model, '') = ''
     OR COALESCE(p_prompt_version, '') = '' THEN
    RAISE EXCEPTION 'invalid analysis configuration' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.analysis_runs (
    listing_id, analysis_type, provider, model_name, prompt_version, input_hash, status
  ) VALUES (
    p_listing_id, 'text', p_provider, p_model, p_prompt_version, v_hash, 'pending'
  )
  ON CONFLICT (listing_id, analysis_type, input_hash, prompt_version, model_name)
    WHERE input_hash IS NOT NULL DO NOTHING;

  SELECT * INTO v_run FROM public.analysis_runs
   WHERE listing_id = p_listing_id AND analysis_type = 'text'
     AND input_hash = v_hash AND prompt_version = p_prompt_version AND model_name = p_model
   FOR UPDATE;

  IF v_run.status = 'failed' THEN
    UPDATE public.analysis_runs SET
      status = 'pending', queued_at = NULL, started_at = NULL, completed_at = NULL,
      lease_expires_at = NULL, attempt_count = 0, error = NULL, error_kind = NULL,
      error_code = NULL, updated_at = NOW()
    WHERE id = v_run.id
    RETURNING * INTO v_run;
  END IF;

  RETURN QUERY SELECT v_run.id, (v_run.status = 'pending' AND v_run.queued_at IS NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_text_analysis(UUID, TEXT, TEXT, TEXT) TO service_role;
