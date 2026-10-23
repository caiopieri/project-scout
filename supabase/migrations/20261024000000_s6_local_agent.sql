-- S6: Local Agent. It pulls tasks with its own token (only the hash is stored), runs them with
-- the user's browser session on the user's machine, and returns extracted records only.
CREATE TABLE IF NOT EXISTS public.local_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.local_agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.research_projects(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.sources(id),
  agent_id UUID REFERENCES public.local_agents(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'completed', 'failed')),
  payload JSONB NOT NULL,
  items_received INTEGER,
  items_created INTEGER,
  items_updated INTEGER,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS local_agent_tasks_pending_idx
  ON public.local_agent_tasks (user_id, created_at) WHERE status = 'pending';

ALTER TABLE public.local_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_agent_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY local_agents_owner_read ON public.local_agents
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY local_agent_tasks_owner_read ON public.local_agent_tasks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
GRANT SELECT ON public.local_agents, public.local_agent_tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.local_agents, public.local_agent_tasks TO service_role;

-- Atomic claim: the oldest pending (or lease-expired) task of the agent's owner.
CREATE OR REPLACE FUNCTION public.claim_local_agent_task(p_agent_id UUID)
RETURNS SETOF public.local_agent_tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user UUID;
BEGIN
  SELECT user_id INTO v_user FROM public.local_agents WHERE id = p_agent_id AND revoked_at IS NULL;
  IF v_user IS NULL THEN RETURN; END IF;
  UPDATE public.local_agents SET last_seen_at = NOW() WHERE id = p_agent_id;
  RETURN QUERY
    UPDATE public.local_agent_tasks SET
      status = 'claimed', agent_id = p_agent_id, claimed_at = NOW(),
      lease_expires_at = NOW() + INTERVAL '10 minutes'
    WHERE id = (
      SELECT id FROM public.local_agent_tasks
      WHERE user_id = v_user
        AND (status = 'pending' OR (status = 'claimed' AND lease_expires_at < NOW()))
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_local_agent_task(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_local_agent_task(UUID) TO service_role;
