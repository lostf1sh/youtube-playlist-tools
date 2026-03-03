import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { JobStore } from '../src/store/job-store';
import { createFakeYouTubeClient } from './helpers';

const waitFor = async (check: () => Promise<boolean> | boolean, timeoutMs = 1000): Promise<void> => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Timeout while waiting for condition');
};

describe('Extraction API integration', () => {
  const store = new JobStore(60_000);

  beforeEach(() => {
    store.stopCleanup();
  });

  it('creates extraction and returns paginated videos', async () => {
    const app = await buildApp({
      youtubeClient: createFakeYouTubeClient(6),
      jobStore: store,
      batchDelayMs: 0
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/extractions',
      payload: {
        playlistUrl: 'https://www.youtube.com/playlist?list=PLABCDEFGHIJKL',
        mode: 'paginated',
        pageSize: 2
      }
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json() as { jobId: string };

    await waitFor(async () => {
      const status = await app.inject({ method: 'GET', url: `/api/extractions/${created.jobId}` });
      return status.json().status === 'completed';
    });

    const page1 = await app.inject({
      method: 'GET',
      url: `/api/extractions/${created.jobId}/videos?page=1&pageSize=2`
    });

    expect(page1.statusCode).toBe(200);
    const body = page1.json() as { items: unknown[]; pagination: { totalPages: number; totalItems: number } };
    expect(body.items).toHaveLength(2);
    expect(body.pagination.totalPages).toBe(3);
    expect(body.pagination.totalItems).toBe(6);

    await app.close();
  });

  it('returns large playlist choice required when count exceeds 1000', async () => {
    const app = await buildApp({
      youtubeClient: createFakeYouTubeClient(1200),
      jobStore: new JobStore(60_000),
      batchDelayMs: 0
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/extractions',
      payload: {
        playlistUrl: 'https://www.youtube.com/playlist?list=PLABCDEFGHIJKL',
        mode: 'realtime'
      }
    });

    expect(response.statusCode).toBe(409);
    const body = response.json() as { code: string };
    expect(body.code).toBe('LARGE_PLAYLIST_CHOICE_REQUIRED');

    await app.close();
  });
});
