-- Marco 6.1: durable, least-privilege eBay marketplace account deletion processing.
CREATE TABLE public.ebay_account_deletion_requests (
  notification_id TEXT PRIMARY KEY CHECK (length(notification_id) BETWEEN 1 AND 128),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  matched_sellers INTEGER NOT NULL DEFAULT 0 CHECK (matched_sellers >= 0),
  matched_listings INTEGER NOT NULL DEFAULT 0 CHECK (matched_listings >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT ebay_deletion_completion_consistency CHECK (
    (status = 'pending' AND completed_at IS NULL)
    OR (status = 'completed' AND completed_at IS NOT NULL)
  )
);

ALTER TABLE public.ebay_account_deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ebay_account_deletion_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ebay_account_deletion_requests TO service_role;

CREATE OR REPLACE FUNCTION public.prepare_ebay_account_deletion(
  p_notification_id TEXT,
  p_username TEXT,
  p_user_id TEXT,
  p_eias_token TEXT
)
RETURNS TABLE(
  already_completed BOOLEAN,
  raw_object_keys TEXT[],
  image_object_keys TEXT[],
  matched_sellers INTEGER,
  matched_listings INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_identifiers TEXT[] := array_remove(ARRAY[
    nullif(btrim(p_username), ''), nullif(btrim(p_user_id), ''), nullif(btrim(p_eias_token), '')
  ], NULL);
  v_status TEXT;
  v_raw_keys TEXT[];
  v_image_keys TEXT[];
  v_seller_count INTEGER;
  v_listing_count INTEGER;
BEGIN
  IF p_notification_id IS NULL OR length(p_notification_id) NOT BETWEEN 1 AND 128
    OR cardinality(v_identifiers) = 0
  THEN
    RAISE EXCEPTION 'invalid eBay account deletion input' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.ebay_account_deletion_requests (notification_id)
  VALUES (p_notification_id)
  ON CONFLICT (notification_id) DO UPDATE SET
    attempt_count = public.ebay_account_deletion_requests.attempt_count + 1,
    updated_at = NOW()
  RETURNING status INTO v_status;

  SELECT matched_sellers, matched_listings
  INTO v_seller_count, v_listing_count
  FROM public.ebay_account_deletion_requests
  WHERE notification_id = p_notification_id;

  IF v_status = 'completed' THEN
    RETURN QUERY SELECT TRUE, ARRAY[]::TEXT[], ARRAY[]::TEXT[], v_seller_count, v_listing_count;
    RETURN;
  END IF;

  SELECT count(DISTINCT s.id)::INTEGER, count(DISTINCT l.id)::INTEGER
  INTO v_seller_count, v_listing_count
  FROM public.sellers s
  JOIN public.sources src ON src.id = s.source_id AND src.domain = 'ebay.com'
  LEFT JOIN public.listings l ON l.seller_id = s.id
  WHERE s.external_id = ANY(v_identifiers);

  SELECT coalesce(array_agg(DISTINCT object_key), ARRAY[]::TEXT[])
  INTO v_raw_keys
  FROM (
    SELECT l.raw_data_path AS object_key
    FROM public.listings l
    JOIN public.sellers s ON s.id = l.seller_id
    JOIN public.sources src ON src.id = s.source_id AND src.domain = 'ebay.com'
    WHERE s.external_id = ANY(v_identifiers)
    UNION
    SELECT snapshot.raw_object_key
    FROM public.listing_snapshots snapshot
    JOIN public.listings l ON l.id = snapshot.listing_id
    JOIN public.sellers s ON s.id = l.seller_id
    JOIN public.sources src ON src.id = s.source_id AND src.domain = 'ebay.com'
    WHERE s.external_id = ANY(v_identifiers)
  ) objects
  WHERE object_key IS NOT NULL AND object_key <> '';

  SELECT coalesce(array_agg(DISTINCT image.storage_path), ARRAY[]::TEXT[])
  INTO v_image_keys
  FROM public.listing_images image
  JOIN public.listings l ON l.id = image.listing_id
  JOIN public.sellers s ON s.id = l.seller_id
  JOIN public.sources src ON src.id = s.source_id AND src.domain = 'ebay.com'
  WHERE s.external_id = ANY(v_identifiers)
    AND image.storage_path IS NOT NULL AND image.storage_path <> '';

  UPDATE public.ebay_account_deletion_requests SET
    matched_sellers = v_seller_count,
    matched_listings = v_listing_count,
    updated_at = NOW()
  WHERE notification_id = p_notification_id;

  RETURN QUERY SELECT FALSE, v_raw_keys, v_image_keys, v_seller_count, v_listing_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_ebay_account_deletion(
  p_notification_id TEXT,
  p_username TEXT,
  p_user_id TEXT,
  p_eias_token TEXT
)
RETURNS TABLE(completed BOOLEAN, matched_sellers INTEGER, matched_listings INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_identifiers TEXT[] := array_remove(ARRAY[
    nullif(btrim(p_username), ''), nullif(btrim(p_user_id), ''), nullif(btrim(p_eias_token), '')
  ], NULL);
  v_seller_count INTEGER;
  v_listing_count INTEGER;
BEGIN
  IF cardinality(v_identifiers) = 0 OR NOT EXISTS (
    SELECT 1 FROM public.ebay_account_deletion_requests WHERE notification_id = p_notification_id
  ) THEN
    RAISE EXCEPTION 'eBay account deletion was not prepared' USING ERRCODE = '22023';
  END IF;

  SELECT requests.matched_sellers, requests.matched_listings
  INTO v_seller_count, v_listing_count
  FROM public.ebay_account_deletion_requests requests
  WHERE requests.notification_id = p_notification_id
  FOR UPDATE;

  DELETE FROM public.listings listing
  USING public.sellers seller, public.sources source
  WHERE listing.seller_id = seller.id
    AND seller.source_id = source.id AND source.domain = 'ebay.com'
    AND seller.external_id = ANY(v_identifiers);

  DELETE FROM public.sellers seller
  USING public.sources source
  WHERE seller.source_id = source.id AND source.domain = 'ebay.com'
    AND seller.external_id = ANY(v_identifiers);

  UPDATE public.ebay_account_deletion_requests SET
    status = 'completed', completed_at = coalesce(completed_at, NOW()), updated_at = NOW()
  WHERE notification_id = p_notification_id;

  RETURN QUERY SELECT TRUE, v_seller_count, v_listing_count;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_ebay_account_deletion(TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_ebay_account_deletion(TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_ebay_account_deletion(TEXT, TEXT, TEXT, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_ebay_account_deletion(TEXT, TEXT, TEXT, TEXT)
  TO service_role;
