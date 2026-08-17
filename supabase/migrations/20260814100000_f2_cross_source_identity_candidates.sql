-- Cross-source identity remains a reviewable recommendation, never a merge command.
CREATE TABLE IF NOT EXISTS public.cross_source_identity_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.research_projects(id) ON DELETE CASCADE,
  left_source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  left_listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  right_source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  right_listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  relation TEXT NOT NULL CHECK (relation IN ('MATCH_CANDIDATE', 'REVIEW')),
  confidence NUMERIC(5, 4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  evidence JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(evidence) = 'array'),
  merge_eligible BOOLEAN NOT NULL DEFAULT FALSE CHECK (merge_eligible = FALSE),
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'accepted', 'rejected')),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cross_source_identity_distinct_sources CHECK (left_source_id <> right_source_id),
  CONSTRAINT cross_source_identity_distinct_listings CHECK (left_listing_id <> right_listing_id),
  CONSTRAINT cross_source_identity_pair_unique UNIQUE (
    project_id, left_source_id, left_listing_id, right_source_id, right_listing_id
  )
);

CREATE INDEX IF NOT EXISTS cross_source_identity_candidates_project_created_idx
  ON public.cross_source_identity_candidates (project_id, created_at DESC);

GRANT SELECT ON public.cross_source_identity_candidates TO authenticated;
GRANT ALL ON public.cross_source_identity_candidates TO service_role;
ALTER TABLE public.cross_source_identity_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cross_source_identity_candidates_owner_read
  ON public.cross_source_identity_candidates;
CREATE POLICY cross_source_identity_candidates_owner_read
  ON public.cross_source_identity_candidates FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.research_projects rp
      WHERE rp.id = cross_source_identity_candidates.project_id
        AND rp.user_id = auth.uid()
        AND rp.status <> 'deleted'
    )
  );

CREATE OR REPLACE FUNCTION public.review_cross_source_identity_candidate(
  p_project_id UUID,
  p_candidate_id UUID,
  p_status TEXT
)
RETURNS public.cross_source_identity_candidates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.cross_source_identity_candidates;
BEGIN
  IF p_status NOT IN ('accepted', 'rejected') THEN
    RAISE EXCEPTION 'Invalid identity candidate review status';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.research_projects rp
    WHERE rp.id = p_project_id AND rp.user_id = auth.uid() AND rp.status <> 'deleted'
  ) THEN
    RAISE EXCEPTION 'Project is not accessible';
  END IF;
  UPDATE public.cross_source_identity_candidates
  SET review_status = p_status, reviewed_at = NOW()
  WHERE id = p_candidate_id AND project_id = p_project_id
  RETURNING * INTO result;
  IF result.id IS NULL THEN
    RAISE EXCEPTION 'Identity candidate is not accessible';
  END IF;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.review_cross_source_identity_candidate(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_cross_source_identity_candidate(UUID, UUID, TEXT) TO authenticated;
