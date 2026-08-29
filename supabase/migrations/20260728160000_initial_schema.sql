-- Project Scout Canonical Database Schema Migration
-- Migration ID: 20260728160000_initial_schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    plan TEXT NOT NULL DEFAULT 'free',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Sources Table
CREATE TABLE IF NOT EXISTS sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    domain TEXT NOT NULL,
    country VARCHAR(2) NOT NULL DEFAULT 'US',
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    connector_type TEXT NOT NULL CHECK (connector_type IN ('official_api', 'scraping_provider', 'mock')),
    status TEXT NOT NULL DEFAULT 'active',
    capabilities JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Research Projects Table
CREATE TABLE IF NOT EXISTS research_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    natural_language_query TEXT NOT NULL,
    structured_query JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Research Project Criteria Table
CREATE TABLE IF NOT EXISTS research_project_criteria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
    accepted_defects TEXT[] DEFAULT '{}',
    rejected_defects TEXT[] DEFAULT '{}',
    preferred_evidence TEXT[] DEFAULT '{}',
    max_price_brl NUMERIC(12, 2) NOT NULL CHECK (max_price_brl > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Sellers Table
CREATE TABLE IF NOT EXISTS sellers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    name TEXT NOT NULL,
    rating NUMERIC(3, 2),
    positive_feedback_percentage NUMERIC(5, 2) CHECK (positive_feedback_percentage >= 0 AND positive_feedback_percentage <= 100),
    review_count INT NOT NULL DEFAULT 0,
    location TEXT,
    account_type TEXT NOT NULL DEFAULT 'unknown',
    raw_data_metadata JSONB,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT sellers_source_external_unique UNIQUE(source_id, external_id)
);

-- 6. Listings Table
CREATE TABLE IF NOT EXISTS listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    condition TEXT NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    shipping_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (shipping_cost >= 0),
    total_visible_cost NUMERIC(12, 2) NOT NULL CHECK (total_visible_cost >= 0),
    seller_id UUID REFERENCES sellers(id) ON DELETE SET NULL,
    location TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'out_of_stock')),
    published_at TIMESTAMPTZ,
    first_collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    specifications JSONB NOT NULL DEFAULT '{}',
    inferred_product JSONB,
    raw_data_path TEXT NOT NULL,
    raw_content_hash TEXT,
    raw_schema_version TEXT DEFAULT '1.0',
    raw_data_metadata JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT listings_source_external_unique UNIQUE(source_id, external_id)
);

-- 7. Research Project Listings Junction Table
CREATE TABLE IF NOT EXISTS research_project_listings (
    project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (project_id, listing_id)
);

-- 8. Listing Images Table
CREATE TABLE IF NOT EXISTS listing_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    storage_path TEXT,
    position INT NOT NULL DEFAULT 0,
    hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Listing Snapshots Table
CREATE TABLE IF NOT EXISTS listing_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    shipping_cost NUMERIC(12, 2) NOT NULL CHECK (shipping_cost >= 0),
    status TEXT NOT NULL,
    raw_object_key TEXT NOT NULL,
    raw_content_hash TEXT NOT NULL,
    raw_schema_version TEXT NOT NULL DEFAULT '1.0',
    payload_summary JSONB NOT NULL DEFAULT '{}',
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Price History Table
CREATE TABLE IF NOT EXISTS price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    shipping_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (shipping_cost >= 0),
    status TEXT NOT NULL,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Collection Runs Table
CREATE TABLE IF NOT EXISTS collection_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    items_found INT NOT NULL DEFAULT 0,
    items_created INT NOT NULL DEFAULT 0,
    items_updated INT NOT NULL DEFAULT 0,
    estimated_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    provider TEXT NOT NULL,
    error TEXT
);

-- 12. Products Table
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,
    brand TEXT NOT NULL,
    model TEXT NOT NULL,
    variant TEXT,
    release_year INT,
    specifications JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. Listing Product Matches Table
CREATE TABLE IF NOT EXISTS listing_product_matches (
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    confidence NUMERIC(3, 2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    extraction_source TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (listing_id, product_id)
);

-- 14. Analysis Runs Table
CREATE TABLE IF NOT EXISTS analysis_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    model_name TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    tokens_used INT NOT NULL DEFAULT 0,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. Evidence Table
CREATE TABLE IF NOT EXISTS evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    evidence_type TEXT NOT NULL CHECK (evidence_type IN ('functional_state', 'cosmetic_defect', 'missing_part', 'inconsistency')),
    assessment_kind TEXT NOT NULL DEFAULT 'fact' CHECK (assessment_kind IN ('fact', 'inference', 'unknown')),
    source_type TEXT NOT NULL CHECK (source_type IN ('seller_declared', 'title', 'description', 'image', 'structured_data', 'system_inferred', 'user_confirmed')),
    source_reference TEXT NOT NULL,
    claim TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('confirmed_working', 'probably_working', 'possibly_working', 'unknown', 'probably_defective', 'confirmed_defective')),
    confidence NUMERIC(3, 2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    explanation TEXT NOT NULL,
    limitations TEXT[] DEFAULT '{}',
    severity TEXT NOT NULL CHECK (severity IN ('none', 'low', 'medium', 'high', 'critical')),
    model_name TEXT,
    prompt_version TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. Defects Table
CREATE TABLE IF NOT EXISTS defects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    component TEXT NOT NULL,
    defect_type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('declared', 'visible', 'inferred', 'unknown')),
    confidence NUMERIC(3, 2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    declared BOOLEAN NOT NULL DEFAULT FALSE,
    visible BOOLEAN NOT NULL DEFAULT FALSE,
    inferred BOOLEAN NOT NULL DEFAULT FALSE,
    estimated_repair_cost NUMERIC(12, 2) CHECK (estimated_repair_cost >= 0),
    repair_cost_currency VARCHAR(3) NOT NULL DEFAULT 'BRL',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 17. Defect Evidence Junction Table
CREATE TABLE IF NOT EXISTS defect_evidence (
    defect_id UUID NOT NULL REFERENCES defects(id) ON DELETE CASCADE,
    evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    PRIMARY KEY (defect_id, evidence_id)
);

-- 18. Scores Table
CREATE TABLE IF NOT EXISTS scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    analysis_run_id UUID REFERENCES analysis_runs(id) ON DELETE SET NULL,
    query_match_score NUMERIC(5, 2) NOT NULL CHECK (query_match_score >= 0 AND query_match_score <= 100),
    technical_risk_score NUMERIC(5, 2) NOT NULL CHECK (technical_risk_score >= 0 AND technical_risk_score <= 100),
    fraud_risk_score NUMERIC(5, 2) NOT NULL CHECK (fraud_risk_score >= 0 AND fraud_risk_score <= 100),
    evidence_quality_score NUMERIC(5, 2) NOT NULL CHECK (evidence_quality_score >= 0 AND evidence_quality_score <= 100),
    price_score NUMERIC(5, 2) NOT NULL CHECK (price_score >= 0 AND price_score <= 100),
    opportunity_score NUMERIC(5, 2) NOT NULL CHECK (opportunity_score >= 0 AND opportunity_score <= 100),
    score_factors JSONB NOT NULL DEFAULT '{}',
    formula_version TEXT NOT NULL DEFAULT '1.0.0',
    explanation TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 19. User Listing Actions Table
CREATE TABLE IF NOT EXISTS user_listing_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
    favorite BOOLEAN NOT NULL DEFAULT FALSE,
    decision TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending', 'approved', 'rejected', 'purchased')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_listing_project_unique UNIQUE(user_id, listing_id, project_id)
);

-- 20. Purchase Outcomes Table
CREATE TABLE IF NOT EXISTS purchase_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    purchase_price NUMERIC(12, 2) NOT NULL CHECK (purchase_price >= 0),
    actual_defects TEXT[] DEFAULT '{}',
    actual_repair_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (actual_repair_cost >= 0),
    sale_price NUMERIC(12, 2) CHECK (sale_price >= 0),
    outcome TEXT CHECK (outcome IN ('profit', 'loss', 'break_even', 'kept_personal')),
    user_rating INT CHECK (user_rating >= 1 AND user_rating <= 5),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================================
-- LEAST-PRIVILEGE GRANTS & ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================================

-- Schema Usage
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Supabase local bootstrap may install broad default table privileges. Start
-- this schema from the least-privilege baseline before adding the grants below.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- 1. Role: anon (No access in the internal MVP)
-- No table privileges are granted to anon. All marketplace reads require an authenticated user.

-- 2. Role: authenticated (Protected User Tables + Read-Only Shared Marketplace Data)
-- User Private Tables: Full CRUD granted to authenticated, BUT strictly constrained by RLS policies
GRANT SELECT, INSERT, UPDATE, DELETE ON profiles, research_projects, research_project_criteria, research_project_listings, collection_runs, user_listing_actions, purchase_outcomes TO authenticated;

-- Shared Marketplace Tables: SELECT ONLY for authenticated (NO WRITE ACCESS for end users)
GRANT SELECT ON sources, sellers, listings, listing_images, listing_snapshots, price_history, products, listing_product_matches, analysis_runs, evidence, defects, defect_evidence, scores TO authenticated;

-- 3. Role: service_role (Full System Access for Background Worker Pipelines)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

-- ENABLE ROW LEVEL SECURITY ON ALL USER TABLES
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_project_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_project_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_listing_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_outcomes ENABLE ROW LEVEL SECURITY;

-- 1. Profiles: Own row access
CREATE POLICY profiles_owner_policy ON profiles
    FOR ALL
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- 2. Research Projects: Owner project access
CREATE POLICY research_projects_owner_policy ON research_projects
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 3. Research Project Criteria: Owner project criteria access
CREATE POLICY research_project_criteria_owner_policy ON research_project_criteria
    FOR ALL
    TO authenticated
    USING (EXISTS (SELECT 1 FROM research_projects rp WHERE rp.id = project_id AND rp.user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM research_projects rp WHERE rp.id = project_id AND rp.user_id = auth.uid()));

-- 4. Research Project Listings: Owner project listings access
CREATE POLICY research_project_listings_owner_policy ON research_project_listings
    FOR ALL
    TO authenticated
    USING (EXISTS (SELECT 1 FROM research_projects rp WHERE rp.id = project_id AND rp.user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM research_projects rp WHERE rp.id = project_id AND rp.user_id = auth.uid()));

-- 5. Collection Runs: Owner project runs access
CREATE POLICY collection_runs_owner_policy ON collection_runs
    FOR ALL
    TO authenticated
    USING (EXISTS (SELECT 1 FROM research_projects rp WHERE rp.id = project_id AND rp.user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM research_projects rp WHERE rp.id = project_id AND rp.user_id = auth.uid()));

-- 6. User Listing Actions: Owner user + project + listing link access
CREATE POLICY user_listing_actions_owner_policy ON user_listing_actions
    FOR ALL
    TO authenticated
    USING (
        auth.uid() = user_id AND
        EXISTS (SELECT 1 FROM research_projects rp WHERE rp.id = project_id AND rp.user_id = auth.uid()) AND
        EXISTS (SELECT 1 FROM research_project_listings rpl WHERE rpl.project_id = project_id AND rpl.listing_id = listing_id)
    )
    WITH CHECK (
        auth.uid() = user_id AND
        EXISTS (SELECT 1 FROM research_projects rp WHERE rp.id = project_id AND rp.user_id = auth.uid()) AND
        EXISTS (SELECT 1 FROM research_project_listings rpl WHERE rpl.project_id = project_id AND rpl.listing_id = listing_id)
    );

-- 7. Purchase Outcomes: Owner user outcomes access
CREATE POLICY purchase_outcomes_owner_policy ON purchase_outcomes
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ENABLE ROW LEVEL SECURITY ON SHARED MARKETPLACE TABLES
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_product_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE defects ENABLE ROW LEVEL SECURITY;
ALTER TABLE defect_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY shared_sources_read ON sources FOR SELECT TO authenticated USING (true);
CREATE POLICY shared_sellers_read ON sellers FOR SELECT TO authenticated USING (true);
CREATE POLICY shared_listings_read ON listings FOR SELECT TO authenticated USING (true);
CREATE POLICY shared_listing_images_read ON listing_images FOR SELECT TO authenticated USING (true);
CREATE POLICY shared_listing_snapshots_read ON listing_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY shared_price_history_read ON price_history FOR SELECT TO authenticated USING (true);
CREATE POLICY shared_products_read ON products FOR SELECT TO authenticated USING (true);
CREATE POLICY shared_listing_product_matches_read ON listing_product_matches FOR SELECT TO authenticated USING (true);
CREATE POLICY shared_analysis_runs_read ON analysis_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY shared_evidence_read ON evidence FOR SELECT TO authenticated USING (true);
CREATE POLICY shared_defects_read ON defects FOR SELECT TO authenticated USING (true);
CREATE POLICY shared_defect_evidence_read ON defect_evidence FOR SELECT TO authenticated USING (true);
CREATE POLICY shared_scores_read ON scores FOR SELECT TO authenticated USING (true);
