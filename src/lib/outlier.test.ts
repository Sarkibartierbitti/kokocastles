import { describe, it, expect } from 'vitest';
import { median, flagOutliers } from './outlier';
import type { Video } from '../types';

const v = (id: string, views: number): Video => ({
  platform: 'youtube',
  videoId: id,
  channelId: 'c',
  channelTitle: 't',
  title: id,
  publishedAt: '2026-01-01',
  viewCount: views,
  thumbnailUrl: '',
});

describe('median', () => {
  it('empty → 0', () => expect(median([])).toBe(0));
  it('odd length', () => expect(median([3, 1, 2])).toBe(2));
  it('even length', () => expect(median([4, 1, 2, 3])).toBe(2.5));
});

describe('flagOutliers', () => {
  it('empty list', () => expect(flagOutliers([])).toEqual([]));
  it('flags 2x median', () => {
    const out = flagOutliers([v('a', 100), v('b', 100), v('c', 250)]);
    expect(out.find((o) => o.video.videoId === 'c')!.isOutlier).toBe(true);
    expect(out.find((o) => o.video.videoId === 'a')!.isOutlier).toBe(false);
  });
  it('ratio reflects baseline', () => {
    const out = flagOutliers([v('a', 100), v('b', 200)]);
    expect(out[1].ratio).toBe(200 / 150);
  });
  it('respects multiplier override', () => {
    const out = flagOutliers([v('a', 100), v('b', 100), v('c', 250)], 3);
    expect(out.find((o) => o.video.videoId === 'c')!.isOutlier).toBe(false);
  });
});
