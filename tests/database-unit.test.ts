import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  evidenceSchema,
  defectSchema,
  listingSchema,
  listingScoreSchema,
  researchProjectSchema,
  userListingActionSchema,
} from '@scout/schemas';
import {
  MOCK_USER_A,
  MOCK_USER_B,
  MOCK_SOURCE_EBAY,
  MOCK_PROJECT_IPHONE13,
  MOCK_LISTINGS,
  MOCK_SELLERS,
  MOCK_EVIDENCES,
  MOCK_DEFECTS,
  MOCK_SCORES,
  MOCK_USER_ACTION,
  InMemoryResearchProjectRepository,
  InMemoryListingRepository,
  InMemorySellerRepository,
  InMemoryAnalysisRepository,
  InMemoryUserListingActionRepository,
} from '@scout/database';

describe('Milestone 2: Database Unit Tests (Zod Schemas & In-Memory Repositories)', () => {
  describe('Zod Domain Schemas & Validation Constraints', () => {
    it('should validate a correct research project schema', () => {
      const parsed = researchProjectSchema.parse(MOCK_PROJECT_IPHONE13);
      expect(parsed.id).toBe(MOCK_PROJECT_IPHONE13.id);
      expect(parsed.structuredQuery.maximumPrice?.amountMinor).toBe(250000);
    });

    it('should validate a correct listing schema with 5+ edge-case listings and sellers', () => {
      expect(MOCK_SELLERS.length).toBeGreaterThanOrEqual(5);
      for (const listing of MOCK_LISTINGS) {
        const parsed = listingSchema.parse(listing);
        expect(parsed.id).toBe(listing.id);
        expect(parsed.price).toBeGreaterThanOrEqual(0);
        expect(parsed.totalVisibleCost).toBe(parsed.price + parsed.shippingCost);
      }
    });

    it('should validate strict evidence taxonomy schema (assessmentKind, sourceType, status, confidence 0..1)', () => {
      for (const ev of MOCK_EVIDENCES) {
        const parsed = evidenceSchema.parse(ev);
        expect(parsed.confidence).toBeGreaterThanOrEqual(0.0);
        expect(parsed.confidence).toBeLessThanOrEqual(1.0);
        expect(['fact', 'inference', 'unknown']).toContain(parsed.assessmentKind);
        expect(Array.isArray(parsed.limitations)).toBe(true);
      }
    });

    it('should reject invalid evidence confidence outside 0..1 range', () => {
      const invalidEvidence = {
        ...MOCK_EVIDENCES[0],
        confidence: 1.5,
      };
      expect(() => evidenceSchema.parse(invalidEvidence)).toThrow();
    });

    it('should validate defect schema with BRL repair cost', () => {
      for (const defect of MOCK_DEFECTS) {
        const parsed = defectSchema.parse(defect);
        expect(parsed.repairCostCurrency).toBe('BRL');
        expect(parsed.confidence).toBeGreaterThanOrEqual(0);
        expect(parsed.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should validate listing score schema', () => {
      for (const score of MOCK_SCORES) {
        const parsed = listingScoreSchema.parse(score);
        expect(parsed.opportunityScore).toBe(88.5);
        expect(Array.isArray(parsed.scoreFactors.positive)).toBe(true);
      }
    });

    it('should validate user listing action schema', () => {
      const parsed = userListingActionSchema.parse(MOCK_USER_ACTION);
      expect(parsed.favorite).toBe(true);
      expect(parsed.decision).toBe('approved');
    });
  });

  describe('Canonical Migration File Structure Verification', () => {
    it('should define append-only F0 observation events and semantic health checks with least privilege', () => {
      const migrationPath = path.join(
        process.cwd(),
        'supabase/migrations/20260811160000_f0_observation_events_health.sql',
      );
      expect(fs.existsSync(migrationPath)).toBe(true);

      const sqlContent = fs.readFileSync(migrationPath, 'utf-8');

      expect(sqlContent).toContain('CREATE TABLE IF NOT EXISTS public.observation_events');
      expect(sqlContent).toContain(
        'observation_events_dedupe_key_unique UNIQUE (source_id, dedupe_key)',
      );
      expect(sqlContent).toContain('CREATE TABLE IF NOT EXISTS public.collector_health_checks');
      expect(sqlContent).toContain('ingestion_layer BETWEEN 1 AND 7');
      expect(sqlContent).not.toContain(
        'GRANT SELECT ON public.observation_events, public.collector_health_checks TO authenticated',
      );
      expect(sqlContent).toContain(
        'GRANT ALL ON public.observation_events, public.collector_health_checks TO service_role',
      );
      expect(sqlContent).toContain(
        'ALTER TABLE public.observation_events ENABLE ROW LEVEL SECURITY',
      );
      expect(sqlContent).toContain(
        'ALTER TABLE public.collector_health_checks ENABLE ROW LEVEL SECURITY',
      );
    });

    it('should verify supabase/migrations/20260728160000_initial_schema.sql contains required tables, pgcrypto, defect_evidence, research_project_listings and RLS', () => {
      const migrationPath = path.join(
        process.cwd(),
        'supabase/migrations/20260728160000_initial_schema.sql',
      );
      expect(fs.existsSync(migrationPath)).toBe(true);

      const sqlContent = fs.readFileSync(migrationPath, 'utf-8');

      expect(sqlContent).toContain('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
      expect(sqlContent).toContain('REFERENCES auth.users(id)');
      expect(sqlContent).toContain('CREATE TABLE IF NOT EXISTS research_project_listings');
      expect(sqlContent).toContain('CREATE TABLE IF NOT EXISTS defect_evidence');
      expect(sqlContent).toContain('ALTER TABLE collection_runs ENABLE ROW LEVEL SECURITY;');
      expect(sqlContent).toContain('NUMERIC(12, 2)');
      expect(sqlContent).toContain('sellers_source_external_unique UNIQUE(source_id, external_id)');
      expect(sqlContent).toContain(
        'listings_source_external_unique UNIQUE(source_id, external_id)',
      );
      expect(sqlContent).toContain(
        'user_listing_project_unique UNIQUE(user_id, listing_id, project_id)',
      );
    });

    it('should protect F2 query families and term observations with owner reads and service-role writes', () => {
      const migrationPath = path.join(
        process.cwd(),
        'supabase/migrations/20260813160000_f2_search_query_families.sql',
      );
      expect(fs.existsSync(migrationPath)).toBe(true);
      const sqlContent = fs.readFileSync(migrationPath, 'utf-8');

      expect(sqlContent).toContain('collection_run_id UUID NOT NULL UNIQUE');
      expect(sqlContent).toContain('search_term_observations_identity_unique');
      expect(sqlContent).toContain(
        'GRANT SELECT ON public.search_query_families, public.search_term_observations TO authenticated',
      );
      expect(sqlContent).toContain(
        'GRANT ALL ON public.search_query_families, public.search_term_observations TO service_role',
      );
      expect(sqlContent).toContain(
        'GRANT UPDATE (status) ON public.search_term_observations TO authenticated',
      );
      expect(sqlContent).toContain(
        'ALTER TABLE public.search_query_families ENABLE ROW LEVEL SECURITY',
      );
      expect(sqlContent).toContain(
        'ALTER TABLE public.search_term_observations ENABLE ROW LEVEL SECURITY',
      );
      expect(sqlContent).toContain('rp.user_id = auth.uid()');
      expect(sqlContent).toContain('search_term_observations_owner_review');
      expect(sqlContent).not.toContain('GRANT INSERT');
    });

    it('should expose triage review only through the validated owner RPC', () => {
      const migrationPath = path.join(
        process.cwd(),
        'supabase/migrations/20260813181000_f2_triage_review_rpc.sql',
      );
      const sqlContent = fs.readFileSync(migrationPath, 'utf-8');
      expect(sqlContent).toContain(
        'REVOKE INSERT ON public.listing_triage_reviews FROM authenticated',
      );
      expect(sqlContent).toContain('CREATE OR REPLACE FUNCTION public.review_listing_triage');
      expect(sqlContent).toContain('SECURITY DEFINER');
      expect(sqlContent).toContain('rp.user_id = auth.uid()');
      expect(sqlContent).toContain('GRANT EXECUTE ON FUNCTION public.review_listing_triage');
    });
  });

  describe('In-Memory Repository Operations & Tenant Data Isolation', () => {
    it('InMemoryResearchProjectRepository: should enforce user isolation', async () => {
      const repo = new InMemoryResearchProjectRepository([MOCK_PROJECT_IPHONE13]);

      const userAProject = await repo.findById(MOCK_PROJECT_IPHONE13.id, MOCK_USER_A.id);
      expect(userAProject).not.toBeNull();

      const userBProject = await repo.findById(MOCK_PROJECT_IPHONE13.id, MOCK_USER_B.id);
      expect(userBProject).toBeNull();
    });

    it('InMemoryListingRepository & InMemorySellerRepository: should support upserting by source_id + external_id', async () => {
      const listingRepo = new InMemoryListingRepository();
      const sellerRepo = new InMemorySellerRepository();

      const seller = await sellerRepo.upsertSeller({
        sourceId: MOCK_SOURCE_EBAY.id,
        externalId: 'test_seller_1',
        name: 'Test Seller One',
        rating: 4.8,
        reviewCount: 50,
        accountType: 'business',
      });
      expect(seller.id).toBeDefined();

      const listing = await listingRepo.upsertListing({
        sourceId: MOCK_SOURCE_EBAY.id,
        externalId: 'v1|999|0',
        url: 'https://www.ebay.com/itm/999',
        title: 'Test Listing',
        description: 'Test Desc',
        condition: 'For parts',
        currency: 'USD',
        price: 100,
        shippingCost: 10,
        totalVisibleCost: 110,
        sellerId: seller.id,
        status: 'active',
        specifications: {},
        images: [],
        inferredProduct: null,
        rawDataPath: 'raw/999.json',
        rawDataMetadata: {},
      });
      expect(listing.id).toBeDefined();
    });

    it('InMemoryAnalysisRepository: should save analysis run, evidence, defects (with defect_evidence links), and scores', async () => {
      const analysisRepo = new InMemoryAnalysisRepository();

      const run = await analysisRepo.saveAnalysisRun({
        listingId: MOCK_LISTINGS[0].id,
        modelName: 'gemini-2.5-flash',
        promptVersion: '1.0.0',
        status: 'completed',
        tokensUsed: 450,
      });
      expect(run.id).toBeDefined();

      const savedEvidences = await analysisRepo.saveEvidences(MOCK_EVIDENCES);
      expect(savedEvidences.length).toBe(2);

      const savedDefects = await analysisRepo.saveDefects([
        {
          ...MOCK_DEFECTS[0],
          evidenceIds: [savedEvidences[0].id],
        },
      ]);
      expect(savedDefects.length).toBe(1);

      await analysisRepo.saveScore(MOCK_SCORES[0]);
      const fetchedScore = await analysisRepo.getScoreByListingId(MOCK_LISTINGS[0].id);
      expect(fetchedScore?.opportunityScore).toBe(88.5);
    });

    it('InMemoryUserListingActionRepository: should handle favoriting and decisions', async () => {
      const actionRepo = new InMemoryUserListingActionRepository();

      const action = await actionRepo.setAction({
        userId: MOCK_USER_A.id,
        listingId: MOCK_LISTINGS[0].id,
        projectId: MOCK_PROJECT_IPHONE13.id,
        favorite: true,
        decision: 'approved',
        notes: 'Great potential buy',
      });

      expect(action.id).toBeDefined();

      const fetched = await actionRepo.getAction(
        MOCK_USER_A.id,
        MOCK_LISTINGS[0].id,
        MOCK_PROJECT_IPHONE13.id,
      );
      expect(fetched?.favorite).toBe(true);
    });
  });
});
