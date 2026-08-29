import {
  AnalysisError,
  type TextAnalyzer,
  type TextAnalysisRunRepository,
  type TextBatchAnalyzer,
} from '@scout/domain';
import {
  textAnalysisBatchTaskSchema,
  textAnalysisTaskSchema,
  type TextAnalysisTask,
} from '@scout/schemas';

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

export const createTextAnalysisBatchTask = (analysisRunIds: string[]): TextAnalysisTask =>
  textAnalysisBatchTaskSchema.parse({
    kind: 'text-analysis-batch',
    version: '1',
    analysisRunIds,
  });

export class TextAnalysisBatchTaskProcessor {
  constructor(
    private readonly repository: TextAnalysisRunRepository,
    private readonly analyzer: TextAnalyzer,
    private readonly maxAttempts = 3,
  ) {}

  async process(rawTask: unknown): Promise<TextAnalysisTaskOutcome> {
    const task = textAnalysisBatchTaskSchema.safeParse(rawTask);
    if (!task.success) return { action: 'ack', status: 'failed' };
    const jobs = [];
    for (const analysisRunId of task.data.analysisRunIds) {
      const job = await this.repository.claim(analysisRunId);
      if (job) jobs.push(job);
    }
    if (!jobs.length) return { action: 'ack', status: 'ignored' };
    try {
      const batchAnalyzer = this.analyzer as Partial<TextBatchAnalyzer>;
      if (typeof batchAnalyzer.analyzeBatch !== 'function')
        throw new AnalysisError(
          'Configured analyzer does not support batch analysis.',
          'permanent',
          'LLM_BATCH_UNSUPPORTED',
        );
      const results = await batchAnalyzer.analyzeBatch(
        jobs.map(({ listingId, title, description, condition }) => ({
          listingId,
          title,
          description,
          condition,
        })),
      );
      const byListingId = new Map(results.map((item) => [item.listingId, item]));
      let failed = false;
      for (const job of jobs) {
        const result = byListingId.get(job.listingId);
        if (!result) {
          await this.repository.fail(
            job.analysisRunId,
            new AnalysisError('LLM omitted an analysis result.', 'permanent', 'LLM_RESULT_MISSING'),
          );
          failed = true;
        } else if ('error' in result) {
          await this.repository.fail(job.analysisRunId, result.error);
          failed = true;
        } else {
          await this.repository.complete(job.analysisRunId, result.result);
        }
      }
      return { action: 'ack', status: failed ? 'failed' : 'completed' };
    } catch (cause) {
      const error =
        cause instanceof AnalysisError
          ? cause
          : new AnalysisError(
              'Unexpected batch textual analysis failure.',
              'permanent',
              'UNEXPECTED_BATCH_TEXT_ANALYSIS_ERROR',
            );
      if (error.kind === 'transient' && jobs.every((job) => job.attemptCount < this.maxAttempts)) {
        await Promise.all(
          jobs.map((job) => this.repository.releaseForRetry(job.analysisRunId, error)),
        );
        return { action: 'retry', delaySeconds: Math.min(60, 2 ** jobs[0].attemptCount) };
      }
      await Promise.all(jobs.map((job) => this.repository.fail(job.analysisRunId, error)));
      return { action: 'ack', status: 'failed' };
    }
  }
}
