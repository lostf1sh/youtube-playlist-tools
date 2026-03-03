import { describe, expect, it } from 'vitest';
import { parsePlaylistId } from '../src/lib/playlist';

describe('parsePlaylistId', () => {
  it('parses playlist ID from URL', () => {
    const id = parsePlaylistId('https://www.youtube.com/playlist?list=PL1234567890AB');
    expect(id).toBe('PL1234567890AB');
  });

  it('parses playlist ID from watch URL', () => {
    const id = parsePlaylistId('https://www.youtube.com/watch?v=abc123&list=PLABCDEFGHIJKL');
    expect(id).toBe('PLABCDEFGHIJKL');
  });

  it('returns null for invalid input', () => {
    expect(parsePlaylistId('invalid-url')).toBeNull();
  });
});
