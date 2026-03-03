import { describe, expect, it } from 'vitest';
import { formatIsoDuration } from '../lib';

describe('formatIsoDuration', () => {
  it('formats minute-second durations', () => {
    expect(formatIsoDuration('PT3M5S')).toBe('3:05');
  });

  it('formats hour-minute-second durations', () => {
    expect(formatIsoDuration('PT1H2M9S')).toBe('1:02:09');
  });
});
