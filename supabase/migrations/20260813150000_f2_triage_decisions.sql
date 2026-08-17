-- F2 audit trail for deterministic screening, identity and investigation decisions.
CREATE TABLE IF NOT EXISTS public.listing_triage_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.research_projects(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  filter_decision TEXT NOT NULL CHECK (filter_decision IN ('KEEP', 'REJECT', 'REVIEW')),
  filter_reasons JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(filter_reasons) = 'array'),
  identity JSONB NOT NULL CHECK (jsonb_typeof(identity) = 'object'),
  investigation JSONB NOT NULL CHECK (jsonb_typeof(investigation) = 'object'),
  decision_version TEXT NOT NULL DEFAULT 'triage-rules.v1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS listing_triage_decisions_project_created_idx
  ON public.listing_triage_decisions (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS listing_triage_decisions_listing_created_idx
  ON public.listing_triage_decisions (listing_id, created_at DESC);

GRANT SELECT ON public.listing_triage_decisions TO authenticated;
GRANT ALL ON public.listing_triage_decisions TO service_role;
ALTER TABLE public.listing_triage_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS listing_triage_decisions_owner_read ON public.listing_triage_decisions;
CREATE POLICY listing_triage_decisions_owner_read
  ON public.listing_triage_decisions FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.research_projects rp
      WHERE rp.id = listing_triage_decisions.project_id
        AND rp.user_id = auth.uid()
        AND rp.status <> 'deleted'
    )
  );
