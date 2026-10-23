-- S8: resilience without AI. A circuit per source, canary probes, an error budget that opens
-- incidents by itself, DLQ incidents and an audit trail of maintenance actions.
CREATE TABLE IF NOT EXISTS public.source_circuits (
  source_id UUID PRIMARY KEY REFERENCES public.sources(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'closed' CHECK (state IN ('closed', 'open', 'half_open')),
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  opened_at TIMESTAMPTZ,
  reopen_after TIMESTAMPTZ,
  -- Half-open lets exactly one probe through; a stale probe (lost worker) is retried after 15 min.
  probe_started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES public.sources(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('SOURCE_BLOCKED', 'ERROR_BUDGET', 'CANARY_FAILED', 'DLQ_MESSAGE')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  evidence JSONB NOT NULL DEFAULT '{}'::JSONB,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS incidents_one_open_per_kind
  ON public.incidents (source_id, kind) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS public.canary_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  ok BOOLEAN NOT NULL,
  items INTEGER NOT NULL DEFAULT 0,
  expected_min_items INTEGER NOT NULL,
  error_code TEXT,
  latency_ms INTEGER NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS canary_runs_source_idx ON public.canary_runs (source_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS public.ops_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  source_id UUID REFERENCES public.sources(id) ON DELETE SET NULL,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.source_circuits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canary_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY source_circuits_read ON public.source_circuits FOR SELECT TO authenticated USING (true);
CREATE POLICY incidents_read ON public.incidents FOR SELECT TO authenticated USING (true);
CREATE POLICY canary_runs_read ON public.canary_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY ops_audit_read ON public.ops_audit FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.source_circuits, public.incidents, public.canary_runs, public.ops_audit TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.source_circuits, public.incidents, public.canary_runs, public.ops_audit TO service_role;

-- Policy refusals (our own configuration) say nothing about the source's health.
CREATE OR REPLACE FUNCTION public.apply_source_health(
  p_source_id UUID, p_state TEXT, p_diagnostics JSONB, p_origin TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_code TEXT := COALESCE(p_diagnostics->>0, '');
  v_circuit public.source_circuits%ROWTYPE;
  v_samples INTEGER;
  v_ok INTEGER;
BEGIN
  IF v_code IN ('SOURCE_LIVE_NOT_PERMITTED', 'SOURCE_DISABLED', 'SOURCE_FIXTURE_URL_INVALID',
                'SWAPPA_PRODUCT_UNRESOLVED', 'SOURCE_CIRCUIT_OPEN') THEN
    RETURN;
  END IF;
  INSERT INTO public.source_circuits (source_id) VALUES (p_source_id) ON CONFLICT DO NOTHING;
  SELECT * INTO v_circuit FROM public.source_circuits WHERE source_id = p_source_id FOR UPDATE;

  IF p_state = 'NORMAL' THEN
    UPDATE public.source_circuits SET state = 'closed', consecutive_failures = 0, reason = NULL,
      opened_at = NULL, reopen_after = NULL, probe_started_at = NULL, updated_at = NOW()
    WHERE source_id = p_source_id;
    UPDATE public.incidents SET status = 'resolved', resolved_at = NOW(),
      evidence = evidence || jsonb_build_object('resolvedBy', p_origin)
    WHERE source_id = p_source_id AND status = 'open' AND kind IN ('SOURCE_BLOCKED', 'CANARY_FAILED');
  ELSIF p_state IN ('CAPTCHA', 'RATE_LIMITED', 'LOGIN_REQUIRED') OR v_code IN ('SOURCE_BLOCKED', 'ROBOTS_DISALLOWED') THEN
    -- A block opens the circuit at once: no retry storm against a source that said no.
    UPDATE public.source_circuits SET state = 'open', consecutive_failures = v_circuit.consecutive_failures + 1,
      reason = COALESCE(NULLIF(v_code, ''), p_state), opened_at = NOW(),
      reopen_after = NOW() + CASE WHEN p_state = 'RATE_LIMITED' THEN INTERVAL '1 hour' ELSE INTERVAL '6 hours' END,
      probe_started_at = NULL, updated_at = NOW()
    WHERE source_id = p_source_id;
    INSERT INTO public.incidents (source_id, kind, evidence)
    VALUES (p_source_id, 'SOURCE_BLOCKED', jsonb_build_object('state', p_state, 'code', v_code, 'origin', p_origin))
    ON CONFLICT (source_id, kind) WHERE status = 'open' DO NOTHING;
  ELSIF v_circuit.state = 'half_open' THEN
    -- The single probe failed: back to open without waiting for three strikes.
    UPDATE public.source_circuits SET state = 'open', consecutive_failures = v_circuit.consecutive_failures + 1,
      reason = COALESCE(NULLIF(v_code, ''), p_state), opened_at = NOW(),
      reopen_after = NOW() + INTERVAL '15 minutes', probe_started_at = NULL, updated_at = NOW()
    WHERE source_id = p_source_id;
  ELSE
    UPDATE public.source_circuits SET consecutive_failures = v_circuit.consecutive_failures + 1,
      state = CASE WHEN v_circuit.consecutive_failures + 1 >= 3 THEN 'open' ELSE state END,
      reason = CASE WHEN v_circuit.consecutive_failures + 1 >= 3 THEN COALESCE(NULLIF(v_code, ''), p_state) ELSE reason END,
      opened_at = CASE WHEN v_circuit.consecutive_failures + 1 >= 3 THEN NOW() ELSE opened_at END,
      reopen_after = CASE WHEN v_circuit.consecutive_failures + 1 >= 3 THEN NOW() + INTERVAL '15 minutes' ELSE reopen_after END,
      updated_at = NOW()
    WHERE source_id = p_source_id;
  END IF;

  -- Error budget: under 70% success over the last 10 outcomes (at least 5) opens an incident; it
  -- resolves only once the window is back above budget, never on a single success.
  SELECT COUNT(*), COUNT(*) FILTER (WHERE ok) INTO v_samples, v_ok FROM (
    SELECT state = 'NORMAL' AS ok, checked_at FROM public.collector_health_checks
      WHERE source_id = p_source_id AND NOT (diagnostics ?| ARRAY['SOURCE_LIVE_NOT_PERMITTED', 'SOURCE_DISABLED', 'SOURCE_FIXTURE_URL_INVALID', 'SOURCE_CIRCUIT_OPEN'])
    UNION ALL
    SELECT ok, checked_at FROM public.canary_runs WHERE source_id = p_source_id
    ORDER BY checked_at DESC LIMIT 10
  ) recent;
  IF v_samples >= 5 AND v_ok::NUMERIC / v_samples < 0.7 THEN
    INSERT INTO public.incidents (source_id, kind, evidence)
    VALUES (p_source_id, 'ERROR_BUDGET', jsonb_build_object('samples', v_samples, 'ok', v_ok, 'origin', p_origin))
    ON CONFLICT (source_id, kind) WHERE status = 'open' DO NOTHING;
  ELSIF v_samples >= 5 THEN
    UPDATE public.incidents SET status = 'resolved', resolved_at = NOW(),
      evidence = evidence || jsonb_build_object('resolvedBy', p_origin, 'samples', v_samples, 'ok', v_ok)
    WHERE source_id = p_source_id AND status = 'open' AND kind = 'ERROR_BUDGET';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_collector_health_check() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.apply_source_health(NEW.source_id, NEW.state, NEW.diagnostics, 'collection');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS collector_health_checks_circuit ON public.collector_health_checks;
CREATE TRIGGER collector_health_checks_circuit AFTER INSERT ON public.collector_health_checks
  FOR EACH ROW EXECUTE FUNCTION public.on_collector_health_check();

CREATE OR REPLACE FUNCTION public.on_canary_run() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT NEW.ok THEN
    INSERT INTO public.incidents (source_id, kind, evidence)
    VALUES (NEW.source_id, 'CANARY_FAILED', jsonb_build_object('code', NEW.error_code, 'items', NEW.items, 'expected', NEW.expected_min_items))
    ON CONFLICT (source_id, kind) WHERE status = 'open' DO NOTHING;
  END IF;
  PERFORM public.apply_source_health(
    NEW.source_id,
    CASE WHEN NEW.ok THEN 'NORMAL' WHEN NEW.error_code IN ('CAPTCHA') THEN 'CAPTCHA'
         WHEN NEW.error_code = 'RATE_LIMITED' THEN 'RATE_LIMITED' ELSE 'ERROR' END,
    jsonb_build_array(COALESCE(NEW.error_code, CASE WHEN NEW.ok THEN 'OK' ELSE 'CANARY_BELOW_EXPECTED' END)),
    'canary'
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS canary_runs_health ON public.canary_runs;
CREATE TRIGGER canary_runs_health AFTER INSERT ON public.canary_runs
  FOR EACH ROW EXECUTE FUNCTION public.on_canary_run();

-- Gate used before queueing work for a source. An open circuit past its cool-down moves to
-- half-open and lets exactly one attempt through; its outcome closes or reopens the circuit.
CREATE OR REPLACE FUNCTION public.source_circuit_allows(p_source_id UUID)
RETURNS TABLE(allowed BOOLEAN, state TEXT, reason TEXT, reopen_after TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_circuit public.source_circuits%ROWTYPE;
BEGIN
  SELECT * INTO v_circuit FROM public.source_circuits WHERE source_id = p_source_id FOR UPDATE;
  IF v_circuit.source_id IS NULL OR v_circuit.state = 'closed' THEN
    RETURN QUERY SELECT TRUE, 'closed'::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ;
  ELSIF (v_circuit.state = 'open' AND v_circuit.reopen_after <= NOW())
     OR (v_circuit.state = 'half_open'
         AND (v_circuit.probe_started_at IS NULL OR v_circuit.probe_started_at < NOW() - INTERVAL '15 minutes')) THEN
    -- Let one probe through; everyone else waits for its outcome.
    UPDATE public.source_circuits SET state = 'half_open', probe_started_at = NOW(), updated_at = NOW()
    WHERE source_id = p_source_id;
    RETURN QUERY SELECT TRUE, 'half_open'::TEXT, v_circuit.reason, v_circuit.reopen_after;
  ELSE
    RETURN QUERY SELECT FALSE, v_circuit.state, v_circuit.reason, v_circuit.reopen_after;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_source_health(UUID, TEXT, JSONB, TEXT), public.source_circuit_allows(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_source_health(UUID, TEXT, JSONB, TEXT), public.source_circuit_allows(UUID) TO service_role;
