-- S1.3: preserve whether a bounded source sweep ended at its request budget.
ALTER TABLE public.collection_runs
  ADD COLUMN IF NOT EXISTS truncated BOOLEAN;
