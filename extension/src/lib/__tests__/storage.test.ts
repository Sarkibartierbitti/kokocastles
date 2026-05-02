import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock browser.storage.local
const fakeStore: Record<string, unknown> = {};
const mockBrowser = {
  storage: {
    local: {
      get: vi.fn(async (keys?: string | string[] | null) => {
        if (keys == null) return { ...fakeStore };
        const arr = typeof keys === 'string' ? [keys] : keys;
        const out: Record<string, unknown> = {};
        for (const k of arr) {
          if (k in fakeStore) out[k] = fakeStore[k];
        }
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
  // Force module re-import each test by clearing module cache
  vi.resetModules();
});

describe('storage', () => {
  it('returns empty defaults before hydration', async () => {
    const { storage } = await import('../storage');
    expect(storage.getLLMKey()).toBe('');
    expect(storage.getWatchlist()).toEqual([]);
  });

  it('hydrates from browser.storage.local', async () => {
    fakeStore['koko.llmKey'] = 'sk-test';
    fakeStore['koko.watchlist'] = [{ platform: 'youtube', channelId: 'UC1', title: 't' }];
    const { storage } = await import('../storage');
    await storage.hydrate();
    expect(storage.getLLMKey()).toBe('sk-test');
    expect(storage.getWatchlist()).toHaveLength(1);
  });

  it('write-through persists to browser.storage.local', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.setLLMKey('sk-new');
    expect(fakeStore['koko.llmKey']).toBe('sk-new');
    expect(storage.getLLMKey()).toBe('sk-new');
  });

  it('per-video deep cache reads on demand', async () => {
    fakeStore['koko.deep.youtube.abc'] = { hook: { type: 'visual' } };
    const { storage } = await import('../storage');
    await storage.hydrate();
    const r = await storage.getDeep('youtube', 'abc');
    expect(r).toEqual({ hook: { type: 'visual' } });
  });

  it('addToWatchlist deduplicates by platform+channelId', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    const c = { platform: 'youtube' as const, channelId: 'UC1', title: 't' };
    await storage.addToWatchlist(c);
    await storage.addToWatchlist(c);
    expect(storage.getWatchlist()).toHaveLength(1);
  });
});
