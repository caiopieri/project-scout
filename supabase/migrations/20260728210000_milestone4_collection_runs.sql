-- Milestone 4: idempotent asynchronous collection lifecycle.
ALTER TABLE public.collection_runs
  ADD COLUMN idempotency_key TEXT,
  ADD COLUMN queued_at TIMESTAMPTZ,
  ADD COLUMN lease_expires_at TIMESTAMPTZ,
  ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  ADD COLUMN error_kind TEXT CHECK (error_kind IN ('transient', 'permanent')),
  ADD COLUMN error_code TEXT;

UPDATE public.collection_runs
SET idempotency_key = 'legacy:' || id::text
WHERE idempotency_key IS NULL;

ALTER TABLE public.collection_runs
  ALTER COLUMN idempotency_key SET NOT NULL,
  ALTER COLUMN started_at DROP NOT NULL,
  ALTER COLUMN started_at DROP DEFAULT,
  ADD CONSTRAINT collection_runs_project_idempotency_unique UNIQUE (project_id, idempotency_key),
  ADD CONSTRAINT collection_runs_finished_state_check CHECK (
    (status IN ('completed', 'failed') AND finished_at IS NOT NULL)
    OR (status IN ('pending', 'running') AND finished_at IS NULL)
  );

CREATE OR REPLACE FUNCTION public.claim_collection_run(p_run_id UUID)
RETURNS SETOF public.collection_runs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.collection_runs
  SET status = 'running',
      started_at = COALESCE(started_at, NOW()),
      lease_expires_at = NOW() + INTERVAL '5 minutes',
      attempt_count = attempt_count + 1,
      error = NULL,
      error_kind = NULL,
      error_code = NULL
  WHERE id = p_run_id
    AND (
      status = 'pending'
      OR (status = 'running' AND lease_expires_at < NOW())
    )
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION public.claim_collection_run(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_collection_run(UUID) TO service_role;

