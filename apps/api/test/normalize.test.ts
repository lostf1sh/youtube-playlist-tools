import { describe, expect, it } from 'vitest';
import { normalizeYouTubeVideo } from '../src/lib/normalize';

describe('normalizeYouTubeVideo', () => {
  it('maps YouTube payload to VideoItem', () => {
    const item = normalizeYouTubeVideo({
      id: 'video-1',
      snippet: {
        title: 'My Video',
        channelTitle: 'My Channel',
        publishedAt: '2024-01-01T00:00:00Z',
        thumbnails: {
          high: { url: 'https://img.example/high.jpg' }
        }
      },
      contentDetails: {
        duration: 'PT3M12S'
      },
      statistics: {
        viewCount: '1200',
        likeCount: '99'
      }
    });

    expect(item).toEqual({
      videoId: 'video-1',
      title: 'My Video',
      url: 'https://www.youtube.com/watch?v=video-1',
      channelTitle: 'My Channel',
      publishedAt: '2024-01-01T00:00:00Z',
      duration: 'PT3M12S',
      viewCount: 1200,
      likeCount: 99,
      thumbnailUrl: 'https://img.example/high.jpg'
    });
  });
});
