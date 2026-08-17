import { OpportunityValuation, OpportunityValuationRepository } from '@scout/domain';
import {
  opportunityValuationSchema,
  valuationOutputSchema,
  type ValuationOutput,
} from '@scout/schemas';
import { SqlExecutor } from '../../sql/SqlExecutor';

interface OpportunityValuationRow {
  id: string;
  listing_id: string;
  valuation_version: string;
  estimated_market_price: string | number;
  max_purchase_price: string | number;
  deal_score: string | number;
  trend_score: string | number;
  liquidity_score: string | number;
  seller_pressure_score: string | number;
  risk_confidence_score: string | number;
  confidence: string | number;
  comparables_used: number;
  outliers_removed: number;
  evidence: unknown;
  missing: unknown;
  explanation: string;
  created_at: string;
}

const minorToDb = (value: number) => value / 100;
const dbToMinor = (value: string | number) => Math.round(Number(value) * 100);

const mapRow = (row: OpportunityValuationRow): OpportunityValuation =>
  opportunityValuationSchema.parse({
    id: row.id,
    listingId: row.listing_id,
    valuationVersion: row.valuation_version,
    estimatedMarketPriceMinor: dbToMinor(row.estimated_market_price),
    maxPurchasePriceMinor: dbToMinor(row.max_purchase_price),
    comparablesUsed: row.comparables_used,
    outliersRemoved: row.outliers_removed,
    scores: {
      dealScore: Number(row.deal_score),
      trendScore: Number(row.trend_score),
      liquidityScore: Number(row.liquidity_score),
      sellerPressureScore: Number(row.seller_pressure_score),
      riskConfidenceScore: Number(row.risk_confidence_score),
    },
    confidence: Number(row.confidence),
    evidence: row.evidence,
    missing: row.missing,
    explanation: row.explanation,
    createdAt: new Date(row.created_at),
  });

export class PgOpportunityValuationRepository implements OpportunityValuationRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async save(
    valuation: Omit<OpportunityValuation, 'id' | 'createdAt'>,
  ): Promise<OpportunityValuation> {
    const output: ValuationOutput = valuationOutputSchema.parse(valuation);
    const result = await this.sql.query<OpportunityValuationRow>(
      `INSERT INTO opportunity_valuations (
        listing_id, valuation_version, estimated_market_price, max_purchase_price,
        deal_score, trend_score, liquidity_score, seller_pressure_score,
        risk_confidence_score, confidence, comparables_used, outliers_removed,
        evidence, missing, explanation
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (listing_id, valuation_version) DO UPDATE SET
        estimated_market_price = EXCLUDED.estimated_market_price,
        max_purchase_price = EXCLUDED.max_purchase_price,
        deal_score = EXCLUDED.deal_score,
        trend_score = EXCLUDED.trend_score,
        liquidity_score = EXCLUDED.liquidity_score,
        seller_pressure_score = EXCLUDED.seller_pressure_score,
        risk_confidence_score = EXCLUDED.risk_confidence_score,
        confidence = EXCLUDED.confidence,
        comparables_used = EXCLUDED.comparables_used,
        outliers_removed = EXCLUDED.outliers_removed,
        evidence = EXCLUDED.evidence,
        missing = EXCLUDED.missing,
        explanation = EXCLUDED.explanation,
        created_at = NOW()
      RETURNING *`,
      [
        valuation.listingId,
        output.valuationVersion,
        minorToDb(output.estimatedMarketPriceMinor),
        minorToDb(output.maxPurchasePriceMinor),
        output.scores.dealScore,
        output.scores.trendScore,
        output.scores.liquidityScore,
        output.scores.sellerPressureScore,
        output.scores.riskConfidenceScore,
        output.confidence,
        output.comparablesUsed,
        output.outliersRemoved,
        JSON.stringify(output.evidence),
        JSON.stringify(output.missing),
        output.explanation,
      ],
    );
    return mapRow(result.rows[0]);
  }

  async findLatestByListingId(listingId: string): Promise<OpportunityValuation | null> {
    const result = await this.sql.query<OpportunityValuationRow>(
      `SELECT * FROM opportunity_valuations
       WHERE listing_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [listingId],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }
}
