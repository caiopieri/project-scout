-- F2: owner-scoped human review can change only an observation status.
GRANT UPDATE (status) ON public.search_term_observations TO authenticated;

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
