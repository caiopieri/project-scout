import {
  StructuredLlmTextAnalyzer,
  TEXT_ANALYSIS_BATCH_RESPONSE_SCHEMA,
  TEXT_ANALYSIS_RESPONSE_SCHEMA,
  withoutSchemaKeywords,
  type LlmJsonSchema,
  type LlmPrompt,
  type LlmUsage,
} from './llm-text-analyzer';

export const GEMINI_TEXT_ANALYSIS_PROMPT_VERSION = 'gemini-text-analysis-v1.2.0';
export const DEFAULT_GEMINI_TEXT_ANALYSIS_MODEL = 'gemini-3.5-flash';

export const GEMINI_TEXT_ANALYSIS_RESPONSE_SCHEMA = TEXT_ANALYSIS_RESPONSE_SCHEMA;
export const GEMINI_TEXT_ANALYSIS_BATCH_RESPONSE_SCHEMA = TEXT_ANALYSIS_BATCH_RESPONSE_SCHEMA;

export type GeminiTextAnalyzerOptions = {
  apiKey: string;
  model?: string;
  maxRequests?: number;
  timeoutMs?: number;
  fetcher?: typeof fetch;
  endpoint?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const numberOrZero = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;

export class GeminiTextAnalyzer extends StructuredLlmTextAnalyzer {
  readonly provider = 'gemini-api';
  readonly model: string;
  readonly promptVersion = GEMINI_TEXT_ANALYSIS_PROMPT_VERSION;
  private readonly endpoint: string;

  constructor(options: GeminiTextAnalyzerOptions) {
    super(options);
    this.model = options.model ?? DEFAULT_GEMINI_TEXT_ANALYSIS_MODEL;
    this.endpoint =
      options.endpoint ??
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
  }

  protected buildRequest(prompt: LlmPrompt, schema: LlmJsonSchema) {
    return {
      url: this.endpoint,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: prompt.system }] },
          contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            // Gemini rejects maxItems in nested response schemas; Zod still enforces the bounds.
            responseJsonSchema: withoutSchemaKeywords(schema, ['maxItems']),
          },
        }),
      },
    };
  }

  protected extractText(body: unknown): string | undefined {
    if (!isRecord(body) || !Array.isArray(body.candidates)) return undefined;
    const candidate = body.candidates[0];
    if (
      !isRecord(candidate) ||
      !isRecord(candidate.content) ||
      !Array.isArray(candidate.content.parts)
    )
      return undefined;
    const text = candidate.content.parts
      .filter(isRecord)
      .map((part) => part.text)
      .filter((part): part is string => typeof part === 'string')
      .join('');
    return text || undefined;
  }

  protected extractUsage(body: unknown): LlmUsage {
    const usage = isRecord(body) && isRecord(body.usageMetadata) ? body.usageMetadata : {};
    const inputTokens = numberOrZero(usage.promptTokenCount);
    const outputTokens = numberOrZero(usage.candidatesTokenCount);
    return {
      inputTokens,
      outputTokens,
      totalTokens: numberOrZero(usage.totalTokenCount) || inputTokens + outputTokens,
    };
  }
}
