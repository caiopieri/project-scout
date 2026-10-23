import {
  listingVisualAnalysisTransportSchema,
  visualFindingSchema,
  type ListingVisualAnalysisTransport,
  type VisualFinding,
} from '@scout/schemas';
import type { SupabaseRestConfig } from './SupabaseRestResearchProjectRepository';

interface RunRow {
  id: string;
  listing_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  provider: string;
  model: string;
  prompt_version: string;
  image_urls: string[];
  image_hashes: string[] | null;
  findings: unknown;
  summary: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_micro_usd: number | null;
  error_code: string | null;
  completed_at: string | null;
}

const runSelect =
  'id,listing_id,status,provider,model,prompt_version,image_urls,image_hashes,findings,summary,input_tokens,output_tokens,cost_micro_usd,error_code,completed_at';

/** Visual checkup runs. Writes need the service role; reads work with the user's token. */
export class SupabaseRestVisualAnalysisRepository {
  constructor(private readonly config: SupabaseRestConfig) {}

  async imagesByListingIds(listingIds: string[]) {
    const images = new Map<string, string[]>();
    for (let offset = 0; offset < listingIds.length; offset += 50) {
      const rows = await this.request<Array<{ listing_id: string; url: string }>>(
        `listing_images?listing_id=in.(${listingIds.slice(offset, offset + 50).join(',')})&select=listing_id,url&order=position.asc`,
      );
      for (const row of rows)
        images.set(row.listing_id, [...(images.get(row.listing_id) ?? []), row.url]);
    }
    return images;
  }

  /** Creates a pending run for this exact image set, or returns the existing one. */
  async requestRun(input: {
    listingId: string;
    projectId: string;
    provider: string;
    model: string;
    promptVersion: string;
    imageUrls: string[];
  }) {
    const created = await this.request<RunRow[]>(
      `visual_analysis_runs?on_conflict=listing_id,prompt_version,model,image_urls&select=${runSelect}`,
      {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify({
          listing_id: input.listingId,
          project_id: input.projectId,
          provider: input.provider,
          model: input.model,
          prompt_version: input.promptVersion,
          image_urls: input.imageUrls,
        }),
      },
    );
    if (created[0]) return { run: created[0], created: true };
    const existing = await this.request<RunRow[]>(
      `visual_analysis_runs?listing_id=eq.${input.listingId}&prompt_version=eq.${encodeURIComponent(input.promptVersion)}&model=eq.${encodeURIComponent(input.model)}&select=${runSelect}&order=created_at.desc`,
    );
    const same = existing.find(
      (run) => JSON.stringify(run.image_urls) === JSON.stringify(input.imageUrls),
    );
    if (!same) throw new Error('Visual analysis run could not be requested.');
    if (same.status === 'failed') {
      const reopened = await this.patch(
        same.id,
        { status: 'pending', error_code: null },
        'status=eq.failed',
      );
      return { run: reopened ?? same, created: Boolean(reopened) };
    }
    return { run: same, created: false };
  }

  async claim(runId: string) {
    return this.patch(runId, { status: 'running' }, 'status=eq.pending');
  }

  /** A completed run on the same listing whose image bytes hash to the same set. */
  async findCompletedByHashes(listingId: string, hashes: string[]) {
    const rows = await this.request<RunRow[]>(
      `visual_analysis_runs?listing_id=eq.${listingId}&status=eq.completed&select=${runSelect}`,
    );
    const key = [...hashes].sort().join(',');
    return rows.find((row) => [...(row.image_hashes ?? [])].sort().join(',') === key) ?? null;
  }

  complete(
    runId: string,
    result: {
      imageHashes: string[];
      findings: VisualFinding[];
      summary: string;
      inputTokens: number;
      outputTokens: number;
      costMicroUsd: number | null;
    },
  ) {
    return this.patch(runId, {
      status: 'completed',
      error_code: null,
      image_hashes: result.imageHashes,
      findings: visualFindingSchema.array().parse(result.findings),
      summary: result.summary,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      cost_micro_usd: result.costMicroUsd,
      completed_at: new Date().toISOString(),
    });
  }

  fail(runId: string, errorCode: string, retry: boolean) {
    return this.patch(runId, { status: retry ? 'pending' : 'failed', error_code: errorCode });
  }

  async findLatestByListingId(listingId: string): Promise<ListingVisualAnalysisTransport> {
    const rows = await this.request<RunRow[]>(
      `visual_analysis_runs?listing_id=eq.${listingId}&select=${runSelect}&order=created_at.desc&limit=1`,
    );
    const run = rows[0];
    return listingVisualAnalysisTransportSchema.parse({
      listingId,
      run: run
        ? {
            id: run.id,
            status: run.status,
            provider: run.provider,
            model: run.model,
            promptVersion: run.prompt_version,
            imageUrls: run.image_urls,
            imageHashes: run.image_hashes,
            summary: run.summary,
            inputTokens: run.input_tokens,
            outputTokens: run.output_tokens,
            costMicroUsd: run.cost_micro_usd === null ? null : Number(run.cost_micro_usd),
            errorCode: run.error_code,
            completedAt: run.completed_at,
          }
        : null,
      findings: run?.status === 'completed' ? run.findings : [],
    });
  }

  private async patch(runId: string, body: Record<string, unknown>, filter = '') {
    const rows = await this.request<RunRow[]>(
      `visual_analysis_runs?id=eq.${runId}${filter ? `&${filter}` : ''}&select=${runSelect}`,
      { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) },
    );
    return rows[0] ?? null;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.config.baseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: this.config.anonKey,
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok)
      throw new Error(`Supabase visual analysis request failed (${response.status}).`);
    return response.json() as Promise<T>;
  }
}
