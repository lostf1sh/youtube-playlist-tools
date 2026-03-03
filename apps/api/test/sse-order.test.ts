import { describe, expect, it } from 'vitest';
import { ExtractionService } from '../src/services/extraction-service';
import { JobStore } from '../src/store/job-store';
import { createFakeYouTubeClient } from './helpers';

const waitForEvents = async (store: JobStore, jobId: string): Promise<string[]> => {
  return await new Promise((resolve, reject) => {
    const received: string[] = [];
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error('timed out waiting events'));
    }, 1000);

    const unsubscribe = store.subscribe(jobId, (event) => {
      received.push(event.event);
      if (event.event === 'job_completed') {
        clearTimeout(timer);
        unsubscribe();
        resolve(received);
      }
    });
  });
};

describe('SSE event order from extraction flow', () => {
  it('emits start, item/progress and completion events in expected order', async () => {
    const store = new JobStore(60_000);
    const service = new ExtractionService(createFakeYouTubeClient(3), store);
    const job = store.createJob({
      playlistId: 'PLABCDEFGHIJKL',
      playlistTitle: 'Demo',
      totalTarget: 3
    });

    const waitingEvents = waitForEvents(store, job.jobId);

    service.startJob({
      jobId: job.jobId,
      playlistId: job.playlistId,
      maxItems: 3
    });

    const events = await waitingEvents;

    expect(events[0]).toBe('job_started');
    expect(events).toContain('video_added');
    expect(events).toContain('progress');
    expect(events.at(-1)).toBe('job_completed');
    store.stopCleanup();
  });
});
