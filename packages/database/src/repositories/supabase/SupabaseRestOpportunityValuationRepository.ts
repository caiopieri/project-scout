import type { OpportunityValuation, OpportunityValuationRepository } from '@scout/domain';
import {
  opportunityValuationSchema,
  valuationOutputSchema,
  type ValuationOutput,
} from '@scout/schemas';
import type { SupabaseRestConfig } from './SupabaseRestResearchProjectRepository';

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

export class SupabaseRestOpportunityValuationRepository implements OpportunityValuationRepository {
  constructor(private readonly config: SupabaseRestConfig) {}

  async save(
    valuation: Omit<OpportunityValuation, 'id' | 'createdAt'>,
  ): Promise<OpportunityValuation> {
    const { listingId, ...rawOutput } = valuation;
    const output: ValuationOutput = valuationOutputSchema.parse(rawOutput);
    const rows = await this.request<OpportunityValuationRow[]>(
      'opportunity_valuations?on_conflict=listing_id%2Cvaluation_version',
      {
        method: 'POST',
        body: JSON.stringify({
          listing_id: listingId,
          valuation_version: output.valuationVersion,
          estimated_market_price: minorToDb(output.estimatedMarketPriceMinor),
          max_purchase_price: minorToDb(output.maxPurchasePriceMinor),
          deal_score: output.scores.dealScore,
          trend_score: output.scores.trendScore,
          liquidity_score: output.scores.liquidityScore,
          seller_pressure_score: output.scores.sellerPressureScore,
          risk_confidence_score: output.scores.riskConfidenceScore,
          confidence: output.confidence,
          comparables_used: output.comparablesUsed,
          outliers_removed: output.outliersRemoved,
          evidence: output.evidence,
          missing: output.missing,
          explanation: output.explanation,
        }),
      },
    );
    if (!rows[0]) throw new Error('Supabase valuation insert returned no result.');
    return mapRow(rows[0]);
  }

  async findLatestByListingId(listingId: string): Promise<OpportunityValuation | null> {
    const rows = await this.request<OpportunityValuationRow[]>(
      `opportunity_valuations?listing_id=eq.${encodeURIComponent(listingId)}&order=created_at.desc&limit=1`,
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async isListingInProject(listingId: string, projectId: string): Promise<boolean> {
    const rows = await this.request<Array<{ listing_id: string }>>(
      `research_project_listings?listing_id=eq.${encodeURIComponent(listingId)}&project_id=eq.${encodeURIComponent(projectId)}&select=listing_id&limit=1`,
    );
    return rows.length > 0;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.config.baseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: this.config.anonKey,
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
        Prefer: init.method === 'POST' ? 'resolution=merge-duplicates,return=representation' : '',
      },
    });
    if (!response.ok) throw new Error(`Supabase valuation request failed (${response.status}).`);
    return response.json() as Promise<T>;
  }
}
