-- F0: append-only observation events and semantic collector health.
-- Source payloads are untrusted JSON; service_role is the only writer.

CREATE TABLE IF NOT EXISTS public.observation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'LISTING_DISCOVERED', 'LISTING_UPDATED', 'PRICE_CHANGED',
        'DESCRIPTION_CHANGED', 'REMOVED', 'REAPPEARED',
        'MARKET_SNAPSHOT_UPDATED', 'LIQUIDITY_CHANGED', 'TREND_CHANGED',
        'COLLECTOR_DEGRADED', 'AUTH_REQUIRED', 'PROXY_DEGRADED',
        'COLLECTOR_RECOVERED'
    )),
    subject_type TEXT NOT NULL CHECK (subject_type IN ('listing', 'market', 'collector')),
    subject_external_id TEXT,
    dedupe_key TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    schema_version TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT observation_events_dedupe_key_unique UNIQUE (source_id, dedupe_key),
    CONSTRAINT observation_events_subject_check CHECK (
        subject_type <> 'listing' OR subject_external_id IS NOT NULL
    ),
    CONSTRAINT observation_events_payload_object_check CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS observation_events_source_observed_idx
    ON public.observation_events (source_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS observation_events_subject_idx
    ON public.observation_events (source_id, subject_type, subject_external_id);

CREATE TABLE IF NOT EXISTS public.collector_health_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_run_id UUID REFERENCES public.collection_runs(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL DEFAULT 0 CHECK (attempt_number >= 0),
    source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    checked_at TIMESTAMPTZ NOT NULL,
    state TEXT NOT NULL CHECK (state IN (
        'NORMAL', 'LOGIN_REQUIRED', 'CAPTCHA', 'EMPTY_RESULTS',
        'RATE_LIMITED', 'ERROR', 'MODAL_BLOCKING', 'CONTENT_CHANGED'
    )),
    ingestion_layer SMALLINT NOT NULL CHECK (ingestion_layer BETWEEN 1 AND 7),
    listing_id_percent NUMERIC(5, 2) NOT NULL CHECK (listing_id_percent BETWEEN 0 AND 100),
    price_percent NUMERIC(5, 2) NOT NULL CHECK (price_percent BETWEEN 0 AND 100),
    title_percent NUMERIC(5, 2) NOT NULL CHECK (title_percent BETWEEN 0 AND 100),
    diagnostics JSONB NOT NULL DEFAULT '[]'::JSONB
        CHECK (jsonb_typeof(diagnostics) = 'array'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT collector_health_run_attempt_state_unique
        UNIQUE (collection_run_id, attempt_number, state)
);

CREATE INDEX IF NOT EXISTS collector_health_checks_source_checked_idx
    ON public.collector_health_checks (source_id, checked_at DESC);

REVOKE ALL ON public.observation_events, public.collector_health_checks FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.observation_events, public.collector_health_checks TO service_role;

ALTER TABLE public.observation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collector_health_checks ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.record_listing_observation_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_event_type TEXT;
    v_payload JSONB;
    v_dedupe_key TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_event_type := 'LISTING_DISCOVERED';
        v_payload := jsonb_build_object(
            'listingId', NEW.id,
            'rawContentHash', NEW.raw_content_hash
        );
        v_dedupe_key := encode(extensions.digest(concat_ws(E'\x1f',
            v_event_type, NEW.source_id::TEXT, NEW.external_id,
            COALESCE(NEW.raw_content_hash, '')), 'sha256'), 'hex');
        INSERT INTO public.observation_events (
            source_id, event_type, subject_type, subject_external_id,
            dedupe_key, observed_at, schema_version, payload
        ) VALUES (
            NEW.source_id, v_event_type, 'listing', NEW.external_id,
            v_dedupe_key, NEW.first_collected_at, 'f0.events.v1', v_payload
        ) ON CONFLICT (source_id, dedupe_key) DO NOTHING;
        RETURN NEW;
    END IF;

    IF OLD.raw_content_hash IS DISTINCT FROM NEW.raw_content_hash THEN
        v_event_type := 'LISTING_UPDATED';
        v_payload := jsonb_build_object(
            'listingId', NEW.id,
            'previousRawContentHash', OLD.raw_content_hash,
            'rawContentHash', NEW.raw_content_hash
        );
        v_dedupe_key := encode(extensions.digest(concat_ws(E'\x1f',
            v_event_type, NEW.source_id::TEXT, NEW.external_id,
            COALESCE(NEW.raw_content_hash, '')), 'sha256'), 'hex');
        INSERT INTO public.observation_events (
            source_id, event_type, subject_type, subject_external_id,
            dedupe_key, observed_at, schema_version, payload
        ) VALUES (
            NEW.source_id, v_event_type, 'listing', NEW.external_id,
            v_dedupe_key, NOW(), 'f0.events.v1', v_payload
        ) ON CONFLICT (source_id, dedupe_key) DO NOTHING;
    END IF;

    IF OLD.price IS DISTINCT FROM NEW.price
        OR OLD.shipping_cost IS DISTINCT FROM NEW.shipping_cost THEN
        v_event_type := 'PRICE_CHANGED';
        v_payload := jsonb_build_object(
            'listingId', NEW.id,
            'previousPrice', OLD.price,
            'price', NEW.price,
            'previousShippingCost', OLD.shipping_cost,
            'shippingCost', NEW.shipping_cost,
            'currency', NEW.currency
        );
        v_dedupe_key := encode(extensions.digest(concat_ws(E'\x1f',
            v_event_type, NEW.source_id::TEXT, NEW.external_id,
            COALESCE(NEW.raw_content_hash, '')), 'sha256'), 'hex');
        INSERT INTO public.observation_events (
            source_id, event_type, subject_type, subject_external_id,
            dedupe_key, observed_at, schema_version, payload
        ) VALUES (
            NEW.source_id, v_event_type, 'listing', NEW.external_id,
            v_dedupe_key, NOW(), 'f0.events.v1', v_payload
        ) ON CONFLICT (source_id, dedupe_key) DO NOTHING;
    END IF;

    IF OLD.description IS DISTINCT FROM NEW.description THEN
        v_event_type := 'DESCRIPTION_CHANGED';
        v_payload := jsonb_build_object(
            'listingId', NEW.id,
            'previousRawContentHash', OLD.raw_content_hash,
            'rawContentHash', NEW.raw_content_hash
        );
        v_dedupe_key := encode(extensions.digest(concat_ws(E'\x1f',
            v_event_type, NEW.source_id::TEXT, NEW.external_id,
            COALESCE(NEW.raw_content_hash, '')), 'sha256'), 'hex');
        INSERT INTO public.observation_events (
            source_id, event_type, subject_type, subject_external_id,
            dedupe_key, observed_at, schema_version, payload
        ) VALUES (
            NEW.source_id, v_event_type, 'listing', NEW.external_id,
            v_dedupe_key, NOW(), 'f0.events.v1', v_payload
        ) ON CONFLICT (source_id, dedupe_key) DO NOTHING;
    END IF;

    IF OLD.status = 'active' AND NEW.status <> 'active' THEN
        v_event_type := 'REMOVED';
    ELSIF OLD.status <> 'active' AND NEW.status = 'active' THEN
        v_event_type := 'REAPPEARED';
    ELSE
        v_event_type := NULL;
    END IF;
    IF v_event_type IS NOT NULL THEN
        v_payload := jsonb_build_object(
            'listingId', NEW.id,
            'previousStatus', OLD.status,
            'status', NEW.status
        );
        v_dedupe_key := encode(extensions.digest(concat_ws(E'\x1f',
            v_event_type, NEW.source_id::TEXT, NEW.external_id,
            COALESCE(NEW.raw_content_hash, '')), 'sha256'), 'hex');
        INSERT INTO public.observation_events (
            source_id, event_type, subject_type, subject_external_id,
            dedupe_key, observed_at, schema_version, payload
        ) VALUES (
            NEW.source_id, v_event_type, 'listing', NEW.external_id,
            v_dedupe_key, NOW(), 'f0.events.v1', v_payload
        ) ON CONFLICT (source_id, dedupe_key) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_listing_observation_events() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_listing_observation_events() TO service_role;

DROP TRIGGER IF EXISTS listings_observation_events_trigger ON public.listings;
CREATE TRIGGER listings_observation_events_trigger
AFTER INSERT OR UPDATE ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.record_listing_observation_events();

CREATE OR REPLACE FUNCTION public.complete_collection_run_with_health(
    p_run_id UUID,
    p_items_found INTEGER,
    p_items_created INTEGER,
    p_items_updated INTEGER,
    p_provider TEXT,
    p_health JSONB
)
RETURNS SETOF public.collection_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_run public.collection_runs%ROWTYPE;
BEGIN
    IF p_items_found < 0 OR p_items_created < 0 OR p_items_updated < 0
        OR COALESCE(p_provider, '') = ''
        OR jsonb_typeof(p_health) IS DISTINCT FROM 'object'
        OR COALESCE(p_health->>'state', '') = ''
        OR COALESCE(p_health->>'ingestionLayer', '') !~ '^[1-7]$'
        OR jsonb_typeof(p_health->'completeness') IS DISTINCT FROM 'object'
        OR jsonb_typeof(COALESCE(p_health->'diagnostics', '[]'::JSONB)) IS DISTINCT FROM 'array'
    THEN
        RAISE EXCEPTION 'invalid collection completion health' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_run FROM public.collection_runs
    WHERE id = p_run_id FOR UPDATE;
    IF v_run.id IS NULL OR v_run.status NOT IN ('running', 'completed') THEN
        RETURN;
    END IF;

    INSERT INTO public.collector_health_checks (
        collection_run_id, attempt_number, source_id, provider, checked_at, state,
        ingestion_layer, listing_id_percent, price_percent, title_percent,
        diagnostics
    ) VALUES (
        v_run.id,
        v_run.attempt_count,
        v_run.source_id,
        p_provider,
        COALESCE(NULLIF(p_health->>'checkedAt', '')::TIMESTAMPTZ, NOW()),
        p_health->>'state',
        (p_health->>'ingestionLayer')::SMALLINT,
        (p_health->'completeness'->>'listingIdPercent')::NUMERIC,
        (p_health->'completeness'->>'pricePercent')::NUMERIC,
        (p_health->'completeness'->>'titlePercent')::NUMERIC,
        COALESCE(p_health->'diagnostics', '[]'::JSONB)
    ) ON CONFLICT (collection_run_id, attempt_number, state) DO NOTHING;

    IF v_run.status = 'running' THEN
        UPDATE public.collection_runs SET
            status = 'completed',
            finished_at = NOW(),
            lease_expires_at = NULL,
            items_found = p_items_found,
            items_created = p_items_created,
            items_updated = p_items_updated,
            provider = p_provider,
            error = NULL,
            error_kind = NULL,
            error_code = NULL
        WHERE id = p_run_id;
    END IF;

    RETURN QUERY SELECT * FROM public.collection_runs WHERE id = p_run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_collection_run_with_health(
    UUID, INTEGER, INTEGER, INTEGER, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_collection_run_with_health(
    UUID, INTEGER, INTEGER, INTEGER, TEXT, JSONB
) TO service_role;

CREATE OR REPLACE FUNCTION public.transition_collection_run_failure_with_health(
    p_run_id UUID,
    p_terminal BOOLEAN,
    p_error TEXT,
    p_error_kind TEXT,
    p_error_code TEXT,
    p_health JSONB
)
RETURNS SETOF public.collection_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_run public.collection_runs%ROWTYPE;
BEGIN
    IF COALESCE(p_error, '') = ''
        OR p_error_kind NOT IN ('transient', 'permanent')
        OR COALESCE(p_error_code, '') = ''
        OR jsonb_typeof(p_health) IS DISTINCT FROM 'object'
        OR COALESCE(p_health->>'state', '') = ''
        OR COALESCE(p_health->>'ingestionLayer', '') !~ '^[1-7]$'
        OR jsonb_typeof(p_health->'completeness') IS DISTINCT FROM 'object'
        OR jsonb_typeof(COALESCE(p_health->'diagnostics', '[]'::JSONB)) IS DISTINCT FROM 'array'
    THEN
        RAISE EXCEPTION 'invalid collection failure health' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_run FROM public.collection_runs
    WHERE id = p_run_id AND status = 'running' FOR UPDATE;
    IF v_run.id IS NULL THEN
        RETURN;
    END IF;

    INSERT INTO public.collector_health_checks (
        collection_run_id, attempt_number, source_id, provider, checked_at, state,
        ingestion_layer, listing_id_percent, price_percent, title_percent,
        diagnostics
    ) VALUES (
        v_run.id,
        v_run.attempt_count,
        v_run.source_id,
        v_run.provider,
        COALESCE(NULLIF(p_health->>'checkedAt', '')::TIMESTAMPTZ, NOW()),
        p_health->>'state',
        (p_health->>'ingestionLayer')::SMALLINT,
        (p_health->'completeness'->>'listingIdPercent')::NUMERIC,
        (p_health->'completeness'->>'pricePercent')::NUMERIC,
        (p_health->'completeness'->>'titlePercent')::NUMERIC,
        COALESCE(p_health->'diagnostics', '[]'::JSONB)
    ) ON CONFLICT (collection_run_id, attempt_number, state) DO NOTHING;

    UPDATE public.collection_runs SET
        status = CASE WHEN p_terminal THEN 'failed' ELSE 'pending' END,
        finished_at = CASE WHEN p_terminal THEN NOW() ELSE NULL END,
        lease_expires_at = NULL,
        error = p_error,
        error_kind = p_error_kind,
        error_code = p_error_code
    WHERE id = p_run_id;

    RETURN QUERY SELECT * FROM public.collection_runs WHERE id = p_run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_collection_run_failure_with_health(
    UUID, BOOLEAN, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_collection_run_failure_with_health(
    UUID, BOOLEAN, TEXT, TEXT, TEXT, JSONB
) TO service_role;
