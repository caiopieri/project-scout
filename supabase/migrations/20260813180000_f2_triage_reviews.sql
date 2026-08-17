-- Human review is a separate, owner-scoped layer over immutable deterministic triage.
CREATE TABLE IF NOT EXISTS public.listing_triage_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.research_projects(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected')),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT listing_triage_reviews_project_listing_unique UNIQUE (project_id, listing_id)
);

CREATE INDEX IF NOT EXISTS listing_triage_reviews_project_reviewed_idx
  ON public.listing_triage_reviews (project_id, reviewed_at DESC);

GRANT SELECT ON public.listing_triage_reviews TO authenticated;
GRANT INSERT (project_id, listing_id, status) ON public.listing_triage_reviews TO authenticated;
GRANT UPDATE (status) ON public.listing_triage_reviews TO authenticated;
GRANT ALL ON public.listing_triage_reviews TO service_role;
ALTER TABLE public.listing_triage_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS listing_triage_reviews_owner_read ON public.listing_triage_reviews;
CREATE POLICY listing_triage_reviews_owner_read
  ON public.listing_triage_reviews FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.research_projects rp
      WHERE rp.id = listing_triage_reviews.project_id
        AND rp.user_id = auth.uid()
        AND rp.status <> 'deleted'
    )
  );

DROP POLICY IF EXISTS listing_triage_reviews_owner_insert ON public.listing_triage_reviews;
CREATE POLICY listing_triage_reviews_owner_insert
  ON public.listing_triage_reviews FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.research_projects rp
      JOIN public.research_project_listings rpl ON rpl.project_id = rp.id
      WHERE rp.id = listing_triage_reviews.project_id
        AND rpl.listing_id = listing_triage_reviews.listing_id
        AND rp.user_id = auth.uid()
        AND rp.status <> 'deleted'
    )
  );

DROP POLICY IF EXISTS listing_triage_reviews_owner_update ON public.listing_triage_reviews;
CREATE POLICY listing_triage_reviews_owner_update
  ON public.listing_triage_reviews FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.research_projects rp
      WHERE rp.id = listing_triage_reviews.project_id
        AND rp.user_id = auth.uid()
        AND rp.status <> 'deleted'
    )
  ) WITH CHECK (status IN ('accepted', 'rejected'));
