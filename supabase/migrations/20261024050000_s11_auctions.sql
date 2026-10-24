-- S11: auctions, read-only. Lots are their own entity (closing date, bids, terms); every change
-- in the observed high bid is kept; lot monitors and alerts extend S10. No bidding exists.
INSERT INTO public.sources (id, name, domain, country, currency, connector_type, status)
VALUES ('00000000-0000-4000-a000-000000000005', 'GSA Auctions', 'gsaauctions.gov', 'US', 'USD', 'official_api', 'active')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, domain = EXCLUDED.domain, connector_type = EXCLUDED.connector_type,
  status = EXCLUDED.status, updated_at = NOW();

CREATE TABLE IF NOT EXISTS public.auction_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL CHECK (char_length(external_id) BETWEEN 1 AND 200),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  image_url TEXT,
  closes_on DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  current_bid_minor BIGINT CHECK (current_bid_minor >= 0),
  bidders INTEGER CHECK (bidders >= 0),
  increment_minor BIGINT CHECK (increment_minor >= 0),
  reserve BOOLEAN,
  location TEXT,
  agency TEXT,
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (char_length(currency) = 3),
  terms_text TEXT NOT NULL DEFAULT '',
  terms JSONB NOT NULL DEFAULT '{"parserVersion": "auction-terms.v1"}'::JSONB,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_id, external_id)
);
CREATE INDEX IF NOT EXISTS auction_lots_closing_idx ON public.auction_lots (status, closes_on);

-- One row per distinct observed (high bid, bidders): the bid history as seen at each sweep.
CREATE TABLE IF NOT EXISTS public.auction_bid_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES public.auction_lots(id) ON DELETE CASCADE,
  high_bid_minor BIGINT CHECK (high_bid_minor >= 0),
  bidders INTEGER CHECK (bidders >= 0),
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT auction_bid_observations_distinct UNIQUE NULLS NOT DISTINCT (lot_id, high_bid_minor, bidders)
);

-- Each sweep is recorded so the scheduler can keep within the source's request budget.
CREATE TABLE IF NOT EXISTS public.auction_sweeps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  origin TEXT NOT NULL,
  lots_seen INTEGER NOT NULL DEFAULT 0,
  lots_kept INTEGER NOT NULL DEFAULT 0,
  bid_changes INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS auction_sweeps_source_idx ON public.auction_sweeps (source_id, started_at DESC);

-- Premises a user sets for what a lot's terms leave open (premium, tax, removal, useful ratio).
CREATE TABLE IF NOT EXISTS public.auction_lot_premises (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lot_id UUID NOT NULL REFERENCES public.auction_lots(id) ON DELETE CASCADE,
  premises JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(premises) = 'object'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, lot_id)
);

ALTER TABLE public.auction_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_bid_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_sweeps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_lot_premises ENABLE ROW LEVEL SECURITY;
-- Public auction data: any signed-in user reads it; only the service role writes it.
CREATE POLICY auction_lots_read ON public.auction_lots FOR SELECT TO authenticated USING (true);
CREATE POLICY auction_bid_observations_read ON public.auction_bid_observations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY auction_sweeps_read ON public.auction_sweeps FOR SELECT TO authenticated USING (true);
CREATE POLICY auction_lot_premises_owner ON public.auction_lot_premises FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT ON public.auction_lots, public.auction_bid_observations, public.auction_sweeps TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auction_lot_premises TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.auction_lots, public.auction_bid_observations,
  public.auction_sweeps, public.auction_lot_premises TO service_role;

-- Lot monitors and lot alerts.
ALTER TABLE public.monitors ADD COLUMN IF NOT EXISTS lot_id UUID REFERENCES public.auction_lots(id) ON DELETE CASCADE;
ALTER TABLE public.monitors DROP CONSTRAINT IF EXISTS monitors_kind_check;
ALTER TABLE public.monitors ADD CONSTRAINT monitors_kind_check CHECK (kind IN ('search', 'listing', 'lot'));
ALTER TABLE public.monitors DROP CONSTRAINT IF EXISTS monitors_check;
ALTER TABLE public.monitors ADD CONSTRAINT monitors_target_check CHECK (
  (kind = 'search' AND project_id IS NOT NULL AND listing_id IS NULL AND lot_id IS NULL)
  OR (kind = 'listing' AND listing_id IS NOT NULL AND lot_id IS NULL)
  OR (kind = 'lot' AND lot_id IS NOT NULL AND listing_id IS NULL AND project_id IS NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS monitors_one_per_lot
  ON public.monitors (user_id, lot_id) WHERE kind = 'lot' AND active;

ALTER TABLE public.alerts ALTER COLUMN listing_id DROP NOT NULL;
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS lot_id UUID REFERENCES public.auction_lots(id) ON DELETE CASCADE;
ALTER TABLE public.alerts DROP CONSTRAINT IF EXISTS alerts_kind_check;
ALTER TABLE public.alerts ADD CONSTRAINT alerts_kind_check CHECK (kind IN (
  'NEW_OPPORTUNITY', 'PRICE_DROP', 'ENDED', 'GONE', 'LOT_BID_ABOVE', 'LOT_CLOSING', 'LOT_CLOSED'
));
ALTER TABLE public.alerts ADD CONSTRAINT alerts_target_check
  CHECK ((listing_id IS NULL) <> (lot_id IS NULL));
