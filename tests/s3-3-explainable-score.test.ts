import { describe, expect, it } from 'vitest';
import { calculateListingScore, type ListingScoreInput } from '@scout/domain';
import { explainableScoreSchema, type ReferenceDiscount } from '@scout/schemas';

const asOf = new Date('2026-09-10T00:00:00.000Z');
const policy = {
  version: 'reference-discount.v1',
  windowDays: 30,
  minimumObservations: 10,
  iqrMultiplier: 1.5,
} as const;
const segment = {
  product: { brand: 'Apple', model: 'iPhone 13' },
  condition: 'Used',
  currency: 'USD',
};
const known = (discountBasisPoints: number): ReferenceDiscount => ({
  status: 'known',
  policy,
  segment,
  sample: { windowDays: 30, nRaw: 12, nTrimmed: 12, selfObservationsExcluded: 0 },
  landedCostMinor: 25000,
  referenceMedianMinor: 30000,
  discountMinor: 5000,
  discountBasisPoints,
});

const base: ListingScoreInput = {
  title: 'iPhone 13 128GB unlocked',
  description: 'Battery health 90%. Works.',
  condition: 'Used',
  brand: 'Apple',
  referenceDiscount: known(1667),
  analysis: { status: 'completed', defects: [], contradictions: [] },
  lastObservedAt: new Date('2026-09-09T00:00:00.000Z'),
  asOf,
};

describe('S3.3 explainable score', () => {
  it('opens the account: every point is an itemized factor with the policy version', () => {
    const score = calculateListingScore(base);
    expect(score).toMatchObject({ policyVersion: 'listing-score.v1', status: 'known', value: 67 });
    expect(score.factors).toEqual([
      expect.objectContaining({ kind: 'positive', code: 'DISTANCIA_DA_REFERENCIA', points: 17 }),
    ]);
    const sum = 50 + score.factors.reduce((total, factor) => total + (factor.points ?? 0), 0);
    expect(sum).toBe(score.value);
    expect(explainableScoreSchema.parse(score)).toEqual(score);
  });

  it('subtracts declared defects and flags a condition that contradicts them', () => {
    const score = calculateListingScore({
      ...base,
      analysis: {
        status: 'completed',
        defects: [
          { defectType: 'no_power', severity: 'critical', status: 'declared' },
          { defectType: 'cracked_screen', severity: 'high', status: 'declared' },
        ],
        contradictions: ['Title says excellent, description says cracked.'],
      },
    });
    expect(score.factors.map((factor) => [factor.kind, factor.code, factor.points])).toEqual([
      ['positive', 'DISTANCIA_DA_REFERENCIA', 17],
      ['negative', 'DEFEITO_NO_TEXTO', -25],
      ['negative', 'DEFEITO_NO_TEXTO', -15],
      ['contradictory', 'CONTRADICAO_NO_TEXTO', -5],
      ['contradictory', 'CONDICAO_CONTRADIZ_DEFEITO', -10],
    ]);
    expect(score.value).toBe(12);
  });

  it('is INCOMPLETO, with no value, when a leg is unknown', () => {
    const noAnalysis = calculateListingScore({ ...base, analysis: null });
    expect(noAnalysis).toMatchObject({ status: 'INCOMPLETO', value: null });
    expect(noAnalysis.factors).toContainEqual(
      expect.objectContaining({ kind: 'absent', code: 'ANALISE_DE_TEXTO_AUSENTE', points: null }),
    );
    const refused = calculateListingScore({
      ...base,
      referenceDiscount: {
        status: 'NAO_RANQUEAVEL',
        policy,
        reasons: ['CUSTO_INDETERMINADO'],
        segment,
        sample: null,
      },
    });
    expect(refused).toMatchObject({ status: 'INCOMPLETO', value: null });
    expect(refused.factors[0]).toMatchObject({ kind: 'absent', code: 'DISTANCIA_DESCONHECIDA' });
  });

  it('never rewards silence: unmentioned high-impact facts cost points', () => {
    const silent = calculateListingScore({
      ...base,
      title: 'iPhone 13',
      description: 'Works great.',
    });
    expect(
      silent.factors.filter((factor) => factor.kind === 'absent').map((factor) => factor.code),
    ).toEqual(['ICLOUD_NAO_MENCIONADO', 'BATERIA_NAO_MENCIONADA']);
    expect(
      silent.factors.every(
        (factor) => factor.kind !== 'positive' || factor.code === 'DISTANCIA_DA_REFERENCIA',
      ),
    ).toBe(true);
    expect(silent.value).toBe(57);
  });

  it('caps the distance contribution and marks stale observations', () => {
    const score = calculateListingScore({
      ...base,
      referenceDiscount: known(7500),
      lastObservedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    expect(score.factors).toContainEqual(
      expect.objectContaining({ code: 'DISTANCIA_DA_REFERENCIA', points: 30 }),
    );
    expect(score.factors).toContainEqual(
      expect.objectContaining({ code: 'DADO_VELHO', points: -5 }),
    );
    expect(score.value).toBe(75);
  });
});

describe('S3.3 score ordering in the feed', () => {
  it('ranks complete scores first and never compares INCOMPLETO against them', async () => {
    const { sliceListingFeed } = await import('@scout/domain');
    const item = (id: string, value: number | null, discountBasisPoints: number) =>
      ({
        id,
        firstCollectedAt: new Date('2026-09-01T00:00:00.000Z'),
        referenceDiscount: known(discountBasisPoints),
        score:
          value === null
            ? { policyVersion: 'listing-score.v1', status: 'INCOMPLETO', value: null, factors: [] }
            : { policyVersion: 'listing-score.v1', status: 'known', value, factors: [] },
      }) as never;
    const page = sliceListingFeed(
      [item('a', 40, 100), item('b', null, 9000), item('c', 70, 50), item('d', null, 200)],
      {
        group: 'rankable',
        sort: 'score',
        snapshot: asOf,
        offset: 0,
        limit: 10,
      },
    );
    expect(page.items.map(({ id }) => id)).toEqual(['c', 'a', 'b', 'd']);
  });
});
