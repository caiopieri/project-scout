-- PostgREST requires table INSERT for direct upsert. Keep that privilege closed and
-- expose only the validated review operation instead.
REVOKE INSERT ON public.listing_triage_reviews FROM authenticated;

CREATE OR REPLACE FUNCTION public.review_listing_triage(
  p_project_id UUID,
  p_listing_id UUID,
  p_status TEXT
)
RETURNS public.listing_triage_reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  result public.listing_triage_reviews;
BEGIN
  IF p_status NOT IN ('accepted', 'rejected') THEN
    RAISE EXCEPTION 'Invalid triage review status';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.research_projects rp
    JOIN public.research_project_listings rpl ON rpl.project_id = rp.id
    WHERE rp.id = p_project_id
      AND rpl.listing_id = p_listing_id
      AND rp.user_id = auth.uid()
      AND rp.status <> 'deleted'
  ) THEN
    RAISE EXCEPTION 'Project listing is not accessible';
  END IF;

  INSERT INTO public.listing_triage_reviews (project_id, listing_id, status)
  VALUES (p_project_id, p_listing_id, p_status)
  ON CONFLICT (project_id, listing_id) DO UPDATE
    SET status = EXCLUDED.status, reviewed_at = NOW()
  RETURNING * INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.review_listing_triage(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_listing_triage(UUID, UUID, TEXT) TO authenticated;
