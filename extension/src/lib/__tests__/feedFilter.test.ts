import { describe, it, expect } from 'vitest';
import { searchRows, filterRows, sortRows, applyHidden, type FeedRow } from '../feedFilter';

const sample: FeedRow[] = [
  { videoId: 'a', channelId: 'C1', channelTitle: 'Alpha', title: 'cats are funny', viewCount: 100, likeCount: 10, publishedAt: '2026-01-01', outlierRatio: 0.5 },
  { videoId: 'b', channelId: 'C2', channelTitle: 'Beta', title: 'dogs are loud', viewCount: 1000, likeCount: 200, publishedAt: '2026-03-01', outlierRatio: 2.0 },
  { videoId: 'c', channelId: 'C1', channelTitle: 'Alpha', title: 'birds chirp', viewCount: 50, likeCount: 5, publishedAt: '2026-02-15', outlierRatio: 0.2 },
];

describe('searchRows', () => {
  it('matches title and channel', () => {
    expect(searchRows(sample, 'cats')).toHaveLength(1);
    expect(searchRows(sample, 'alpha')).toHaveLength(2);
  });
  it('empty query returns all', () => {
    expect(searchRows(sample, '   ')).toHaveLength(3);
  });
});

describe('filterRows', () => {
  it('minViews drops smaller', () => {
    expect(filterRows(sample, { minViews: 100 })).toHaveLength(2);
  });
  it('minOutlier filters', () => {
    expect(filterRows(sample, { minOutlier: 1.5 })).toHaveLength(1);
  });
  it('fromDate keeps newer', () => {
    expect(filterRows(sample, { fromDate: '2026-02-01' })).toHaveLength(2);
  });
});

describe('sortRows', () => {
  it('views desc', () => {
    expect(sortRows(sample, 'views', 'desc').map((r) => r.videoId)).toEqual(['b', 'a', 'c']);
  });
  it('outlier asc', () => {
    expect(sortRows(sample, 'outlier', 'asc').map((r) => r.videoId)).toEqual(['c', 'a', 'b']);
  });
  it('does not mutate input', () => {
    const before = sample.map((r) => r.videoId);
    sortRows(sample, 'views', 'desc');
    expect(sample.map((r) => r.videoId)).toEqual(before);
  });
});

describe('applyHidden', () => {
  it('drops permanent + session hidden', () => {
    const hidden = new Set(['youtube::a']);
    const session = new Set(['youtube::b']);
    expect(applyHidden(sample, hidden, session)).toHaveLength(1);
  });
});
