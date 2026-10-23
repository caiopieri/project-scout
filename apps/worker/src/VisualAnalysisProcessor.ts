import { GeminiVisualAnalyzer, MAX_VISUAL_IMAGE_BYTES, type VisualAnalysisImage } from '@scout/ai';
import { AnalysisError } from '@scout/domain';
import type { SupabaseRestListingRepository } from '@scout/database/listings';
import type { SupabaseRestVisualAnalysisRepository } from '@scout/database/visual-analysis';
import { visualAnalysisTaskSchema } from '@scout/schemas';

const sha256 = async (bytes: ArrayBuffer) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const toBase64 = (bytes: ArrayBuffer) => {
  let binary = '';
  const view = new Uint8Array(bytes);
  for (let offset = 0; offset < view.length; offset += 0x8000)
    binary += String.fromCharCode(...view.subarray(offset, offset + 0x8000));
  return btoa(binary);
};

/** Price per million tokens in micro-USD; absent prices leave the monetary cost unknown. */
export const visualCostMicroUsd = (
  usage: { inputTokens: number; outputTokens: number },
  prices: { inputPerMTokUsd?: string; outputPerMTokUsd?: string },
) => {
  const input = Number(prices.inputPerMTokUsd);
  const output = Number(prices.outputPerMTokUsd);
  if (
    !prices.inputPerMTokUsd ||
    !prices.outputPerMTokUsd ||
    !Number.isFinite(input) ||
    !Number.isFinite(output)
  )
    return null;
  return Math.round(usage.inputTokens * input + usage.outputTokens * output);
};

export class VisualAnalysisProcessor {
  constructor(
    private readonly runs: SupabaseRestVisualAnalysisRepository,
    private readonly listings: SupabaseRestListingRepository,
    private readonly analyzer: GeminiVisualAnalyzer,
    private readonly prices: { inputPerMTokUsd?: string; outputPerMTokUsd?: string },
    private readonly fetcher: typeof fetch = globalThis.fetch,
  ) {}

  private async download(url: string): Promise<VisualAnalysisImage & { hash: string }> {
    const response = await this.fetcher(url);
    const mimeType = (response.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!response.ok || !mimeType.startsWith('image/'))
      throw new AnalysisError(
        'Listing image could not be downloaded.',
        'transient',
        'VISUAL_IMAGE_UNAVAILABLE',
      );
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_VISUAL_IMAGE_BYTES)
      throw new AnalysisError('Listing image is too large.', 'permanent', 'VISUAL_IMAGE_TOO_LARGE');
    return { mimeType, base64: toBase64(bytes), hash: await sha256(bytes) };
  }

  async process(rawTask: unknown): Promise<{ action: 'ack' | 'retry'; status: string }> {
    const task = visualAnalysisTaskSchema.safeParse(rawTask);
    if (!task.success) return { action: 'ack', status: 'invalid' };
    const run = await this.runs.claim(task.data.runId);
    if (!run) return { action: 'ack', status: 'ignored' };
    try {
      const listing = await this.listings.findById(run.listing_id);
      if (!listing)
        throw new AnalysisError('Listing no longer exists.', 'permanent', 'VISUAL_LISTING_MISSING');
      const images = await Promise.all(run.image_urls.map((url) => this.download(url)));
      const hashes = images.map(({ hash }) => hash);
      const cached = await this.runs.findCompletedByHashes(run.listing_id, hashes);
      if (cached) {
        // Same bytes were already analyzed: reuse, never pay for the same images twice.
        await this.runs.complete(run.id, {
          imageHashes: hashes,
          findings: cached.findings as never,
          summary: `${cached.summary ?? ''} (reaproveitado da análise ${cached.id})`.trim(),
          inputTokens: 0,
          outputTokens: 0,
          costMicroUsd: 0,
        });
        return { action: 'ack', status: 'cached' };
      }
      const result = await this.analyzer.analyze({
        title: listing.title,
        description: listing.description,
        condition: listing.condition,
        images: images.map(({ mimeType, base64 }) => ({ mimeType, base64 })),
      });
      await this.runs.complete(run.id, {
        imageHashes: hashes,
        findings: result.output.findings,
        summary: result.output.summary,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        costMicroUsd: visualCostMicroUsd(result.usage, this.prices),
      });
      return { action: 'ack', status: 'completed' };
    } catch (cause) {
      const error =
        cause instanceof AnalysisError
          ? cause
          : new AnalysisError(
              'Unexpected visual analysis failure.',
              'permanent',
              'UNEXPECTED_VISUAL_ANALYSIS_ERROR',
            );
      await this.runs.fail(run.id, error.code, error.kind === 'transient');
      return { action: error.kind === 'transient' ? 'retry' : 'ack', status: 'failed' };
    }
  }
}
