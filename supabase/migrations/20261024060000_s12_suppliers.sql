-- S12: suppliers, the second product of the system. Owner-scoped: quotes and contacts a user
-- gathers are theirs. A supplier is identified per user by its website (or name when it has none).
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  website TEXT,
  identity TEXT NOT NULL CHECK (char_length(identity) BETWEEN 1 AND 300),
  level TEXT NOT NULL CHECK (level IN ('factory', 'trading', 'distributor', 'reseller', 'liquidator')),
  country TEXT CHECK (country ~ '^[A-Z]{2}$'),
  claims JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(claims) = 'array'),
  origin TEXT NOT NULL CHECK (origin IN ('extracted', 'imported', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, identity)
);

CREATE TABLE IF NOT EXISTS public.supplier_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('email', 'phone', 'url')),
  value TEXT NOT NULL CHECK (char_length(value) BETWEEN 3 AND 300),
  verification JSONB,
  UNIQUE (supplier_id, kind, value)
);

CREATE TABLE IF NOT EXISTS public.supplier_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  product_key TEXT NOT NULL CHECK (product_key ~ '^[a-z0-9][a-z0-9-]{1,119}$'),
  title TEXT NOT NULL,
  sku TEXT,
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  tiers JSONB NOT NULL CHECK (jsonb_typeof(tiers) = 'array' AND jsonb_array_length(tiers) > 0),
  moq JSONB NOT NULL,
  lead_time_days INTEGER CHECK (lead_time_days BETWEEN 0 AND 365),
  incoterm TEXT,
  ship_from TEXT CHECK (ship_from ~ '^[A-Z]{2}$'),
  source_url TEXT,
  evidence TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE NULLS NOT DISTINCT (supplier_id, product_key, sku)
);
CREATE INDEX IF NOT EXISTS supplier_offers_product_idx ON public.supplier_offers (product_key);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY suppliers_owner ON public.suppliers FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY supplier_contacts_owner ON public.supplier_contacts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = supplier_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = supplier_id AND s.user_id = auth.uid()));
CREATE POLICY supplier_offers_owner ON public.supplier_offers FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = supplier_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = supplier_id AND s.user_id = auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers, public.supplier_contacts, public.supplier_offers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers, public.supplier_contacts, public.supplier_offers TO service_role;
