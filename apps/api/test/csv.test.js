import { describe, expect, it } from 'vitest';
import { toCsv } from '../src/lib/csv';
describe('toCsv', () => {
    it('maps selected columns in order', () => {
        const csv = toCsv([
            {
                videoId: 'a1',
                title: 'Title 1',
                url: 'https://www.youtube.com/watch?v=a1',
                channelTitle: 'Channel',
                publishedAt: '2024-01-01T00:00:00Z',
                duration: 'PT1M',
                viewCount: 11,
                likeCount: 1,
                thumbnailUrl: 'https://img/1.jpg'
            }
        ], ['url', 'title']);
        expect(csv).toContain('"url","title"');
        expect(csv).toContain('"https://www.youtube.com/watch?v=a1","Title 1"');
    });
});
