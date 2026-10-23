import { AnalysisError, type TextAnalysisBatchItem, type TextBatchAnalyzer } from '@scout/domain';
import type { TextAnalysisInput, TextAnalysisResult } from '@scout/schemas';
import {
  StructuredLlmTextAnalyzer,
  type LlmJsonSchema,
  type LlmPrompt,
  type LlmUsage,
  type StructuredLlmOptions,
} from './llm-text-analyzer';

export const OPENAI_COMPATIBLE_TEXT_ANALYSIS_PROMPT_VERSION =
  'openai-compatible-text-analysis-v1.2.0';

/** Known OpenAI-compatible chat-completions providers and their default models. */
export const OPENAI_COMPATIBLE_PROVIDERS = {
  groq: { baseUrl: 'https://api.groq.com/openai/v1', model: 'qwen/qwen3.8-27b' },
  cerebras: { baseUrl: 'https://api.cerebras.ai/v1', model: 'qwen-3.8-27b' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', model: 'qwen/qwen3.8-27b' },
} as const;
export type OpenAiCompatibleProvider = keyof typeof OPENAI_COMPATIBLE_PROVIDERS;

export type OpenAiCompatibleTextAnalyzerOptions = StructuredLlmOptions & {
  provider: OpenAiCompatibleProvider;
  model?: string;
  baseUrl?: string;
  /** Providers default to small completions (Groq: 2048), which truncates 20-item batches. */
  maxOutputTokens?: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const numberOrZero = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;

export class OpenAiCompatibleTextAnalyzer extends StructuredLlmTextAnalyzer {
  readonly provider: string;
  readonly model: string;
  readonly promptVersion = OPENAI_COMPATIBLE_TEXT_ANALYSIS_PROMPT_VERSION;
  private readonly baseUrl: string;
  private readonly maxOutputTokens: number;

  constructor(options: OpenAiCompatibleTextAnalyzerOptions) {
    super(options);
    const defaults = OPENAI_COMPATIBLE_PROVIDERS[options.provider];
    this.provider = `${options.provider}-api`;
    this.model = options.model ?? defaults.model;
    this.baseUrl = options.baseUrl ?? defaults.baseUrl;
    this.maxOutputTokens = options.maxOutputTokens ?? 16_384;
  }

  protected buildRequest(prompt: LlmPrompt, schema: LlmJsonSchema) {
    return {
      url: `${this.baseUrl}/chat/completions`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          max_tokens: this.maxOutputTokens,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'text_analysis', strict: false, schema },
          },
        }),
      },
    };
  }

  protected extractText(body: unknown): string | undefined {
    if (!isRecord(body) || !Array.isArray(body.choices)) return undefined;
    const choice = body.choices[0];
    if (!isRecord(choice) || !isRecord(choice.message)) return undefined;
    return typeof choice.message.content === 'string' ? choice.message.content : undefined;
  }

  protected extractUsage(body: unknown): LlmUsage {
    const usage = isRecord(body) && isRecord(body.usage) ? body.usage : {};
    const inputTokens = numberOrZero(usage.prompt_tokens);
    const outputTokens = numberOrZero(usage.completion_tokens);
    return {
      inputTokens,
      outputTokens,
      totalTokens: numberOrZero(usage.total_tokens) || inputTokens + outputTokens,
    };
  }
}

/** Errors that say "this provider cannot serve now", so the next provider should be tried. */
const FALLBACK_CODES = new Set([
  'LLM_PROVIDER_RATE_LIMITED',
  'LLM_PROVIDER_UNAVAILABLE',
  'LLM_REQUEST_BUDGET_EXHAUSTED',
  'LLM_AUTHENTICATION_FAILED',
  'LLM_PROVIDER_PAYMENT_REQUIRED',
  'LLM_CONFIGURATION_MISSING',
  'LLM_INVALID_RESPONSE',
]);

const RETRYABLE_ITEM_CODES = new Set(['LLM_RETURN_ID_INVALID', 'LLM_INVALID_ITEM']);

/**
 * Tries providers in order. A provider that is rate limited, unpaid, misconfigured or returns
 * an unparseable payload is skipped; the result always names the provider and model that
 * actually produced it. When every provider fails, the last error is raised unchanged.
 */
export class FallbackTextAnalyzer implements TextBatchAnalyzer {
  readonly provider = 'llm-chain';
  readonly model: string;
  readonly promptVersion = 'llm-chain-text-analysis-v1.1.0';

  constructor(private readonly analyzers: StructuredLlmTextAnalyzer[]) {
    // An empty chain must not break queue startup (collection shares the consumer); it fails
    // each analysis permanently instead.
    this.model =
      analyzers.map((analyzer) => `${analyzer.provider}:${analyzer.model}`).join('>') || 'none';
  }

  private async attempt<T>(call: (analyzer: StructuredLlmTextAnalyzer) => Promise<T>): Promise<T> {
    let lastError: unknown = new AnalysisError(
      'No LLM provider is configured.',
      'permanent',
      'LLM_CONFIGURATION_MISSING',
    );
    const ready = this.analyzers.filter((analyzer) => !analyzer.isRateLimited());
    for (const analyzer of ready.length ? ready : this.analyzers) {
      try {
        return await call(analyzer);
      } catch (error) {
        lastError = error;
        if (!(error instanceof AnalysisError) || !FALLBACK_CODES.has(error.code)) throw error;
      }
    }
    throw lastError;
  }

  analyze(input: TextAnalysisInput): Promise<TextAnalysisResult> {
    return this.attempt((analyzer) => analyzer.analyze(input));
  }

  /**
   * Items a provider omitted or returned invalid are retried, alone, on the next providers.
   * Items no provider could analyze keep the last provider's item error.
   */
  async analyzeBatch(inputs: TextAnalysisInput[]): Promise<TextAnalysisBatchItem[]> {
    const results = new Map<string, TextAnalysisBatchItem>();
    let remaining = inputs;
    let lastError: unknown;
    for (const analyzer of this.analyzers) {
      if (!remaining.length) break;
      if (analyzer.isRateLimited() && this.analyzers.some((other) => !other.isRateLimited()))
        continue;
      try {
        const items = await analyzer.analyzeBatch(remaining);
        for (const item of items) results.set(item.listingId, item);
        remaining = remaining.filter((input) => {
          const item = results.get(input.listingId);
          return Boolean(item && 'error' in item && RETRYABLE_ITEM_CODES.has(item.error.code));
        });
      } catch (error) {
        lastError = error;
        if (!(error instanceof AnalysisError) || !FALLBACK_CODES.has(error.code)) throw error;
      }
    }
    if (!results.size)
      throw (
        lastError ??
        new AnalysisError(
          'No LLM provider is configured.',
          'permanent',
          'LLM_CONFIGURATION_MISSING',
        )
      );
    return inputs.map(
      (input) =>
        results.get(input.listingId) ?? {
          listingId: input.listingId,
          error: new AnalysisError(
            'No provider analyzed this item.',
            'permanent',
            'LLM_RETURN_ID_INVALID',
          ),
        },
    );
  }
}
