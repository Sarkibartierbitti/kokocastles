import { describe, it, expect, beforeEach, vi } from 'vitest';

const fakeStore: Record<string, unknown> = {};
(globalThis as Record<string, unknown>).browser = {
  storage: {
    local: {
      get: vi.fn(async () => ({ ...fakeStore })),
      set: vi.fn(async (items: Record<string, unknown>) => Object.assign(fakeStore, items)),
      remove: vi.fn(async () => {}),
    },
  },
};

beforeEach(() => {
  for (const k of Object.keys(fakeStore)) delete fakeStore[k];
  vi.resetModules();
});

function makeHyp(id: string, applyToNext = 0): import('../../types').Hypothesis {
  return {
    id,
    name: `H-${id}`,
    description: '',
    manualVideoIds: [],
    applyToNext,
    appliedAuto: [],
    seedSnapshotIds: [],
    createdAt: '2026-05-12T00:00:00Z',
  };
}

describe('storage.hypotheses', () => {
  it('default empty', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    expect(storage.getHypotheses()).toEqual([]);
  });

  it('upsert creates', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.upsertHypothesis(makeHyp('a'));
    expect(storage.getHypotheses()).toHaveLength(1);
  });

  it('upsert replaces by id', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.upsertHypothesis(makeHyp('a'));
    await storage.upsertHypothesis({ ...makeHyp('a'), name: 'changed' });
    const list = storage.getHypotheses();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('changed');
  });

  it('delete removes', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.upsertHypothesis(makeHyp('a'));
    await storage.deleteHypothesis('a');
    expect(storage.getHypotheses()).toHaveLength(0);
  });

  it('ownChannelVideos round-trip', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.setOwnChannelVideos([
      { platform: 'youtube', videoId: 'v1', channelId: 'c', channelTitle: 'me', title: 't', publishedAt: '', viewCount: 1, thumbnailUrl: '' },
    ]);
    expect(storage.getOwnChannelVideos()).toHaveLength(1);
    await storage.setOwnChannelRefreshedAt('2026-05-12T01:00:00Z');
    expect(storage.getOwnChannelRefreshedAt()).toBe('2026-05-12T01:00:00Z');
  });
});
