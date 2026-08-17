-- F1 reference sources. Live credentials and production collection remain disabled.
INSERT INTO public.sources (
  id, name, domain, country, currency, connector_type, status
)
VALUES
  (
    '00000000-0000-4000-a000-000000000002',
    'Mercado Livre Brasil',
    'mercadolivre.com.br',
    'BR',
    'BRL',
    'official_api',
    'active'
  ),
  (
    '00000000-0000-4000-a000-000000000003',
    'Xianyu',
    'goofish.com',
    'CN',
    'CNY',
    'mock',
    'maintenance'
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  domain = EXCLUDED.domain,
  country = EXCLUDED.country,
  currency = EXCLUDED.currency,
  connector_type = EXCLUDED.connector_type,
  status = EXCLUDED.status,
  updated_at = NOW();
