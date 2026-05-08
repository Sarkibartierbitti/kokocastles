import { describe, it, expect, beforeEach, vi } from 'vitest';

const fakeStore: Record<string, unknown> = {};
(globalThis as Record<string, unknown>).browser = {
  storage: {
    local: {
      get: vi.fn(async (keys?: string | string[] | null) => {
        if (keys == null) return { ...fakeStore };
        const arr = typeof keys === 'string' ? [keys] : keys;
        const out: Record<string, unknown> = {};
        for (const k of arr) if (k in fakeStore) out[k] = fakeStore[k];
        return out;
      }),
      set: vi.fn(async (items: Record<string, unknown>) => Object.assign(fakeStore, items)),
      remove: vi.fn(async (keys: string | string[]) => {
        const arr = typeof keys === 'string' ? [keys] : keys;
        for (const k of arr) delete fakeStore[k];
      }),
    },
  },
};

beforeEach(() => {
  for (const k of Object.keys(fakeStore)) delete fakeStore[k];
  vi.resetModules();
});

describe('storage — hidden videos', () => {
  it('isHidden defaults false', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    expect(storage.isHiddenVideo('youtube', 'v1')).toBe(false);
  });

  it('hideVideo persists + isHidden reads true', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.hideVideo('youtube', 'v1');
    expect(storage.isHiddenVideo('youtube', 'v1')).toBe(true);
    expect(fakeStore['koko.hidden.youtube.v1']).toBe(true);
  });

  it('unhideVideo removes', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.hideVideo('youtube', 'v1');
    await storage.unhideVideo('youtube', 'v1');
    expect(storage.isHiddenVideo('youtube', 'v1')).toBe(false);
  });

  it('getAllHiddenKeys returns hidden refs', async () => {
    fakeStore['koko.hidden.youtube.a'] = true;
    fakeStore['koko.hidden.youtube.b'] = true;
    const { storage } = await import('../storage');
    await storage.hydrate();
    const keys = storage.getAllHiddenKeys();
    expect(keys.size).toBe(2);
    expect(keys.has('youtube::a')).toBe(true);
  });
});
