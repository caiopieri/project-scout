import { describe, expect, it } from 'vitest';
import {
  DeterministicQueryFamilyGenerator,
  proposeSearchTermObservation,
} from '@scout/search-intelligence';
import type { ResearchCriteria } from '@scout/schemas';

const criteria: ResearchCriteria = {
  category: 'smartphone',
  brands: ['Apple'],
  models: ['iPhone 13'],
  variants: [],
  storageGb: [128],
  memoryGb: [],
  maximumPrice: { amountMinor: 180000, currency: 'BRL' },
  acceptedDefects: ['cracked_screen'],
  rejectedDefects: ['activation_lock'],
  acceptedConditions: ['for_repair'],
  countries: ['BR'],
  regions: [],
  requiredFunctionalStates: [],
  preferredEvidence: [],
  additionalKeywords: [],
  excludedKeywords: [],
};

describe('F2 deterministic query families', () => {
  it('generates exact, alias, localized, abbreviation and typo variants', () => {
    const family = new DeterministicQueryFamilyGenerator().generate(criteria);
    const kinds = new Set(family.queries.map((query) => query.kind));

    expect(family.baseQuery).toContain('iPhone 13');
    expect(kinds).toEqual(new Set(['exact', 'alias', 'localized', 'abbreviation', 'typo']));
    expect(new Set(family.queries.map((query) => query.query)).size).toBe(family.queries.length);
  });

  it('uses accepted learned observations and excludes candidates from execution', () => {
    const candidate = proposeSearchTermObservation({
      term: 'iphone quebrado',
      kind: 'learned',
      source: 'review-1',
      evidence: ['review-1:accepted-result'],
    });
    const family = new DeterministicQueryFamilyGenerator().generate(criteria, [
      candidate,
      { ...candidate, term: 'iphone usado', status: 'accepted' },
    ]);

    expect(family.queries.some((query) => query.query === 'iphone quebrado')).toBe(false);
    expect(family.queries).toContainEqual(
      expect.objectContaining({ query: 'iphone usado', kind: 'learned' }),
    );
  });

  it('marks an accepted observation as learned when it matches a generated query', () => {
    const family = new DeterministicQueryFamilyGenerator().generate(criteria, [
      {
        term: 'Apple iPhone 13 128GB',
        normalizedTerm: 'apple iphone 13 128gb',
        kind: 'exact',
        status: 'accepted',
        evidence: ['reviewed-in-ui'],
        source: 'human-review',
      },
    ]);

    expect(family.queries.filter((query) => query.query === 'Apple iPhone 13 128GB')).toEqual([
      expect.objectContaining({ kind: 'learned', evidence: ['reviewed-in-ui'] }),
    ]);
  });
});
