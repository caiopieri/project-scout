-- Milestone 3: project lifecycle and persisted interpretation metadata.
ALTER TABLE public.research_projects
  DROP CONSTRAINT IF EXISTS research_projects_status_check;

ALTER TABLE public.research_projects
  ADD CONSTRAINT research_projects_status_check
  CHECK (status IN ('draft', 'active', 'archived', 'deleted')),
  ADD COLUMN IF NOT EXISTS interpretation_schema_version TEXT NOT NULL DEFAULT '1.0.0',
  ADD COLUMN IF NOT EXISTS taxonomy_version TEXT NOT NULL DEFAULT '1.0.0',
  ADD COLUMN IF NOT EXISTS interpreter_provider TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS interpreter_model TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS interpreter_version TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS interpreted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS interpretation_confidence NUMERIC(4, 3) NOT NULL DEFAULT 0
    CHECK (interpretation_confidence BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS interpretation_ambiguities JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(interpretation_ambiguities) = 'array'),
  ADD COLUMN IF NOT EXISTS interpretation_warnings JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(interpretation_warnings) = 'array'),
  ADD COLUMN IF NOT EXISTS unidentified_fields JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(unidentified_fields) = 'array'),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS research_projects_owner_status_updated_idx
  ON public.research_projects (user_id, status, updated_at DESC);

COMMENT ON COLUMN public.research_projects.natural_language_query IS
  'Immutable-by-default original user wording; edits require an explicit project update.';
COMMENT ON COLUMN public.research_projects.structured_query IS
  'Validated ResearchCriteria JSON, schema version in interpretation_schema_version.';
