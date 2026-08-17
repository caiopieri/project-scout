-- Project Scout Seed Data
-- Seed file executed automatically by `npx supabase db reset`

-- 1. Insert Auth Users reproducibly into Supabase GoTrue auth.users
INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-4111-a111-111111111111',
    'authenticated',
    'authenticated',
    'userA@example.com',
    '$2a$10$111111111111111111111uG1.aX.4qX4qX4qX4qX4qX4qX4qX4q',
    NOW(),
    NULL,
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"name":"User A"}',
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    '99999999-9999-4999-a999-999999999999',
    'authenticated',
    'authenticated',
    'userB@example.com',
    '$2a$10$999999999999999999999uG1.aX.4qX4qX4qX4qX4qX4qX4qX4q',
    NOW(),
    NULL,
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"name":"User B"}',
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
) ON CONFLICT (id) DO NOTHING;

-- 2. Insert Profiles
INSERT INTO public.profiles (id, email, name, plan) VALUES
('11111111-1111-4111-a111-111111111111', 'userA@example.com', 'User A (Tech Buyer)', 'pro'),
('99999999-9999-4999-a999-999999999999', 'userB@example.com', 'User B (Refurbisher)', 'free')
ON CONFLICT (id) DO NOTHING;

-- 3. Insert Official Source (eBay)
INSERT INTO public.sources (id, name, domain, country, currency, connector_type, status) VALUES
('00000000-0000-4000-a000-000000000001', 'eBay US', 'ebay.com', 'US', 'USD', 'official_api', 'active')
ON CONFLICT (id) DO NOTHING;

-- 4. Insert Research Project for User A & User B
INSERT INTO public.research_projects (
  id, user_id, name, description, category, natural_language_query, structured_query, status,
  taxonomy_version, interpreter_provider, interpreter_model, interpreter_version,
  interpreted_at, interpretation_confidence, interpretation_ambiguities, interpretation_warnings, unidentified_fields
) VALUES
('33333333-3333-4333-a333-333333333333', '11111111-1111-4111-a111-111111111111', 'iPhone 13 para reparo', 'Candidatos reparáveis com risco técnico controlado.', 'smartphone', 'iPhone 13 128 GB com tela quebrada até R$ 1.800.', '{"category":"smartphone","brands":["Apple"],"models":["iPhone 13"],"variants":[],"storageGb":[128],"memoryGb":[],"maximumPrice":{"amountMinor":180000,"currency":"BRL"},"acceptedDefects":["cracked_screen"],"rejectedDefects":["activation_lock","logic_board_failure","no_power"],"acceptedConditions":["for_repair"],"countries":[],"regions":[],"requiredFunctionalStates":[{"component":"device","minimumStatus":"probably_working"}],"preferredEvidence":["device_powered_on"],"additionalKeywords":[],"excludedKeywords":[]}', 'active', '1.0.0', 'deterministic', 'rules-pt-BR', '1.0.0', NOW(), 0.91, '[]', '[]', '[]'),
('44444444-4444-4444-a444-444444444444', '99999999-9999-4999-a999-999999999999', 'User B Project', 'User B private project', 'laptop', 'MacBook Pro 16 com 64 GB até USD 2.000.', '{"category":"laptop","brands":["Apple"],"models":["MacBook Pro 16"],"variants":[],"storageGb":[],"memoryGb":[64],"maximumPrice":{"amountMinor":200000,"currency":"USD"},"acceptedDefects":[],"rejectedDefects":[],"acceptedConditions":["used"],"countries":[],"regions":[],"requiredFunctionalStates":[],"preferredEvidence":[],"additionalKeywords":[],"excludedKeywords":[]}', 'active', '1.0.0', 'deterministic', 'rules-pt-BR', '1.0.0', NOW(), 0.88, '[]', '[]', '[]')
ON CONFLICT (id) DO NOTHING;

-- 5. Insert Project Criteria
INSERT INTO public.research_project_criteria (id, project_id, accepted_defects, rejected_defects, max_price_brl) VALUES
('55555555-5555-4555-a555-555555555555', '33333333-3333-4333-a333-333333333333', ARRAY['cracked_screen', 'bad_battery'], ARRAY['icloud_locked', 'water_damage'], 2500.00)
ON CONFLICT (id) DO NOTHING;

-- 6. Insert Sellers (5+ sellers)
INSERT INTO public.sellers (id, source_id, external_id, name, rating, positive_feedback_percentage, review_count, account_type) VALUES
('a0000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001', 'seller_ebay_pro_us', 'TechDealsUS', 4.95, 99.4, 15400, 'business'),
('a0000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000001', 'seller_parts_hub', 'PartsHubDirect', 4.88, 98.1, 8200, 'business'),
('a0000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000001', 'seller_refurb_guru', 'RefurbGuru', 4.75, 97.0, 3100, 'private'),
('a0000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000001', 'seller_gadget_salvage', 'GadgetSalvageStore', 4.90, 99.0, 12000, 'business'),
('a0000000-0000-4000-a000-000000000005', '00000000-0000-4000-a000-000000000001', 'seller_overstock_liquidators', 'OverstockLiquidators', 4.65, 95.5, 450, 'private')
ON CONFLICT (id) DO NOTHING;

-- 7. Insert Listings (5+ Edge Case Listings)
INSERT INTO public.listings (id, source_id, external_id, url, title, description, condition, currency, price, shipping_cost, total_visible_cost, seller_id, location, status, raw_data_path) VALUES
('22222222-2222-4222-a222-222222222222', '00000000-0000-4000-a000-000000000001', 'v1|123456789|0', 'https://www.ebay.com/itm/123456789', 'Apple iPhone 13 - 128GB - Blue (For parts, cracked front screen)', 'Selling an Apple iPhone 13 128GB Blue. Device powers on, connects to iTunes, FaceID works, logic board is 100% functional and unlinked. Front glass is cracked. Perfect for repair.', 'For parts or not working', 'USD', 180.00, 15.00, 195.00, 'a0000000-0000-4000-a000-000000000001', 'San Jose, CA', 'active', 'raw/ebay/123456789.json'),
('22222222-2222-4222-a222-222222222223', '00000000-0000-4000-a000-000000000001', 'v1|123456790|0', 'https://www.ebay.com/itm/123456790', 'Apple iPhone 13 - 256GB - Midnight (For parts - Bad Battery)', 'Powers on when plugged in. Battery health 50%, needs battery swap. Screen pristine condition.', 'For parts or not working', 'USD', 220.00, 10.00, 230.00, 'a0000000-0000-4000-a000-000000000002', 'Dallas, TX', 'active', 'raw/ebay/123456790.json'),
('22222222-2222-4222-a222-222222222224', '00000000-0000-4000-a000-000000000001', 'v1|123456791|0', 'https://www.ebay.com/itm/123456791', 'Apple iPhone 13 - 128GB - Pink (Water Damage / No Power)', 'Device fell in pool, does not power on. Board is corroded. Sold strictly AS-IS for components.', 'For parts or not working', 'USD', 90.00, 12.00, 102.00, 'a0000000-0000-4000-a000-000000000003', 'Miami, FL', 'active', 'raw/ebay/123456791.json'),
('22222222-2222-4222-a222-222222222225', '00000000-0000-4000-a000-000000000001', 'v1|123456792|0', 'https://www.ebay.com/itm/123456792', 'Apple iPhone 13 - 128GB - Starlight (iCloud Locked)', 'Clean physical condition, but iCloud activation lock enabled. For parts only.', 'For parts or not working', 'USD', 110.00, 10.00, 120.00, 'a0000000-0000-4000-a000-000000000004', 'Chicago, IL', 'active', 'raw/ebay/123456792.json'),
('22222222-2222-4222-a222-222222222226', '00000000-0000-4000-a000-000000000001', 'v1|123456793|0', 'https://www.ebay.com/itm/123456793', 'Apple iPhone 13 - 512GB - Red (Back Glass Shattered)', 'Everything works including screen and board. Rear glass is completely shattered.', 'For parts or not working', 'USD', 250.00, 20.00, 270.00, 'a0000000-0000-4000-a000-000000000005', 'Seattle, WA', 'active', 'raw/ebay/123456793.json')
ON CONFLICT (id) DO NOTHING;

-- 8. Insert Project Listing Junction Links
INSERT INTO public.research_project_listings (project_id, listing_id) VALUES
('33333333-3333-4333-a333-333333333333', '22222222-2222-4222-a222-222222222222'),
('33333333-3333-4333-a333-333333333333', '22222222-2222-4222-a222-222222222223'),
('33333333-3333-4333-a333-333333333333', '22222222-2222-4222-a222-222222222224'),
('33333333-3333-4333-a333-333333333333', '22222222-2222-4222-a222-222222222225'),
('33333333-3333-4333-a333-333333333333', '22222222-2222-4222-a222-222222222226')
ON CONFLICT DO NOTHING;

-- 9. Insert Evidence Facts/Inferences
INSERT INTO public.evidence (id, listing_id, evidence_type, assessment_kind, source_type, source_reference, claim, status, confidence, explanation, limitations, severity) VALUES
('b0000000-0000-4000-a000-000000000001', '22222222-2222-4222-a222-222222222222', 'cosmetic_defect', 'fact', 'seller_declared', 'description:L2', 'Front display glass is cracked', 'confirmed_defective', 0.98, 'Seller explicitly declared cracked screen in text', ARRAY['Visual check required'], 'high'),
('b0000000-0000-4000-a000-000000000002', '22222222-2222-4222-a222-222222222222', 'functional_state', 'inference', 'seller_declared', 'description:L3', 'Logic board and FaceID functional', 'confirmed_working', 0.92, 'Seller declared device powers on and connects to iTunes', ARRAY['Requires full diagnostic scan'], 'none')
ON CONFLICT (id) DO NOTHING;

-- 10. Insert Defects
INSERT INTO public.defects (id, listing_id, component, defect_type, status, confidence, severity, declared, visible, inferred, estimated_repair_cost, repair_cost_currency) VALUES
('c0000000-0000-4000-a000-000000000001', '22222222-2222-4222-a222-222222222222', 'screen', 'cracked_glass', 'declared', 0.98, 'high', true, false, false, 350.00, 'BRL')
ON CONFLICT (id) DO NOTHING;

-- 11. Insert Defect Evidence Junction Link
INSERT INTO public.defect_evidence (defect_id, evidence_id) VALUES
('c0000000-0000-4000-a000-000000000001', 'b0000000-0000-4000-a000-000000000001')
ON CONFLICT DO NOTHING;

-- 12. Insert Scores
INSERT INTO public.scores (id, listing_id, query_match_score, technical_risk_score, fraud_risk_score, evidence_quality_score, price_score, opportunity_score, score_factors, formula_version, explanation) VALUES
('d0000000-0000-4000-a000-000000000001', '22222222-2222-4222-a222-222222222222', 95.0, 20.0, 5.0, 90.0, 85.0, 88.5, '{"positive": ["Powers on", "FaceID works", "Low repair cost"], "negative": ["Cracked glass"], "missing": [], "contradictions": []}', '1.0.0', 'High opportunity item. Estimated screen repair cost of 350 BRL yields strong margin.'),
('d0000000-0000-4000-a000-000000000002', '22222222-2222-4222-a222-222222222223', 90.0, 15.0, 5.0, 85.0, 80.0, 84.0, '{"positive": ["Powers on", "Easy battery repair"], "negative": ["Degraded battery"], "missing": [], "contradictions": []}', '1.0.0', 'Good battery repair opportunity.'),
('d0000000-0000-4000-a000-000000000003', '22222222-2222-4222-a222-222222222224', 30.0, 95.0, 50.0, 80.0, 40.0, 25.0, '{"positive": ["Low initial price"], "negative": ["Severe water damage", "Corroded board"], "missing": [], "contradictions": []}', '1.0.0', 'High risk item due to water corrosion.'),
('d0000000-0000-4000-a000-000000000004', '22222222-2222-4222-a222-222222222225', 10.0, 100.0, 90.0, 90.0, 30.0, 12.0, '{"positive": ["Clean housing"], "negative": ["iCloud activation lock"], "missing": [], "contradictions": []}', '1.0.0', 'Unusable for repair due to lock.'),
('d0000000-0000-4000-a000-000000000005', '22222222-2222-4222-a222-222222222226', 88.0, 30.0, 10.0, 85.0, 75.0, 78.0, '{"positive": ["Full working board", "High storage"], "negative": ["Back glass shattered"], "missing": [], "contradictions": []}', '1.0.0', 'Decent back glass repair candidate.')
ON CONFLICT (id) DO NOTHING;

-- 13. Insert User Action
INSERT INTO public.user_listing_actions (id, user_id, listing_id, project_id, favorite, decision, notes) VALUES
('e0000000-0000-4000-a000-000000000001', '11111111-1111-4111-a111-111111111111', '22222222-2222-4222-a222-222222222222', '33333333-3333-4333-a333-333333333333', true, 'approved', 'Great buy for screen replacement')
ON CONFLICT (id) DO NOTHING;
