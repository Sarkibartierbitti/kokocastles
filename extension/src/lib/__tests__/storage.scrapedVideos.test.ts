import { describe, it, expect, beforeEach, vi } from 'vitest';

const fakeStore: Record<string, unknown> = {};
const mockBrowser = {
  storage: {
    local: {
      get: vi.fn(async (keys?: string | string[] | null) => {
        if (keys == null) return { ...fakeStore };
        const arr = typeof keys === 'string' ? [keys] : keys;
        const out: Record<string, unknown> = {};
        for (const k of arr) if (k in fakeStore) out[k] = fakeStore[k];
        return out;
      }),
      set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(fakeStore, items); }),
      remove: vi.fn(async () => {}),
    },
  },
};
(globalThis as Record<string, unknown>).browser = mockBrowser;

beforeEach(() => {
  for (const k of Object.keys(fakeStore)) delete fakeStore[k];
  vi.clearAllMocks();
  vi.resetModules();
});

describe('storage — scrapedVideos cache', () => {
  it('returns empty map by default', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    expect(storage.getScrapedVideos()).toEqual({});
    expect(storage.getScrapedVideo('youtube', 'abc')).toBeNull();
  });

  it('bulk upserts entries by platform::videoId', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.setScrapedVideos([
      {
        platform: 'youtube', videoId: 'a1', channelId: 'UC1', channelTitle: 'C1',
        title: 't1', viewCount: 100, publishedAtRelative: '1d', thumbnailUrl: 'http://x/1', durationSec: 60,
        fetchedAt: '2026-05-15T00:00:00Z',
      },
      {
        platform: 'youtube', videoId: 'a2', channelId: 'UC1', channelTitle: 'C1',
        title: 't2', viewCount: 200, publishedAtRelative: '2d', thumbnailUrl: 'http://x/2', durationSec: 90,
        fetchedAt: '2026-05-15T00:00:00Z',
      },
    ]);
    expect(storage.getScrapedVideo('youtube', 'a1')?.title).toBe('t1');
    expect(storage.getScrapedVideo('youtube', 'a2')?.viewCount).toBe(200);
  });

  it('overwrites by key on re-upsert', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.setScrapedVideos([{
      platform: 'youtube', videoId: 'a1', channelId: 'UC1', channelTitle: 'C1',
      title: 'old', viewCount: 1, publishedAtRelative: '1d', thumbnailUrl: '', durationSec: null,
      fetchedAt: '2026-05-15T00:00:00Z',
    }]);
    await storage.setScrapedVideos([{
      platform: 'youtube', videoId: 'a1', channelId: 'UC1', channelTitle: 'C1',
      title: 'new', viewCount: 9, publishedAtRelative: '2d', thumbnailUrl: '', durationSec: null,
      fetchedAt: '2026-05-15T01:00:00Z',
    }]);
    expect(storage.getScrapedVideo('youtube', 'a1')?.title).toBe('new');
    expect(storage.getScrapedVideo('youtube', 'a1')?.viewCount).toBe(9);
  });
});
