import type { AnalysisError, TextAnalysisRunRepository } from '@scout/domain';
import {
  listingTextAnalysisTransportSchema,
  TEXT_ANALYSIS_DESCRIPTION_MAX_LENGTH,
  textAnalysisJobSchema,
  textAnalysisResultSchema,
  type ListingTextAnalysisTransport,
} from '@scout/schemas';
import type { SupabaseRestConfig } from './SupabaseRestResearchProjectRepository';

interface RequestedRow {
  analysis_run_id: string;
  should_queue: boolean;
}

interface ClaimedRow {
  analysis_run_id: string;
  listing_id: string;
  title: string;
  description: string;
  condition: string | null;
  attempt_count: number;
}

export class SupabaseRestTextAnalysisRunRepository implements TextAnalysisRunRepository {
  constructor(private readonly config: SupabaseRestConfig) {}

  async request(input: Parameters<TextAnalysisRunRepository['request']>[0]) {
    const rows = await this.rpc<RequestedRow[]>('request_text_analysis', {
      p_listing_id: input.listingId,
      p_provider: input.provider,
      p_model: input.model,
      p_prompt_version: input.promptVersion,
    });
    if (!rows[0]) throw new Error('Text analysis request returned no result.');
    return { analysisRunId: rows[0].analysis_run_id, shouldQueue: rows[0].should_queue };
  }

  async markQueued(analysisRunId: string) {
    await this.rpc('mark_text_analysis_queued', { p_run_id: analysisRunId });
  }

  async claim(analysisRunId: string) {
    const rows = await this.rpc<ClaimedRow[]>('claim_text_analysis', {
      p_run_id: analysisRunId,
    });
    const row = rows[0];
    if (!row) return null;
    return textAnalysisJobSchema.parse({
      analysisRunId: row.analysis_run_id,
      listingId: row.listing_id,
      title: row.title,
      description: row.description.slice(0, TEXT_ANALYSIS_DESCRIPTION_MAX_LENGTH),
      condition: row.condition ?? undefined,
      attemptCount: row.attempt_count,
    });
  }

  async complete(
    analysisRunId: string,
    rawResult: Parameters<TextAnalysisRunRepository['complete']>[1],
  ) {
    const result = textAnalysisResultSchema.parse(rawResult);
    await this.rpc('complete_text_analysis', { p_run_id: analysisRunId, p_result: result });
  }

  releaseForRetry(analysisRunId: string, error: AnalysisError) {
    return this.transition('retry_text_analysis', analysisRunId, error);
  }

  fail(analysisRunId: string, error: AnalysisError) {
    return this.transition('fail_text_analysis', analysisRunId, error);
  }

  /** Latest text analysis of a listing with its persisted evidences and defects. */
  async findLatestByListingId(listingId: string): Promise<ListingTextAnalysisTransport> {
    const runs = await this.get<
      Array<{
        id: string;
        status: string;
        provider: string;
        model_name: string;
        prompt_version: string;
        error_code: string | null;
        completed_at: string | null;
        output_metadata: { producedBy?: { provider: string; model: string; promptVersion: string } } | null;
      }>
    >(
      `analysis_runs?listing_id=eq.${encodeURIComponent(listingId)}&analysis_type=eq.text&select=id,status,provider,model_name,prompt_version,error_code,completed_at,output_metadata&order=created_at.desc&limit=1`,
    );
    const run = runs[0];
    if (!run)
      return listingTextAnalysisTransportSchema.parse({ listingId, run: null, evidences: [], defects: [] });
    const [evidences, defects] = await Promise.all([
      this.get<Array<Record<string, unknown>>>(
        `evidence?analysis_run_id=eq.${run.id}&select=id,evidence_key,component,evidence_type,assessment_kind,source_type,source_reference,claim,status,confidence,explanation,limitations,severity,model_name&order=created_at.asc`,
      ),
      this.get<Array<Record<string, unknown>>>(
        `defects?analysis_run_id=eq.${run.id}&select=id,defect_key,component,defect_type,status,confidence,severity,declared,inferred,defect_evidence(evidence_id)&order=created_at.asc`,
      ),
    ]);
    const keyById = new Map(evidences.map((row) => [row.id as string, row.evidence_key as string]));
    return listingTextAnalysisTransportSchema.parse({
      listingId,
      run: {
        id: run.id,
        status: run.status,
        provider: run.provider,
        model: run.model_name,
        promptVersion: run.prompt_version,
        errorCode: run.error_code,
        completedAt: run.completed_at,
        producedBy: run.output_metadata?.producedBy ?? null,
      },
      evidences: evidences.map((row) => ({
        key: row.evidence_key,
        component: row.component,
        evidenceType: row.evidence_type,
        assessmentKind: row.assessment_kind,
        sourceType: row.source_type,
        sourceReference: row.source_reference,
        claim: row.claim,
        status: row.status,
        confidence: Number(row.confidence),
        explanation: row.explanation,
        limitations: row.limitations ?? [],
        severity: row.severity,
        model: row.model_name ?? null,
      })),
      defects: defects.map((row) => ({
        key: row.defect_key,
        component: row.component,
        defectType: row.defect_type,
        status: row.status,
        confidence: Number(row.confidence),
        severity: row.severity,
        declared: row.declared,
        inferred: row.inferred,
        evidenceKeys: ((row.defect_evidence as Array<{ evidence_id: string }> | null) ?? [])
          .map(({ evidence_id }) => keyById.get(evidence_id))
          .filter((key): key is string => Boolean(key)),
      })),
    });
  }

  private async get<T>(path: string): Promise<T> {
    const response = await fetch(`${this.config.baseUrl}/rest/v1/${path}`, {
      headers: {
        apikey: this.config.anonKey,
        Authorization: `Bearer ${this.config.accessToken}`,
      },
    });
    if (!response.ok) throw new Error(`Supabase analysis read failed (${response.status}).`);
    return response.json() as Promise<T>;
  }

  private async transition(functionName: string, analysisRunId: string, error: AnalysisError) {
    await this.rpc(functionName, {
      p_run_id: analysisRunId,
      p_error: error.message,
      p_error_kind: error.kind,
      p_error_code: error.code,
    });
  }

  private async rpc<T = unknown>(functionName: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.config.baseUrl}/rest/v1/rpc/${functionName}`, {
      method: 'POST',
      headers: {
        apikey: this.config.anonKey,
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok)
      throw new Error(`Supabase text analysis request failed (${response.status}).`);
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}
