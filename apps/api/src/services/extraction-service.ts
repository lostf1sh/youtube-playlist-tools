import type { LargePlaylistChoice } from '@ypt/shared';
import { JobStore } from '../store/job-store';
import { normalizeYouTubeVideo } from '../lib/normalize';
import type { YouTubeClient } from '../lib/youtube';

const choiceToLimit: Record<Exclude<LargePlaylistChoice, 'all'>, number> = {
  first500: 500,
  first1000: 1000
};

export const resolveTargetCount = (itemCount: number, choice?: LargePlaylistChoice): number => {
  if (itemCount <= 1000) {
    return itemCount;
  }

  if (!choice) {
    return itemCount;
  }

  if (choice === 'all') {
    return itemCount;
  }

  return Math.min(choiceToLimit[choice], itemCount);
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class ExtractionService {
  public constructor(
    private readonly youtubeClient: YouTubeClient,
    private readonly jobStore: JobStore,
    private readonly batchSize: number = 10,
    private readonly batchDelayMs: number = 750
  ) { }

  public startJob(args: { jobId: string; playlistId: string; maxItems: number }): void {
    void this.runJob(args).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unknown extraction error';
      this.jobStore.setStatus(args.jobId, 'failed', message);
    });
  }

  private async runJob(args: { jobId: string; playlistId: string; maxItems: number }): Promise<void> {
    this.jobStore.setStatus(args.jobId, 'running');
    this.jobStore.publishStart(args.jobId);

    let processed = 0;
    let isFirstBatch = true;

    for await (const idBatch of this.youtubeClient.iteratePlaylistVideoIds(args.playlistId, args.maxItems, this.batchSize)) {
      if (!isFirstBatch && this.batchDelayMs > 0) {
        await sleep(this.batchDelayMs);
      }
      isFirstBatch = false;

      const rawVideos = await this.youtubeClient.getVideosByIds(idBatch);
      const normalized = rawVideos.map(normalizeYouTubeVideo);
      this.jobStore.appendItems(args.jobId, normalized);

      processed += normalized.length;
      this.jobStore.setProcessed(args.jobId, processed);

      if (processed >= args.maxItems) {
        break;
      }
    }

    this.jobStore.setProcessed(args.jobId, processed);
    this.jobStore.setStatus(args.jobId, 'completed');
  }
}
