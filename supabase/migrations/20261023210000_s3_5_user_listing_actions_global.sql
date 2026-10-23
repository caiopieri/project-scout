-- S3.5: the heart and triage labels belong to (user, listing), not to (user, listing, project).
-- The acervo is global; a listing seen in two searches must carry one heart, one label.
DELETE FROM public.user_listing_actions a
 USING public.user_listing_actions b
 WHERE a.user_id = b.user_id AND a.listing_id = b.listing_id
   AND (a.updated_at, a.id) < (b.updated_at, b.id);

ALTER TABLE public.user_listing_actions DROP CONSTRAINT IF EXISTS user_listing_project_unique;
ALTER TABLE public.user_listing_actions ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE public.user_listing_actions
  ADD CONSTRAINT user_listing_actions_user_listing_unique UNIQUE (user_id, listing_id);

-- Triage label from the keyboard (X/S/M). A label never deletes anything.
ALTER TABLE public.user_listing_actions
  ADD COLUMN IF NOT EXISTS label TEXT CHECK (label IN ('discarded', 'shortlisted', 'monitored'));

DROP POLICY IF EXISTS user_listing_actions_owner_policy ON public.user_listing_actions;
CREATE POLICY user_listing_actions_owner_policy ON public.user_listing_actions
  FOR ALL TO authenticated
  USING (
    auth.uid() = user_id AND EXISTS (
      SELECT 1 FROM public.research_project_listings rpl
      JOIN public.research_projects rp ON rp.id = rpl.project_id
      WHERE rpl.listing_id = user_listing_actions.listing_id AND rp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id AND EXISTS (
      SELECT 1 FROM public.research_project_listings rpl
      JOIN public.research_projects rp ON rp.id = rpl.project_id
      WHERE rpl.listing_id = user_listing_actions.listing_id AND rp.user_id = auth.uid()
    ) AND (
      project_id IS NULL OR EXISTS (
        SELECT 1 FROM public.research_projects rp
        WHERE rp.id = user_listing_actions.project_id AND rp.user_id = auth.uid()
      )
    )
  );
