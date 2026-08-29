import { createTextAnalysisBatchTask, createTextAnalysisTask } from '@scout/ai';
import type {
  TextAnalyzer,
  TextAnalysisRunRepository,
  TextAnalysisScheduler,
  TextBatchAnalyzer,
} from '@scout/domain';
import type { TextAnalysisTask } from '@scout/schemas';

export class TextAnalysisQueueScheduler implements TextAnalysisScheduler {
  constructor(
    private readonly repository: TextAnalysisRunRepository,
    private readonly queue: Queue<TextAnalysisTask>,
    private readonly analyzer: TextAnalyzer,
  ) {}

  async schedule(listingIds: string[]) {
    const analysisRunIds: string[] = [];
    for (const listingId of new Set(listingIds)) {
      const requested = await this.repository.request({
        listingId,
        provider: this.analyzer.provider,
        model: this.analyzer.model,
        promptVersion: this.analyzer.promptVersion,
      });
      if (!requested.shouldQueue) continue;
      analysisRunIds.push(requested.analysisRunId);
    }
    const batchAnalyzer = this.analyzer as Partial<TextBatchAnalyzer>;
    if (typeof batchAnalyzer.analyzeBatch !== 'function') {
      for (const analysisRunId of analysisRunIds) {
        await this.queue.send(createTextAnalysisTask(analysisRunId));
        await this.repository.markQueued(analysisRunId);
      }
      return;
    }
    for (let index = 0; index < analysisRunIds.length; index += 20) {
      const batch = analysisRunIds.slice(index, index + 20);
      await this.queue.send(
        batch.length === 1 ? createTextAnalysisTask(batch[0]) : createTextAnalysisBatchTask(batch),
      );
      await Promise.all(batch.map((analysisRunId) => this.repository.markQueued(analysisRunId)));
    }
  }
}
