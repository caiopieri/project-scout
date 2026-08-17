import {
  AnalysisRepository,
  AnalysisRun,
  Defect,
  Evidence,
  ListingScore,
} from '@scout/domain';
import { SqlExecutor } from '../../sql/SqlExecutor';

export class PgAnalysisRepository implements AnalysisRepository {
  constructor(private sql: SqlExecutor) {}

  async saveAnalysisRun(run: Omit<AnalysisRun, 'id' | 'createdAt'>): Promise<AnalysisRun> {
    const res = await this.sql.query<AnalysisRun>(
      `INSERT INTO analysis_runs (listing_id, model_name, prompt_version, status, tokens_used, error)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, listing_id as "listingId", model_name as "modelName", prompt_version as "promptVersion",
                 status, tokens_used as "tokensUsed", error, created_at as "createdAt"`,
      [run.listingId, run.modelName, run.promptVersion, run.status || 'completed', run.tokensUsed || 0, run.error || null]
    );
    return res.rows[0];
  }

  async saveEvidences(evidences: Omit<Evidence, 'id' | 'createdAt'>[]): Promise<Evidence[]> {
    const saved: Evidence[] = [];
    for (const ev of evidences) {
      const res = await this.sql.query<Evidence>(
        `INSERT INTO evidence (listing_id, evidence_type, assessment_kind, source_type, source_reference, claim, status, confidence, explanation, limitations, severity, model_name, prompt_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING id, listing_id as "listingId", evidence_type as "evidenceType", assessment_kind as "assessmentKind",
                   source_type as "sourceType", source_reference as "sourceReference", claim, status, confidence,
                   explanation, limitations, severity, model_name as "modelName", prompt_version as "promptVersion",
                   created_at as "createdAt"`,
        [
          ev.listingId,
          ev.evidenceType,
          ev.assessmentKind,
          ev.sourceType,
          ev.sourceReference,
          ev.claim,
          ev.status,
          ev.confidence,
          ev.explanation,
          JSON.stringify(ev.limitations || []),
          ev.severity,
          ev.modelName || null,
          ev.promptVersion || null,
        ]
      );
      saved.push(res.rows[0]);
    }
    return saved;
  }

  async saveDefects(defects: (Omit<Defect, 'id' | 'createdAt'> & { evidenceIds?: string[] })[]): Promise<Defect[]> {
    const saved: Defect[] = [];
    for (const df of defects) {
      const res = await this.sql.query<Defect>(
        `INSERT INTO defects (listing_id, component, defect_type, status, confidence, severity, declared, visible, inferred, estimated_repair_cost, repair_cost_currency)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id, listing_id as "listingId", component, defect_type as "defectType", status, confidence,
                   severity, declared, visible, inferred, estimated_repair_cost as "estimatedRepairCost",
                   repair_cost_currency as "repairCostCurrency", created_at as "createdAt"`,
        [
          df.listingId,
          df.component,
          df.defectType,
          df.status,
          df.confidence,
          df.severity,
          df.declared || false,
          df.visible || false,
          df.inferred || false,
          df.estimatedRepairCost || null,
          df.repairCostCurrency || 'BRL',
        ]
      );
      const defect = res.rows[0];

      if (df.evidenceIds && df.evidenceIds.length > 0) {
        for (const evId of df.evidenceIds) {
          await this.sql.query(
            `INSERT INTO defect_evidence (defect_id, evidence_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [defect.id, evId]
          );
        }
      }
      saved.push(defect);
    }
    return saved;
  }

  async saveScore(score: Omit<ListingScore, 'id' | 'createdAt'> & { id?: string }): Promise<ListingScore> {
    const res = await this.sql.query<ListingScore>(
      `INSERT INTO scores (listing_id, analysis_run_id, query_match_score, technical_risk_score, fraud_risk_score, evidence_quality_score, price_score, opportunity_score, score_factors, formula_version, explanation)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, listing_id as "listingId", analysis_run_id as "analysisRunId", query_match_score as "queryMatchScore",
                 technical_risk_score as "technicalRiskScore", fraud_risk_score as "fraudRiskScore",
                 evidence_quality_score as "evidenceQualityScore", price_score as "priceScore",
                 opportunity_score as "opportunityScore", score_factors as "scoreFactors",
                 formula_version as "formulaVersion", explanation, created_at as "createdAt"`,
      [
        score.listingId,
        score.analysisRunId || null,
        score.queryMatchScore,
        score.technicalRiskScore,
        score.fraudRiskScore,
        score.evidenceQualityScore,
        score.priceScore,
        score.opportunityScore,
        JSON.stringify(score.scoreFactors),
        score.formulaVersion || '1.0.0',
        score.explanation,
      ]
    );
    return res.rows[0];
  }

  async getEvidencesByListingId(listingId: string): Promise<Evidence[]> {
    const res = await this.sql.query<Evidence>(
      `SELECT id, listing_id as "listingId", evidence_type as "evidenceType", assessment_kind as "assessmentKind",
              source_type as "sourceType", source_reference as "sourceReference", claim, status, confidence,
              explanation, limitations, severity, model_name as "modelName", prompt_version as "promptVersion",
              created_at as "createdAt"
       FROM evidence WHERE listing_id = $1 ORDER BY created_at ASC`,
      [listingId]
    );
    return res.rows;
  }

  async getDefectsByListingId(listingId: string): Promise<Defect[]> {
    const res = await this.sql.query<Defect>(
      `SELECT id, listing_id as "listingId", component, defect_type as "defectType", status, confidence,
              severity, declared, visible, inferred, estimated_repair_cost as "estimatedRepairCost",
              repair_cost_currency as "repairCostCurrency", created_at as "createdAt"
       FROM defects WHERE listing_id = $1 ORDER BY created_at ASC`,
      [listingId]
    );
    return res.rows;
  }

  async getScoreByListingId(listingId: string): Promise<ListingScore | null> {
    const res = await this.sql.query<ListingScore>(
      `SELECT id, listing_id as "listingId", analysis_run_id as "analysisRunId", query_match_score as "queryMatchScore",
              technical_risk_score as "technicalRiskScore", fraud_risk_score as "fraudRiskScore",
              evidence_quality_score as "evidenceQualityScore", price_score as "priceScore",
              opportunity_score as "opportunityScore", score_factors as "scoreFactors",
              formula_version as "formulaVersion", explanation, created_at as "createdAt"
       FROM scores WHERE listing_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [listingId]
    );
    return res.rows.length > 0 ? res.rows[0] : null;
  }
}
