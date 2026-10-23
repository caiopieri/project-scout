-- S2: completing a run no longer rewrites its requested provider/model/prompt. With a provider
-- chain the producer differs from the requester, and rewriting broke the idempotency key: the
-- next request created a duplicate run whose completion then violated the unique index.
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

  -- The run keeps the identity it was requested with (its idempotency key). The provider and
  -- model that actually produced the result are recorded separately; evidence rows keep them too.
  UPDATE public.analysis_runs SET
    status = 'completed',
    tokens_used = COALESCE((p_result->'usage'->>'totalTokens')::INTEGER, 0),
    output_metadata = jsonb_build_object(
      'contradictions', COALESCE(p_result->'contradictions', '[]'::JSONB),
      'producedBy', jsonb_build_object(
        'provider', p_result->>'provider',
        'model', p_result->>'model',
        'promptVersion', p_result->>'promptVersion'
      )
    ),
    completed_at = NOW(), lease_expires_at = NULL, updated_at = NOW()
  WHERE id = p_run_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_text_analysis(UUID, JSONB) TO service_role;
