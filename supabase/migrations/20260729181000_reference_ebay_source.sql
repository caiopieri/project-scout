-- Canonical eBay source required by collection RPCs in every environment.
-- This is reference configuration, not demo/fixture data.
INSERT INTO public.sources (
  id,
  name,
  domain,
  country,
  currency,
  connector_type,
  status
)
VALUES (
  '00000000-0000-4000-a000-000000000001',
  'eBay US',
  'ebay.com',
  'US',
  'USD',
  'official_api',
  'active'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  domain = EXCLUDED.domain,
  country = EXCLUDED.country,
  currency = EXCLUDED.currency,
  connector_type = EXCLUDED.connector_type,
  status = EXCLUDED.status,
  updated_at = NOW();
