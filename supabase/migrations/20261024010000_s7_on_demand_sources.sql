-- S7: on-demand sources. A pasted URL gets a source per domain (identity stays
-- (source_id, external_id)); every extraction is audited with who confirmed the site's terms.
CREATE OR REPLACE FUNCTION public.ensure_on_demand_source(p_domain TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_domain !~ '^[a-z0-9.-]{3,253}(:[0-9]{1,5})?$' THEN
    RAISE EXCEPTION 'invalid domain' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_id FROM public.sources WHERE domain = p_domain ORDER BY created_at LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.sources (name, domain, country, currency, connector_type, status, capabilities)
    VALUES (p_domain, p_domain, 'US', 'USD', 'scraping_provider', 'active', '{"onDemand": true}'::JSONB)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_on_demand_source(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_on_demand_source(TEXT) TO service_role;

CREATE TABLE IF NOT EXISTS public.on_demand_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.research_projects(id) ON DELETE CASCADE,
  source_id UUID REFERENCES public.sources(id),
  url TEXT NOT NULL,
  terms_confirmed BOOLEAN NOT NULL,
  method TEXT,
  documents INTEGER NOT NULL DEFAULT 0,
  dropped_unverified INTEGER NOT NULL DEFAULT 0,
  items_created INTEGER NOT NULL DEFAULT 0,
  items_updated INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.on_demand_extractions ENABLE ROW LEVEL SECURITY;
CREATE POLICY on_demand_extractions_owner_read ON public.on_demand_extractions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
GRANT SELECT ON public.on_demand_extractions TO authenticated;
GRANT SELECT, INSERT ON public.on_demand_extractions TO service_role;
