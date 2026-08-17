import type { AnalysisError, TextAnalysisRunRepository } from '@scout/domain';
import {
  TEXT_ANALYSIS_DESCRIPTION_MAX_LENGTH,
  textAnalysisJobSchema,
  textAnalysisResultSchema,
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
