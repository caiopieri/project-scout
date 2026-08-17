-- F6.2: owner-readable audit of validated negotiation drafts. Nothing here
-- authorizes transport, payment, bidding or sending.
CREATE TABLE IF NOT EXISTS public.negotiation_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  context_id UUID NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('ebay', 'mercadolivre', 'xianyu')),
  external_id TEXT NOT NULL CHECK (char_length(btrim(external_id)) BETWEEN 1 AND 200),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  asking_price_minor BIGINT NOT NULL CHECK (asking_price_minor >= 0),
  market_value_minor BIGINT NOT NULL CHECK (market_value_minor >= 0),
  target_price_minor BIGINT NOT NULL CHECK (target_price_minor >= 0),
  user_max_price_minor BIGINT NOT NULL CHECK (user_max_price_minor >= target_price_minor),
  suggested_offer_minor BIGINT NOT NULL CHECK (
    suggested_offer_minor >= 0
    AND suggested_offer_minor <= user_max_price_minor
    AND suggested_offer_minor <= target_price_minor
    AND suggested_offer_minor <= asking_price_minor
  ),
  context_snapshot JSONB NOT NULL CHECK (
    jsonb_typeof(context_snapshot) = 'object'
    AND NOT (context_snapshot ?| ARRAY['send', 'payment', 'bid', 'command', 'secret'])
  ),
  suggestion_snapshot JSONB NOT NULL CHECK (
    jsonb_typeof(suggestion_snapshot) = 'object'
    AND suggestion_snapshot->>'requiresHumanReview' = 'true'
    AND suggestion_snapshot->>'sent' = 'false'
    AND suggestion_snapshot->>'executable' = 'false'
    AND NOT (suggestion_snapshot ?| ARRAY['send', 'payment', 'bid', 'command', 'secret'])
  ),
  requires_human_review BOOLEAN NOT NULL CHECK (requires_human_review IS TRUE),
  sent BOOLEAN NOT NULL CHECK (sent IS FALSE),
  executable BOOLEAN NOT NULL CHECK (executable IS FALSE),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS negotiation_drafts_user_created_idx
  ON public.negotiation_drafts (user_id, created_at DESC);

REVOKE ALL ON public.negotiation_drafts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.negotiation_drafts TO authenticated;
GRANT ALL ON public.negotiation_drafts TO service_role;
ALTER TABLE public.negotiation_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS negotiation_drafts_owner_read ON public.negotiation_drafts;
CREATE POLICY negotiation_drafts_owner_read
  ON public.negotiation_drafts FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
