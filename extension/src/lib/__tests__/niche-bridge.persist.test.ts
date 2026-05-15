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
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(fakeStore, items);
      }),
      remove: vi.fn(async () => {}),
    },
  },
  runtime: {
    sendMessage: vi.fn(async () => ({
      type: 'scrape-result',
      payload: {
        kind: 'channel',
        channelId: 'UC1',
        channelTitle: 'Channel One',
        videos: [
          { videoId: 'v1', title: 't1', viewCount: 100, publishedAtRelative: '1d', thumbnailUrl: 'http://x/1', durationSec: 60 },
          { videoId: 'v2', title: 't2', viewCount: 200, publishedAtRelative: '2d', thumbnailUrl: 'http://x/2', durationSec: 90 },
        ],
      },
    })),
  },
};
(globalThis as Record<string, unknown>).browser = mockBrowser;

beforeEach(() => {
  for (const k of Object.keys(fakeStore)) delete fakeStore[k];
  vi.clearAllMocks();
  vi.resetModules();
});

describe('batchScrapeChannels — persist to scrapedVideos + databank', () => {
  it('writes scraped videos into cache', async () => {
    const { batchScrapeChannels } = await import('../niche-bridge');
    const { storage } = await import('../storage');
    await storage.hydrate();
    const out = await batchScrapeChannels(['UC1']);
    expect(out[0].ok).toBe(true);
    expect(storage.getScrapedVideo('youtube', 'v1')?.title).toBe('t1');
    expect(storage.getScrapedVideo('youtube', 'v2')?.channelTitle).toBe('Channel One');
  });

  it('appends refs to chosen databank', async () => {
    const { batchScrapeChannels } = await import('../niche-bridge');
    const { storage } = await import('../storage');
    await storage.hydrate();
    const bank = await storage.createDatabank('Test');
    await batchScrapeChannels(['UC1'], { databankId: bank.id });
    const after = storage.getDatabanks().find((d) => d.id === bank.id)!;
    const ids = after.videoRefs.map((r) => r.videoId).sort();
    expect(ids).toEqual(['v1', 'v2']);
  });

  it('respects latestN cap', async () => {
    const { batchScrapeChannels } = await import('../niche-bridge');
    const { storage } = await import('../storage');
    await storage.hydrate();
    const out = await batchScrapeChannels(['UC1'], { latestN: 1 });
    expect(out[0].ok && out[0].value.videos.length).toBe(1);
    expect(storage.getScrapedVideo('youtube', 'v1')).not.toBeNull();
    expect(storage.getScrapedVideo('youtube', 'v2')).toBeNull();
  });

  it('clamps latestN above 30 to 30', async () => {
    const big = Array.from({ length: 35 }, (_, i) => ({
      videoId: `b${i}`,
      title: `bt${i}`,
      viewCount: i,
      publishedAtRelative: '1d',
      thumbnailUrl: '',
      durationSec: 60,
    }));
    const originalSend = mockBrowser.runtime.sendMessage;
    mockBrowser.runtime.sendMessage = vi.fn(async () => ({
      type: 'scrape-result',
      payload: { kind: 'channel', channelId: 'UC1', channelTitle: 'Channel One', videos: big },
    }));
    try {
      const { batchScrapeChannels } = await import('../niche-bridge');
      const { storage } = await import('../storage');
      await storage.hydrate();
      const out = await batchScrapeChannels(['UC1'], { latestN: 999 });
      expect(out[0].ok && out[0].value.videos.length).toBe(30);
      expect(storage.getScrapedVideo('youtube', 'b29')).not.toBeNull();
      expect(storage.getScrapedVideo('youtube', 'b30')).toBeNull();
    } finally {
      mockBrowser.runtime.sendMessage = originalSend;
    }
  });
});
