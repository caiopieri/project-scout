-- F2 audit trail for the versioned query family used by each collection run.
CREATE TABLE IF NOT EXISTS public.search_query_families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.research_projects(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  collection_run_id UUID NOT NULL UNIQUE REFERENCES public.collection_runs(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  base_query TEXT NOT NULL,
  queries JSONB NOT NULL CHECK (jsonb_typeof(queries) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.search_term_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.research_projects(id) ON DELETE CASCADE,
  family_id UUID NOT NULL REFERENCES public.search_query_families(id) ON DELETE CASCADE,
  term TEXT NOT NULL,
  normalized_term TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('exact', 'alias', 'abbreviation', 'typo', 'localized', 'learned')),
  status TEXT NOT NULL CHECK (status IN ('candidate', 'accepted', 'rejected')),
  evidence JSONB NOT NULL CHECK (jsonb_typeof(evidence) = 'array'),
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT search_term_observations_identity_unique
    UNIQUE (project_id, normalized_term, kind, source)
);

CREATE INDEX IF NOT EXISTS search_query_families_project_created_idx
  ON public.search_query_families (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS search_term_observations_project_status_idx
  ON public.search_term_observations (project_id, status, created_at DESC);

REVOKE ALL ON public.search_query_families, public.search_term_observations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.search_query_families, public.search_term_observations TO authenticated;
GRANT UPDATE (status) ON public.search_term_observations TO authenticated;
GRANT ALL ON public.search_query_families, public.search_term_observations TO service_role;
ALTER TABLE public.search_query_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_term_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS search_query_families_owner_read ON public.search_query_families;
CREATE POLICY search_query_families_owner_read
  ON public.search_query_families FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.research_projects rp
      WHERE rp.id = search_query_families.project_id
        AND rp.user_id = auth.uid()
        AND rp.status <> 'deleted'
    )
  );

DROP POLICY IF EXISTS search_term_observations_owner_read ON public.search_term_observations;
CREATE POLICY search_term_observations_owner_read
  ON public.search_term_observations FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.research_projects rp
      WHERE rp.id = search_term_observations.project_id
        AND rp.user_id = auth.uid()
        AND rp.status <> 'deleted'
    )
  );

DROP POLICY IF EXISTS search_term_observations_owner_review ON public.search_term_observations;
CREATE POLICY search_term_observations_owner_review
  ON public.search_term_observations FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.research_projects rp
      WHERE rp.id = search_term_observations.project_id
        AND rp.user_id = auth.uid()
        AND rp.status <> 'deleted'
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.research_projects rp
      WHERE rp.id = search_term_observations.project_id
        AND rp.user_id = auth.uid()
        AND rp.status <> 'deleted'
    )
  );
