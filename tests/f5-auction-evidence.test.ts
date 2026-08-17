import { describe, expect, it } from 'vitest';
import { DeterministicAuctionEvidenceNormalizer } from '@scout/valuation';

const document = {
  documentId: 'manifest-v1',
  lotExternalId: 'lot-42',
  type: 'MANIFEST' as const,
  version: 1,
  contentHash: 'a'.repeat(64),
  observedAt: '2026-08-15T12:00:00.000Z',
  source: 'fixture',
  claims: [
    {
      key: 'quantity',
      value: '10',
      sourceReference: 'row-1',
      status: 'CONFIRMED' as const,
      severity: 'none' as const,
    },
  ],
};

describe('F5.2 deterministic auction evidence normalizer', () => {
  const normalizer = new DeterministicAuctionEvidenceNormalizer();

  it('keeps latest versions deterministic and reports completeness flags', () => {
    const result = normalizer.normalize([
      document,
      { ...document, documentId: 'condition-v1', type: 'CONDITION_REPORT' as const },
      { ...document, documentId: 'manifest-v2', version: 2 },
    ]);

    expect(result).toMatchObject({
      documentCount: 3,
      claimCount: 3,
      completeness: 1,
      flags: [],
      conflictingKeys: [],
      latestDocumentIds: ['condition-v1', 'manifest-v2'],
    });
  });

  it('does not hide conflicting claims', () => {
    const result = normalizer.normalize([
      document,
      {
        ...document,
        documentId: 'manifest-v2',
        version: 2,
        claims: [{ ...document.claims[0], value: '12' }],
      },
    ]);

    expect(result.flags).toContain('CONFLICTING_CLAIMS');
    expect(result.conflictingKeys).toEqual(['quantity']);
    expect(result.completeness).toBeLessThan(1);
  });

  it('rejects wrong lot, invalid hash and action fields', () => {
    expect(() =>
      normalizer.normalize([{ ...document, lotExternalId: 'other' }, document]),
    ).toThrow();
    expect(() => normalizer.normalize([{ ...document, contentHash: 'bad' }])).toThrow();
    expect(() => normalizer.normalize([{ ...document, bid: true }])).toThrow();
  });
});
