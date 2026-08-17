import { AnalysisError, type TextAnalyzer, type TextAnalysisRunRepository } from '@scout/domain';
import { textAnalysisTaskSchema, type TextAnalysisTask } from '@scout/schemas';

export type TextAnalysisTaskOutcome =
  | { action: 'ack'; status: 'completed' | 'ignored' | 'failed' }
  | { action: 'retry'; delaySeconds: number };

export class TextAnalysisTaskProcessor {
  constructor(
    private readonly repository: TextAnalysisRunRepository,
    private readonly analyzer: TextAnalyzer,
    private readonly maxAttempts = 3,
  ) {}

  async process(rawTask: unknown): Promise<TextAnalysisTaskOutcome> {
    const task = textAnalysisTaskSchema.safeParse(rawTask);
    if (!task.success) return { action: 'ack', status: 'failed' };
    const job = await this.repository.claim(task.data.analysisRunId);
    if (!job) return { action: 'ack', status: 'ignored' };
    try {
      const result = await this.analyzer.analyze({
        listingId: job.listingId,
        title: job.title,
        description: job.description,
        condition: job.condition,
      });
      await this.repository.complete(job.analysisRunId, result);
      return { action: 'ack', status: 'completed' };
    } catch (cause) {
      const error =
        cause instanceof AnalysisError
          ? cause
          : new AnalysisError(
              'Unexpected textual analysis failure.',
              'permanent',
              'UNEXPECTED_TEXT_ANALYSIS_ERROR',
            );
      if (error.kind === 'transient' && job.attemptCount < this.maxAttempts) {
        await this.repository.releaseForRetry(job.analysisRunId, error);
        return { action: 'retry', delaySeconds: Math.min(60, 2 ** job.attemptCount) };
      }
      await this.repository.fail(job.analysisRunId, error);
      return { action: 'ack', status: 'failed' };
    }
  }
}

export const createTextAnalysisTask = (analysisRunId: string): TextAnalysisTask =>
  textAnalysisTaskSchema.parse({ kind: 'text-analysis', version: '1', analysisRunId });
