-- S1.2: every normalized observation appends price history; raw snapshots remain hash-gated.
CREATE OR REPLACE FUNCTION public.ingest_normalized_ebay_listing(
  p_project_id UUID,
  p_source_id UUID,
  p_listing JSONB,
  p_raw_object_key TEXT,
  p_raw_content_hash TEXT,
  p_raw_schema_version TEXT
)
RETURNS TABLE(listing_id UUID, created BOOLEAN, updated BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_existing public.listings%ROWTYPE;
  v_listing_id UUID;
  v_seller_id UUID;
  v_created BOOLEAN;
  v_updated BOOLEAN;
  v_price NUMERIC(12, 2);
  v_shipping NUMERIC(12, 2);
  v_total NUMERIC(12, 2);
  v_image JSONB;
BEGIN
  IF jsonb_typeof(p_listing) IS DISTINCT FROM 'object'
    OR COALESCE(p_listing->>'externalId', '') = ''
    OR COALESCE(p_listing->>'url', '') = ''
    OR COALESCE(p_listing->>'title', '') = ''
    OR COALESCE(p_listing->>'condition', '') = ''
    OR COALESCE(p_listing->>'currency', '') !~ '^[A-Z]{3}$'
    OR COALESCE(p_listing->>'priceMinor', '') !~ '^[0-9]+$'
    OR COALESCE(p_listing->>'totalVisibleCostMinor', '') !~ '^[0-9]+$'
    OR p_raw_content_hash !~ '^[a-f0-9]{64}$'
    OR COALESCE(p_raw_object_key, '') = ''
    OR COALESCE(p_raw_schema_version, '') = ''
  THEN
    RAISE EXCEPTION 'invalid normalized listing input' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.research_projects WHERE id = p_project_id)
    OR NOT EXISTS (
      SELECT 1 FROM public.sources
      WHERE id = p_source_id AND domain = 'ebay.com' AND status = 'active'
    )
  THEN
    RAISE EXCEPTION 'project or eBay source not found' USING ERRCODE = '23503';
  END IF;

  v_price := (p_listing->>'priceMinor')::NUMERIC / 100;
  v_shipping := COALESCE((p_listing->>'shippingCostMinor')::NUMERIC / 100, 0);
  v_total := (p_listing->>'totalVisibleCostMinor')::NUMERIC / 100;
  IF v_total <> v_price + v_shipping THEN
    RAISE EXCEPTION 'invalid visible total' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_listing->'seller') = 'object' THEN
    INSERT INTO public.sellers (
      source_id, external_id, name, positive_feedback_percentage, review_count, account_type
    ) VALUES (
      p_source_id,
      p_listing->'seller'->>'externalId',
      p_listing->'seller'->>'name',
      NULLIF(p_listing->'seller'->>'positiveFeedbackPercentage', '')::NUMERIC,
      COALESCE((p_listing->'seller'->>'reviewCount')::INTEGER, 0),
      COALESCE(p_listing->'seller'->>'accountType', 'unknown')
    )
    ON CONFLICT (source_id, external_id) DO UPDATE SET
      name = EXCLUDED.name,
      positive_feedback_percentage = EXCLUDED.positive_feedback_percentage,
      review_count = EXCLUDED.review_count,
      account_type = EXCLUDED.account_type
    RETURNING id INTO v_seller_id;
  END IF;

  SELECT * INTO v_existing FROM public.listings
  WHERE source_id = p_source_id AND external_id = p_listing->>'externalId'
  FOR UPDATE;
  v_created := v_existing.id IS NULL;
  v_updated := NOT v_created AND v_existing.raw_content_hash IS DISTINCT FROM p_raw_content_hash;

  INSERT INTO public.listings (
    source_id, external_id, url, title, description, condition, currency, price,
    shipping_cost, total_visible_cost, seller_id, location, status, published_at,
    specifications, inferred_product, raw_data_path, raw_content_hash,
    raw_schema_version, raw_data_metadata
  ) VALUES (
    p_source_id, p_listing->>'externalId', p_listing->>'url', p_listing->>'title',
    COALESCE(p_listing->>'description', ''), p_listing->>'condition',
    p_listing->>'currency', v_price, v_shipping, v_total, v_seller_id,
    NULLIF(p_listing->>'location', ''), p_listing->>'status',
    NULLIF(p_listing->>'publishedAt', '')::TIMESTAMPTZ,
    COALESCE(p_listing->'specifications', '{}'::JSONB),
    p_listing->'inferredProduct', p_raw_object_key, p_raw_content_hash,
    p_raw_schema_version, COALESCE(p_listing->'rawDataMetadata', '{}'::JSONB)
  )
  ON CONFLICT (source_id, external_id) DO UPDATE SET
    url = EXCLUDED.url,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    condition = EXCLUDED.condition,
    currency = EXCLUDED.currency,
    price = EXCLUDED.price,
    shipping_cost = EXCLUDED.shipping_cost,
    total_visible_cost = EXCLUDED.total_visible_cost,
    seller_id = EXCLUDED.seller_id,
    location = EXCLUDED.location,
    status = EXCLUDED.status,
    published_at = EXCLUDED.published_at,
    specifications = EXCLUDED.specifications,
    inferred_product = EXCLUDED.inferred_product,
    raw_data_path = EXCLUDED.raw_data_path,
    raw_content_hash = EXCLUDED.raw_content_hash,
    raw_schema_version = EXCLUDED.raw_schema_version,
    raw_data_metadata = EXCLUDED.raw_data_metadata,
    last_updated_at = NOW()
  RETURNING id INTO v_listing_id;

  INSERT INTO public.research_project_listings (project_id, listing_id)
  VALUES (p_project_id, v_listing_id)
  ON CONFLICT DO NOTHING;

  IF v_created OR v_updated THEN
    INSERT INTO public.listing_snapshots (
      listing_id, title, price, shipping_cost, status, raw_object_key,
      raw_content_hash, raw_schema_version, payload_summary
    ) VALUES (
      v_listing_id, p_listing->>'title', v_price, v_shipping, p_listing->>'status',
      p_raw_object_key, p_raw_content_hash, p_raw_schema_version,
      jsonb_build_object('currency', p_listing->>'currency')
    );
  END IF;

  -- Price history is an observation series, so unchanged recollections are kept.
  INSERT INTO public.price_history (listing_id, price, shipping_cost, status)
  VALUES (v_listing_id, v_price, v_shipping, p_listing->>'status');

  FOR v_image IN SELECT value FROM jsonb_array_elements(COALESCE(p_listing->'images', '[]'))
  LOOP
    INSERT INTO public.listing_images (listing_id, url, position)
    VALUES (v_listing_id, v_image->>'url', (v_image->>'position')::INTEGER)
    ON CONFLICT (listing_id, url) DO UPDATE SET position = EXCLUDED.position;
  END LOOP;

  RETURN QUERY SELECT v_listing_id, v_created, v_updated;
END;
$$;
