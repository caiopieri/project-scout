-- Milestone 7: idempotent, service-role-only textual analysis pipeline.
ALTER TABLE public.analysis_runs
  ADD COLUMN IF NOT EXISTS analysis_type TEXT NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'mock',
  ADD COLUMN IF NOT EXISTS input_hash TEXT,
  ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_kind TEXT,
  ADD COLUMN IF NOT EXISTS error_code TEXT,
  ADD COLUMN IF NOT EXISTS output_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.analysis_runs ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE public.analysis_runs DROP CONSTRAINT IF EXISTS analysis_runs_status_check;
ALTER TABLE public.analysis_runs
  ADD CONSTRAINT analysis_runs_status_check
  CHECK (status IN ('pending', 'running', 'completed', 'failed'));
ALTER TABLE public.analysis_runs
  ADD CONSTRAINT analysis_runs_input_hash_check
  CHECK (input_hash IS NULL OR input_hash ~ '^[a-f0-9]{64}$');
ALTER TABLE public.analysis_runs
  ADD CONSTRAINT analysis_runs_attempt_count_check CHECK (attempt_count >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS analysis_runs_text_idempotency_unique
  ON public.analysis_runs (listing_id, analysis_type, input_hash, prompt_version, model_name)
  WHERE input_hash IS NOT NULL;

ALTER TABLE public.evidence
  ADD COLUMN IF NOT EXISTS analysis_run_id UUID REFERENCES public.analysis_runs(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS evidence_key TEXT,
  ADD COLUMN IF NOT EXISTS component TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS evidence_analysis_key_unique
  ON public.evidence (analysis_run_id, evidence_key)
  WHERE analysis_run_id IS NOT NULL AND evidence_key IS NOT NULL;

ALTER TABLE public.defects
  ADD COLUMN IF NOT EXISTS analysis_run_id UUID REFERENCES public.analysis_runs(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS defect_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS defects_analysis_key_unique
  ON public.defects (analysis_run_id, defect_key)
  WHERE analysis_run_id IS NOT NULL AND defect_key IS NOT NULL;

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
  RETURN QUERY SELECT v_run.id, (v_run.status = 'pending' AND v_run.queued_at IS NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_text_analysis_queued(p_run_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.analysis_runs SET queued_at = COALESCE(queued_at, NOW()), updated_at = NOW()
  WHERE id = p_run_id AND status = 'pending';
$$;

CREATE OR REPLACE FUNCTION public.claim_text_analysis(p_run_id UUID)
RETURNS TABLE(
  analysis_run_id UUID, listing_id UUID, title TEXT, description TEXT,
  condition TEXT, attempt_count INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    UPDATE public.analysis_runs ar SET
      status = 'running', started_at = NOW(), lease_expires_at = NOW() + INTERVAL '5 minutes',
      attempt_count = ar.attempt_count + 1, error = NULL, error_kind = NULL,
      error_code = NULL, updated_at = NOW()
    WHERE ar.id = p_run_id
      AND (ar.status = 'pending' OR (ar.status = 'running' AND ar.lease_expires_at < NOW()))
    RETURNING ar.id, ar.listing_id, ar.attempt_count
  )
  SELECT c.id, l.id, l.title, l.description, l.condition, c.attempt_count
  FROM claimed c JOIN public.listings l ON l.id = c.listing_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_text_analysis(p_run_id UUID, p_result JSONB)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_run public.analysis_runs%ROWTYPE;
  v_item JSONB;
  v_key TEXT;
  v_evidence_id UUID;
  v_defect_id UUID;
BEGIN
  SELECT * INTO v_run FROM public.analysis_runs WHERE id = p_run_id AND status = 'running' FOR UPDATE;
  IF v_run.id IS NULL THEN RAISE EXCEPTION 'analysis run is not claimable' USING ERRCODE = '55000'; END IF;
  IF jsonb_typeof(p_result->'evidences') <> 'array' OR jsonb_typeof(p_result->'defects') <> 'array'
     OR jsonb_array_length(p_result->'evidences') > 50 OR jsonb_array_length(p_result->'defects') > 30 THEN
    RAISE EXCEPTION 'invalid analysis result' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.defects WHERE analysis_run_id = p_run_id;
  DELETE FROM public.evidence WHERE analysis_run_id = p_run_id;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_result->'evidences') LOOP
    INSERT INTO public.evidence (
      listing_id, analysis_run_id, evidence_key, component, evidence_type, assessment_kind,
      source_type, source_reference, claim, status, confidence, explanation, limitations,
      severity, model_name, prompt_version
    ) VALUES (
      v_run.listing_id, p_run_id, v_item->>'key', v_item->>'component', v_item->>'evidenceType',
      v_item->>'assessmentKind', v_item->>'sourceType', v_item->>'sourceReference',
      v_item->>'claim', v_item->>'status', (v_item->>'confidence')::NUMERIC,
      v_item->>'explanation', ARRAY(SELECT jsonb_array_elements_text(v_item->'limitations')),
      v_item->>'severity', p_result->>'model', p_result->>'promptVersion'
    );
  END LOOP;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_result->'defects') LOOP
    INSERT INTO public.defects (
      listing_id, analysis_run_id, defect_key, component, defect_type, status,
      confidence, severity, declared, visible, inferred
    ) VALUES (
      v_run.listing_id, p_run_id, v_item->>'key', v_item->>'component', v_item->>'defectType',
      v_item->>'status', (v_item->>'confidence')::NUMERIC, v_item->>'severity',
      (v_item->>'declared')::BOOLEAN, FALSE, (v_item->>'inferred')::BOOLEAN
    ) RETURNING id INTO v_defect_id;
    FOR v_key IN SELECT jsonb_array_elements_text(v_item->'evidenceKeys') LOOP
      SELECT id INTO v_evidence_id FROM public.evidence
       WHERE analysis_run_id = p_run_id AND evidence_key = v_key;
      IF v_evidence_id IS NULL THEN
        RAISE EXCEPTION 'unknown evidence key' USING ERRCODE = '23503';
      END IF;
      INSERT INTO public.defect_evidence(defect_id, evidence_id)
      VALUES (v_defect_id, v_evidence_id);
    END LOOP;
  END LOOP;

  UPDATE public.analysis_runs SET
    status = 'completed', provider = p_result->>'provider', model_name = p_result->>'model',
    prompt_version = p_result->>'promptVersion',
    tokens_used = COALESCE((p_result->'usage'->>'totalTokens')::INTEGER, 0),
    output_metadata = jsonb_build_object('contradictions', COALESCE(p_result->'contradictions', '[]'::JSONB)),
    completed_at = NOW(), lease_expires_at = NULL, updated_at = NOW()
  WHERE id = p_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.retry_text_analysis(
  p_run_id UUID, p_error TEXT, p_error_kind TEXT, p_error_code TEXT
) RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.analysis_runs SET status = 'pending', queued_at = NULL, lease_expires_at = NULL,
    error = left(p_error, 1000), error_kind = p_error_kind, error_code = p_error_code, updated_at = NOW()
  WHERE id = p_run_id AND status = 'running';
$$;

CREATE OR REPLACE FUNCTION public.fail_text_analysis(
  p_run_id UUID, p_error TEXT, p_error_kind TEXT, p_error_code TEXT
) RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.analysis_runs SET status = 'failed', completed_at = NOW(), lease_expires_at = NULL,
    error = left(p_error, 1000), error_kind = p_error_kind, error_code = p_error_code, updated_at = NOW()
  WHERE id = p_run_id AND status = 'running';
$$;

REVOKE ALL ON FUNCTION public.request_text_analysis(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_text_analysis_queued(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_text_analysis(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_text_analysis(UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retry_text_analysis(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_text_analysis(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_text_analysis(UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_text_analysis_queued(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_text_analysis(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_text_analysis(UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.retry_text_analysis(UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_text_analysis(UUID, TEXT, TEXT, TEXT) TO service_role;
