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
      remove: vi.fn(async (keys: string | string[]) => {
        const arr = typeof keys === 'string' ? [keys] : keys;
        for (const k of arr) delete fakeStore[k];
      }),
    },
  },
};
(globalThis as Record<string, unknown>).browser = mockBrowser;

beforeEach(() => {
  for (const k of Object.keys(fakeStore)) delete fakeStore[k];
  vi.clearAllMocks();
  vi.resetModules();
});

describe('storage — analysis settings', () => {
  it('outlier threshold defaults to 1.5', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    expect(storage.getOutlierThreshold()).toBe(1.5);
  });

  it('outlier threshold persists', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.setOutlierThreshold(2.3);
    expect(storage.getOutlierThreshold()).toBe(2.3);
    expect(fakeStore['koko.outlierThreshold']).toBe(2.3);
  });

  it('own channel defaults to null', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    expect(storage.getOwnChannel()).toBeNull();
  });

  it('own channel persists', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.setOwnChannel({
      platform: 'youtube',
      channelId: 'UCown',
      title: 'Me',
    });
    expect(storage.getOwnChannel()?.channelId).toBe('UCown');
  });

  it('refresh interval defaults to 6 hours', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    expect(storage.getRefreshIntervalHours()).toBe(6);
  });

  it('throttle concurrency defaults to 2', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    expect(storage.getThrottleConcurrency()).toBe(2);
  });

  it('throttle jitterMs defaults to 2500', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    expect(storage.getThrottleJitterMs()).toBe(2500);
  });

  it('cache LRU cap defaults to 10000', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    expect(storage.getCacheLruCap()).toBe(10000);
  });
});
