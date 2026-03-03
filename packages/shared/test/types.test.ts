import { describe, expect, it } from 'vitest';
import type { VideoItem } from '../src';

describe('shared types', () => {
  it('accepts VideoItem shape', () => {
    const item: VideoItem = {
      videoId: 'abc',
      title: 'title',
      url: 'https://www.youtube.com/watch?v=abc',
      channelTitle: 'channel',
      publishedAt: '2025-01-01T00:00:00.000Z',
      duration: 'PT1M',
      viewCount: 1,
      likeCount: 1,
      thumbnailUrl: 'https://i.ytimg.com/test.jpg'
    };

    expect(item.videoId).toBe('abc');
  });
});
