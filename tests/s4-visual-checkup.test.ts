import { describe, expect, it, vi } from 'vitest';
import { GeminiVisualAnalyzer, selectVisualCheckupImages } from '@scout/ai';
import {
  VisualAnalysisProcessor,
  visualCostMicroUsd,
} from '../apps/worker/src/VisualAnalysisProcessor';

const finding = (imageIndex: number, kind = 'visible_damage') => ({
  imageIndex,
  kind,
  component: 'screen',
  description: 'Spider-web crack across the lower half of the screen.',
  confidence: 0.92,
  mentionedInDescription: false,
});
const geminiResponse = (findings: unknown[]) =>
  new Response(
    JSON.stringify({
      candidates: [
        {
          content: { parts: [{ text: JSON.stringify({ findings, summary: 'Cracked screen.' }) }] },
        },
      ],
      usageMetadata: { promptTokenCount: 1300, candidatesTokenCount: 280 },
    }),
    { status: 200 },
  );
const image = { mimeType: 'image/jpeg', base64: 'AAAA' };
const input = {
  title: 'iPhone 13',
  description: 'Fully tested.',
  condition: 'Used',
  images: [image, image],
};

describe('S4 visual checkup', () => {
  it('selects the cover, any photo the description points to, then the next ones (max 3)', () => {
    const urls = ['a', 'b', 'c', 'd', 'e', 'a'];
    expect(selectVisualCheckupImages(urls, 'see foto 4 for the dent')).toEqual(['a', 'd', 'b']);
    expect(selectVisualCheckupImages(urls, 'no references')).toEqual(['a', 'b', 'c']);
    expect(selectVisualCheckupImages([], 'foto 2')).toEqual([]);
  });

  it('sends images inline with hostile text enveloped and validates image indexes', async () => {
    const fetcher = vi.fn(async () => geminiResponse([finding(1)]));
    const result = await new GeminiVisualAnalyzer('k', 'gemini-3.5-flash', fetcher).analyze(input);
    const body = JSON.parse(
      String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    );
    expect(body.contents[0].parts[0].text).toContain('<listing_description>');
    expect(body.contents[0].parts.slice(1)).toHaveLength(2);
    expect(JSON.stringify(body.generationConfig)).not.toContain('maxItems');
    expect(result.usage).toEqual({ inputTokens: 1300, outputTokens: 280 });
    const outOfRange = new GeminiVisualAnalyzer(
      'k',
      'm',
      vi.fn(async () => geminiResponse([finding(2)])),
    );
    await expect(outOfRange.analyze(input)).rejects.toMatchObject({ code: 'LLM_INVALID_RESPONSE' });
  });

  it('measures cost from tokens and leaves money unknown without configured prices', () => {
    expect(
      visualCostMicroUsd(
        { inputTokens: 1_000_000, outputTokens: 500_000 },
        { inputPerMTokUsd: '0.3', outputPerMTokUsd: '2.5' },
      ),
    ).toBe(1_550_000);
    expect(visualCostMicroUsd({ inputTokens: 10, outputTokens: 10 }, {})).toBeNull();
  });

  it('never pays twice for the same image bytes', async () => {
    const run = { id: 'run-2', listing_id: 'listing-1', image_urls: ['https://cdn/x.jpg'] };
    const runs = {
      claim: vi.fn(async () => run),
      findCompletedByHashes: vi.fn(async () => ({
        id: 'run-1',
        findings: [finding(0)],
        summary: 'Cracked.',
      })),
      complete: vi.fn(async () => null),
      fail: vi.fn(async () => null),
    };
    const analyzer = { analyze: vi.fn() };
    const processor = new VisualAnalysisProcessor(
      runs as never,
      {
        findById: vi.fn(async () => ({ title: 't', description: 'd', condition: 'Used' })),
      } as never,
      analyzer as never,
      {},
      vi.fn(
        async () =>
          new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }),
      ),
    );
    const outcome = await processor.process({
      kind: 'visual-analysis',
      version: '1',
      runId: '11111111-1111-4111-a111-111111111111',
    });
    expect(outcome.status).toBe('cached');
    expect(analyzer.analyze).not.toHaveBeenCalled();
    expect(runs.complete).toHaveBeenCalledWith(
      'run-2',
      expect.objectContaining({ inputTokens: 0, costMicroUsd: 0 }),
    );
  });

  it('refuses non-image downloads and retries transient failures', async () => {
    const runs = {
      claim: vi.fn(async () => ({
        id: 'r',
        listing_id: 'l',
        image_urls: ['https://cdn/page.html'],
      })),
      findCompletedByHashes: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn(async () => null),
    };
    const processor = new VisualAnalysisProcessor(
      runs as never,
      {
        findById: vi.fn(async () => ({ title: 't', description: 'd', condition: 'Used' })),
      } as never,
      { analyze: vi.fn() } as never,
      {},
      vi.fn(async () => new Response('<html>', { headers: { 'content-type': 'text/html' } })),
    );
    const outcome = await processor.process({
      kind: 'visual-analysis',
      version: '1',
      runId: '11111111-1111-4111-a111-111111111111',
    });
    expect(outcome.action).toBe('retry');
    expect(runs.fail).toHaveBeenCalledWith('r', 'VISUAL_IMAGE_UNAVAILABLE', true);
  });
});
