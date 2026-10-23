-- S4: visual checkup of finalists. One run per (listing, image set, prompt, model); an image set
-- whose byte hashes were already analyzed is never sent to the model again.
CREATE TABLE IF NOT EXISTS public.visual_analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.research_projects(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  image_urls TEXT[] NOT NULL CHECK (cardinality(image_urls) BETWEEN 1 AND 3),
  image_hashes TEXT[],
  findings JSONB NOT NULL DEFAULT '[]'::JSONB,
  summary TEXT,
  input_tokens INTEGER CHECK (input_tokens >= 0),
  output_tokens INTEGER CHECK (output_tokens >= 0),
  cost_micro_usd BIGINT CHECK (cost_micro_usd >= 0),
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS visual_analysis_runs_listing_idx
  ON public.visual_analysis_runs (listing_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS visual_analysis_runs_image_set_unique
  ON public.visual_analysis_runs (listing_id, prompt_version, model, image_urls);

ALTER TABLE public.visual_analysis_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY visual_analysis_runs_read ON public.visual_analysis_runs
  FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.visual_analysis_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.visual_analysis_runs TO service_role;
