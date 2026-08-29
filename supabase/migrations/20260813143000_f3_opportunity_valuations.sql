-- F3 versioned opportunity valuation outputs. Scores are recommendations, not authorization.
CREATE TABLE IF NOT EXISTS public.opportunity_valuations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  valuation_version TEXT NOT NULL,
  estimated_market_price NUMERIC(12, 2) NOT NULL CHECK (estimated_market_price >= 0),
  max_purchase_price NUMERIC(12, 2) NOT NULL CHECK (max_purchase_price >= 0),
  deal_score NUMERIC(5, 2) NOT NULL CHECK (deal_score >= 0 AND deal_score <= 100),
  trend_score NUMERIC(5, 2) NOT NULL CHECK (trend_score >= 0 AND trend_score <= 100),
  liquidity_score NUMERIC(5, 2) NOT NULL CHECK (liquidity_score >= 0 AND liquidity_score <= 100),
  seller_pressure_score NUMERIC(5, 2) NOT NULL CHECK (seller_pressure_score >= 0 AND seller_pressure_score <= 100),
  risk_confidence_score NUMERIC(5, 2) NOT NULL CHECK (risk_confidence_score >= 0 AND risk_confidence_score <= 100),
  confidence NUMERIC(5, 4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  comparables_used INTEGER NOT NULL CHECK (comparables_used >= 0),
  outliers_removed INTEGER NOT NULL CHECK (outliers_removed >= 0),
  evidence JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(evidence) = 'array'),
  missing JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(missing) = 'array'),
  explanation TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS opportunity_valuations_listing_created_idx
  ON public.opportunity_valuations (listing_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS opportunity_valuations_listing_version_idx
  ON public.opportunity_valuations (listing_id, valuation_version);

REVOKE ALL ON public.opportunity_valuations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.opportunity_valuations TO authenticated;
GRANT ALL ON public.opportunity_valuations TO service_role;
ALTER TABLE public.opportunity_valuations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shared_opportunity_valuations_read ON public.opportunity_valuations;
DROP POLICY IF EXISTS opportunity_valuations_owner_read ON public.opportunity_valuations;
CREATE POLICY opportunity_valuations_owner_read
  ON public.opportunity_valuations FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.research_project_listings rpl
      JOIN public.research_projects rp ON rp.id = rpl.project_id
      WHERE rpl.listing_id = opportunity_valuations.listing_id
        AND rp.user_id = auth.uid()
        AND rp.status <> 'deleted'
    )
  );
