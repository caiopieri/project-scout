import {
  explainableScoreSchema,
  type ExplainableScore,
  type ExplainableScoreFactor,
  type ReferenceDiscount,
} from '@scout/schemas';

export const LISTING_SCORE_POLICY_VERSION = 'listing-score.v1';

export interface ListingScoreTextAnalysis {
  status: 'pending' | 'running' | 'completed' | 'failed';
  defects: Array<{
    defectType: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    status: string;
  }>;
  contradictions: string[];
}

export interface ListingScoreInput {
  title: string;
  description: string;
  condition: string;
  brand?: string;
  referenceDiscount?: ReferenceDiscount;
  analysis: ListingScoreTextAnalysis | null;
  lastObservedAt: Date;
  asOf: Date;
}

const DEFECT_POINTS = { critical: -25, high: -15, medium: -8, low: -3 } as const;
const MAX_DISCOUNT_POINTS = 30;
const MAX_DEFECT_PENALTY = -50;
const HIGH_IMPACT_UNKNOWN_POINTS = -5;
const STALE_DAYS = 14;

// Unknowns whose cost of being wrong is high for Apple devices. Not mentioning them is never
// read as "fine": it costs points and is listed as absent.
const HIGH_IMPACT_MENTIONS = [
  {
    code: 'ICLOUD_NAO_MENCIONADO',
    label: 'iCloud / bloqueio de ativação não mencionado',
    pattern: /icloud|activation lock|find my|bloqueio|bloqueado|unlocked|desbloqueado/i,
  },
  { code: 'BATERIA_NAO_MENCIONADA', label: 'bateria não mencionada', pattern: /batter|bateria/i },
];

/**
 * listing-score.v1: 50 base points, plus the reference distance (±1 point per percent, capped
 * at ±30), minus declared/inferred text defects by severity (capped at -50), minus contradictions
 * and high-impact unknowns. Without a known reference distance or a completed text analysis the
 * score is INCOMPLETO and carries no value. It is not a margin and not a purchase recommendation.
 */
export const calculateListingScore = (input: ListingScoreInput): ExplainableScore => {
  const factors: ExplainableScoreFactor[] = [];
  let incomplete = false;
  const discount = input.referenceDiscount;
  if (discount?.status === 'known') {
    const points = Math.max(
      -MAX_DISCOUNT_POINTS,
      Math.min(MAX_DISCOUNT_POINTS, Math.round(discount.discountBasisPoints / 100)),
    );
    factors.push({
      kind: points >= 0 ? 'positive' : 'negative',
      code: 'DISTANCIA_DA_REFERENCIA',
      label: `${(discount.discountBasisPoints / 100).toFixed(1)}% em relação à mediana de preço pedido (n ${discount.sample.nRaw})`,
      points,
    });
  } else {
    incomplete = true;
    factors.push({
      kind: 'absent',
      code: 'DISTANCIA_DESCONHECIDA',
      label: `sem distância da referência: ${discount?.status === 'NAO_RANQUEAVEL' ? discount.reasons.join(' + ') : 'não calculada'}`,
      points: null,
    });
  }

  if (!input.analysis || input.analysis.status !== 'completed') {
    incomplete = true;
    factors.push({
      kind: 'absent',
      code: 'ANALISE_DE_TEXTO_AUSENTE',
      label: input.analysis
        ? `análise de texto ${input.analysis.status}`
        : 'texto ainda não analisado',
      points: null,
    });
  } else {
    let penalty = 0;
    for (const defect of input.analysis.defects) {
      const points = Math.max(DEFECT_POINTS[defect.severity], MAX_DEFECT_PENALTY - penalty);
      penalty += points;
      factors.push({
        kind: 'negative',
        code: 'DEFEITO_NO_TEXTO',
        label: `${defect.defectType} (${defect.status}, ${defect.severity})`,
        points,
      });
    }
    for (const contradiction of input.analysis.contradictions)
      factors.push({
        kind: 'contradictory',
        code: 'CONTRADICAO_NO_TEXTO',
        label: contradiction,
        points: -5,
      });
    const parts = /parts|peças|not working/i.test(input.condition);
    if (!parts && input.analysis.defects.some((defect) => defect.severity === 'critical'))
      factors.push({
        kind: 'contradictory',
        code: 'CONDICAO_CONTRADIZ_DEFEITO',
        label: `condição "${input.condition}" com defeito crítico no texto`,
        points: -10,
      });
  }

  if ((input.brand ?? '').toLowerCase() === 'apple') {
    const text = `${input.title}\n${input.description}`;
    for (const mention of HIGH_IMPACT_MENTIONS)
      if (!mention.pattern.test(text))
        factors.push({
          kind: 'absent',
          code: mention.code,
          label: mention.label,
          points: HIGH_IMPACT_UNKNOWN_POINTS,
        });
  }

  const ageDays = Math.floor((input.asOf.getTime() - input.lastObservedAt.getTime()) / 86_400_000);
  if (ageDays > STALE_DAYS)
    factors.push({
      kind: 'negative',
      code: 'DADO_VELHO',
      label: `última observação há ${ageDays} dias`,
      points: -5,
    });

  const total = 50 + factors.reduce((sum, factor) => sum + (factor.points ?? 0), 0);
  return explainableScoreSchema.parse({
    policyVersion: LISTING_SCORE_POLICY_VERSION,
    status: incomplete ? 'INCOMPLETO' : 'known',
    value: incomplete ? null : Math.max(0, Math.min(100, total)),
    factors,
  });
};
