-- S1.3: persist the source request position used by the execution panel.
ALTER TABLE public.collection_runs
  ADD COLUMN IF NOT EXISTS requests_used INTEGER,
  ADD COLUMN IF NOT EXISTS request_budget INTEGER;

DO $$
BEGIN
  ALTER TABLE public.collection_runs
    ADD CONSTRAINT collection_runs_requests_used_check
    CHECK (requests_used IS NULL OR requests_used >= 0);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

DO $$
BEGIN
  ALTER TABLE public.collection_runs
    ADD CONSTRAINT collection_runs_request_budget_check
    CHECK (request_budget IS NULL OR request_budget > 0);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;
