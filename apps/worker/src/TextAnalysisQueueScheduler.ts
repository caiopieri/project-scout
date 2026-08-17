import { createTextAnalysisTask } from '@scout/ai';
import type { TextAnalyzer, TextAnalysisRunRepository, TextAnalysisScheduler } from '@scout/domain';
import type { TextAnalysisTask } from '@scout/schemas';

export class TextAnalysisQueueScheduler implements TextAnalysisScheduler {
  constructor(
    private readonly repository: TextAnalysisRunRepository,
    private readonly queue: Queue<TextAnalysisTask>,
    private readonly analyzer: TextAnalyzer,
  ) {}

  async schedule(listingIds: string[]) {
    for (const listingId of new Set(listingIds)) {
      const requested = await this.repository.request({
        listingId,
        provider: this.analyzer.provider,
        model: this.analyzer.model,
        promptVersion: this.analyzer.promptVersion,
      });
      if (!requested.shouldQueue) continue;
      await this.queue.send(createTextAnalysisTask(requested.analysisRunId));
      await this.repository.markQueued(requested.analysisRunId);
    }
  }
}
