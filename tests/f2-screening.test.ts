import { describe, expect, it } from 'vitest';
import {
  CheapListingFilter,
  CrossSourceIdentityComparator,
  InvestigationClassifier,
  ProductIdentityEngine,
} from '@scout/search-intelligence';
import type { ProductIdentity, ResearchCriteria, RawListingRecord } from '@scout/schemas';

const criteria: ResearchCriteria = {
  category: 'smartphone',
  brands: ['Apple'],
  models: ['iPhone 13'],
  variants: [],
  storageGb: [128],
  memoryGb: [],
  acceptedDefects: ['cracked_screen'],
  rejectedDefects: ['activation_lock'],
  acceptedConditions: ['for_repair'],
  countries: ['BR'],
  regions: [],
  requiredFunctionalStates: [],
  preferredEvidence: [],
  additionalKeywords: [],
  excludedKeywords: ['icloud'],
};

const listing = (title: string, amountMinor = 145000): RawListingRecord => ({
  preview: {
    externalId: 'MLB123',
    url: 'https://produto.mercadolivre.com.br/MLB123',
    title,
    price: { amountMinor, currency: 'BRL' },
  },
  payload: { description: title },
});

const identity = (overrides: Partial<ProductIdentity> = {}): ProductIdentity => ({
  canonicalKey: 'apple|iphone 13|128gb',
  status: 'MATCHED',
  confidence: 0.95,
  evidence: ['attribute:brand:Apple', 'attribute:model:Apple iPhone 13'],
  attributes: {
    brand: 'Apple',
    model: 'Apple iPhone 13',
    variant: 'A2633',
    storageGb: 128,
    memoryGb: 4,
  },
  media: { imageCount: 1, primaryImagePresent: true },
  mergeEligible: false,
  ...overrides,
});

describe('F2 cheap screening and product identity', () => {
  it('rejects explicit exclusions and category mismatches', () => {
    const filter = new CheapListingFilter();
    expect(filter.screen(listing('iPhone 13 com iCloud bloqueado'), criteria).decision).toBe(
      'REJECT',
    );
    expect(filter.screen(listing('Geladeira usada'), criteria).reasons).toContain(
      'CATEGORY_MISMATCH',
    );
  });

  it('routes a suspiciously cheap candidate to review, not automatic rejection', () => {
    const result = new CheapListingFilter().screen(listing('iPhone 13 128GB', 5000), criteria, {
      suspiciousPriceFloorMinor: 10000,
    });

    expect(result).toEqual({ decision: 'REVIEW', reasons: ['PRICE_BAIT_SIGNAL'] });
  });

  it('identifies the product but never authorizes cross-source merging', () => {
    const identity = new ProductIdentityEngine().identify(
      listing('Apple iPhone 13 128GB com tela quebrada'),
      criteria,
    );

    expect(identity).toMatchObject({
      status: 'MATCHED',
      canonicalKey: 'apple|iphone 13|128gb',
      mergeEligible: false,
    });
  });

  it('uses validated structured attributes and media as identity evidence', () => {
    const identity = new ProductIdentityEngine().identify(
      {
        ...listing('Apple smartphone com tela quebrada'),
        preview: {
          ...listing('Apple smartphone com tela quebrada').preview,
          imageUrl: 'https://images.example.test/iphone.jpg',
        },
        payload: {
          localizedAspects: [
            { name: 'Brand', value: 'Apple' },
            { name: 'Model', value: 'Apple iPhone 13' },
            { name: 'Storage Capacity', value: '128 GB' },
          ],
          additionalImages: [{ imageUrl: 'https://images.example.test/iphone-2.jpg' }],
        },
      },
      criteria,
    );

    expect(identity).toMatchObject({
      status: 'MATCHED',
      attributes: { brand: 'Apple', model: 'Apple iPhone 13', storageGb: 128 },
      media: { imageCount: 2, primaryImagePresent: true },
      mergeEligible: false,
    });
    expect(identity.evidence).toEqual(
      expect.arrayContaining(['attribute:model:Apple iPhone 13', 'media:additional-images:1']),
    );
  });

  it('fails closed for malformed structured attributes and media references', () => {
    const identity = new ProductIdentityEngine().identify(
      {
        ...listing('Apple iPhone 13 128GB'),
        payload: {
          localizedAspects: [{ name: 'Model', value: 13 }],
          additionalImages: [{ imageUrl: 'not-a-url' }],
        },
      },
      criteria,
    );

    expect(identity).toMatchObject({
      status: 'MATCHED',
      attributes: {},
      media: { imageCount: 0, primaryImagePresent: false },
      mergeEligible: false,
    });
  });

  it('classifies ambiguous or suspicious evidence as reviewable states', () => {
    const filter = new CheapListingFilter().screen(listing('Apple iPhone 13 128GB'), criteria, {
      suspiciousPriceFloorMinor: 200000,
    });
    const identity = new ProductIdentityEngine().identify(
      listing('Apple iPhone 13 128GB'),
      criteria,
    );
    const decision = new InvestigationClassifier().classify({ filter, identity });

    expect(decision).toMatchObject({
      state: 'PRICE_BAIT',
      requiresHumanReview: true,
    });
  });

  it('creates a cross-source match candidate only from corroborating structured evidence', () => {
    const result = new CrossSourceIdentityComparator().compare({
      left: {
        sourceId: '11111111-1111-4111-8111-111111111111',
        listingId: '21111111-1111-4111-8111-111111111111',
        identity: identity(),
      },
      right: {
        sourceId: '22222222-2222-4222-8222-222222222222',
        listingId: '32222222-2222-4222-8222-222222222222',
        identity: identity({ media: { imageCount: 3, primaryImagePresent: true } }),
      },
    });

    expect(result).toMatchObject({
      relation: 'MATCH_CANDIDATE',
      confidence: 0.98,
      mergeEligible: false,
    });
    expect(result.evidence).toEqual(
      expect.arrayContaining(['structured-brand-equal', 'structured-model-equal']),
    );
  });

  it('does not treat title-derived canonical keys as enough for cross-source merging', () => {
    const result = new CrossSourceIdentityComparator().compare({
      left: {
        sourceId: '11111111-1111-4111-8111-111111111111',
        listingId: '21111111-1111-4111-8111-111111111111',
        identity: identity({
          attributes: {},
          media: { imageCount: 0, primaryImagePresent: false },
        }),
      },
      right: {
        sourceId: '22222222-2222-4222-8222-222222222222',
        listingId: '32222222-2222-4222-8222-222222222222',
        identity: identity({
          attributes: {},
          media: { imageCount: 0, primaryImagePresent: false },
        }),
      },
    });

    expect(result).toMatchObject({ relation: 'REVIEW', mergeEligible: false });
    expect(result.evidence).toContain('structured-brand-missing');
  });

  it('rejects conflicting structured model or storage evidence', () => {
    const comparator = new CrossSourceIdentityComparator();
    const modelConflict = comparator.compare({
      left: {
        sourceId: '11111111-1111-4111-8111-111111111111',
        listingId: '21111111-1111-4111-8111-111111111111',
        identity: identity(),
      },
      right: {
        sourceId: '22222222-2222-4222-8222-222222222222',
        listingId: '32222222-2222-4222-8222-222222222222',
        identity: identity({
          canonicalKey: 'apple|iphone 14|128gb',
          attributes: { ...identity().attributes, model: 'Apple iPhone 14' },
        }),
      },
    });
    const storageConflict = comparator.compare({
      left: {
        sourceId: '11111111-1111-4111-8111-111111111111',
        listingId: '21111111-1111-4111-8111-111111111111',
        identity: identity(),
      },
      right: {
        sourceId: '22222222-2222-4222-8222-222222222222',
        listingId: '32222222-2222-4222-8222-222222222222',
        identity: identity({ attributes: { ...identity().attributes, storageGb: 256 } }),
      },
    });

    expect(modelConflict).toMatchObject({ relation: 'NO_MATCH' });
    expect(modelConflict.evidence).toContain('canonical-key-conflict');
    expect(storageConflict).toMatchObject({ relation: 'NO_MATCH' });
    expect(storageConflict.evidence).toContain('structured-storage-conflict');
  });

  it('fails closed for same-source or unresolved identities', () => {
    const comparator = new CrossSourceIdentityComparator();
    const sameSource = comparator.compare({
      left: {
        sourceId: '11111111-1111-4111-8111-111111111111',
        listingId: '21111111-1111-4111-8111-111111111111',
        identity: identity(),
      },
      right: {
        sourceId: '11111111-1111-4111-8111-111111111111',
        listingId: '32222222-2222-4222-8222-222222222222',
        identity: identity(),
      },
    });
    const unresolved = comparator.compare({
      left: {
        sourceId: '11111111-1111-4111-8111-111111111111',
        listingId: '21111111-1111-4111-8111-111111111111',
        identity: identity({ status: 'UNIDENTIFIED', canonicalKey: undefined }),
      },
      right: {
        sourceId: '22222222-2222-4222-8222-222222222222',
        listingId: '32222222-2222-4222-8222-222222222222',
        identity: identity(),
      },
    });

    expect(sameSource).toMatchObject({ relation: 'NO_MATCH', confidence: 1 });
    expect(unresolved).toMatchObject({ relation: 'INSUFFICIENT_EVIDENCE', mergeEligible: false });
  });
});
