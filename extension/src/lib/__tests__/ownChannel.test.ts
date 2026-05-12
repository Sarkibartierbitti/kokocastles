import { describe, it, expect } from 'vitest';
import { applyHypothesisTagging } from '../ownChannel';
import type { Hypothesis, Video } from '../../types';

function v(id: string): Video {
  return {
    platform: 'youtube',
    videoId: id,
    channelId: 'c',
    channelTitle: 'me',
    title: id,
    publishedAt: '',
    viewCount: 0,
    thumbnailUrl: '',
  };
}

function h(overrides: Partial<Hypothesis> = {}): Hypothesis {
  return {
    id: 'h1',
    name: 'H',
    description: '',
    manualVideoIds: [],
    applyToNext: 0,
    appliedAuto: [],
    seedSnapshotIds: [],
    createdAt: '2026-05-12T00:00:00Z',
    ...overrides,
  };
}

describe('applyHypothesisTagging', () => {
  it('no hypotheses → empty tagged', () => {
    const r = applyHypothesisTagging(['a'], [v('a'), v('b')], []);
    expect(r.hypotheses).toEqual([]);
    expect(r.tagged).toEqual({});
  });

  it('applyToNext=0 → skip tagging', () => {
    const r = applyHypothesisTagging(['a'], [v('a'), v('b')], [h({ applyToNext: 0 })]);
    expect(r.tagged).toEqual({});
    expect(r.hypotheses[0].appliedAuto).toEqual([]);
  });

  it('applyToNext=2, 2 new videos → both tagged', () => {
    const r = applyHypothesisTagging(['a'], [v('a'), v('b'), v('c')], [h({ applyToNext: 2, seedSnapshotIds: ['a'] })]);
    expect(r.tagged.h1).toEqual(['b', 'c']);
    expect(r.hypotheses[0].appliedAuto).toEqual(['b', 'c']);
  });

  it('applyToNext=2, 4 new → first 2 in order', () => {
    const r = applyHypothesisTagging(
      ['a'],
      [v('a'), v('b'), v('c'), v('d'), v('e')],
      [h({ applyToNext: 2, seedSnapshotIds: ['a'] })]
    );
    expect(r.tagged.h1).toEqual(['b', 'c']);
  });

  it('skips ids in seedSnapshotIds', () => {
    // seed includes b — so it never counts as "new" for this hypothesis
    const r = applyHypothesisTagging(
      ['a'],
      [v('a'), v('b'), v('c')],
      [h({ applyToNext: 2, seedSnapshotIds: ['a', 'b'] })]
    );
    expect(r.tagged.h1).toEqual(['c']);
  });

  it('does not re-tag ids already in appliedAuto', () => {
    const r = applyHypothesisTagging(
      ['a', 'b'],
      [v('a'), v('b'), v('c')],
      [h({ applyToNext: 2, seedSnapshotIds: ['a'], appliedAuto: ['b'] })]
    );
    // b already in appliedAuto AND already in prev — so only c is new; tag c, total appliedAuto = ['b','c']
    expect(r.hypotheses[0].appliedAuto).toEqual(['b', 'c']);
    expect(r.tagged.h1).toEqual(['c']);
  });

  it('skips ids that are already manualVideoIds', () => {
    const r = applyHypothesisTagging(
      ['a'],
      [v('a'), v('b'), v('c')],
      [h({ applyToNext: 2, seedSnapshotIds: ['a'], manualVideoIds: ['b'] })]
    );
    expect(r.tagged.h1).toEqual(['c']);
  });

  it('caps tagged at applyToNext when already partially filled', () => {
    const r = applyHypothesisTagging(
      ['a', 'b'],
      [v('a'), v('b'), v('c'), v('d')],
      [h({ applyToNext: 3, seedSnapshotIds: ['a'], appliedAuto: ['b'] })]
    );
    expect(r.hypotheses[0].appliedAuto).toEqual(['b', 'c', 'd']);
  });
});
