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
};
(globalThis as Record<string, unknown>).browser = mockBrowser;

beforeEach(() => {
  for (const k of Object.keys(fakeStore)) delete fakeStore[k];
  vi.clearAllMocks();
  vi.resetModules();
});

describe('storage — databanks', () => {
  it('returns empty list by default', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    expect(storage.getDatabanks()).toEqual([]);
  });

  it('createDatabank assigns id, persists, returns it', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    const db = await storage.createDatabank('Hooks I love');
    expect(db.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(db.name).toBe('Hooks I love');
    const all = storage.getDatabanks();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(db.id);
  });

  it('createDatabank rejects invalid names', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await expect(storage.createDatabank('')).rejects.toThrow(/required/i);
    await expect(storage.createDatabank('x'.repeat(81))).rejects.toThrow(/80/);
  });

  it('addToDatabank appends + dedupes', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    const db = await storage.createDatabank('A');
    await storage.addToDatabank(db.id, { platform: 'youtube', videoId: 'v1' });
    await storage.addToDatabank(db.id, { platform: 'youtube', videoId: 'v1' });
    await storage.addToDatabank(db.id, { platform: 'youtube', videoId: 'v2' });
    const all = storage.getDatabanks();
    expect(all[0].videoRefs).toHaveLength(2);
  });

  it('removeFromDatabank drops the matching ref', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    const db = await storage.createDatabank('A');
    await storage.addToDatabank(db.id, { platform: 'youtube', videoId: 'v1' });
    await storage.removeFromDatabank(db.id, { platform: 'youtube', videoId: 'v1' });
    expect(storage.getDatabanks()[0].videoRefs).toHaveLength(0);
  });

  it('renameDatabank updates the name', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    const db = await storage.createDatabank('A');
    await storage.renameDatabank(db.id, 'B');
    expect(storage.getDatabanks()[0].name).toBe('B');
  });

  it('deleteDatabank removes the entry', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    const db = await storage.createDatabank('A');
    await storage.deleteDatabank(db.id);
    expect(storage.getDatabanks()).toEqual([]);
  });

  it('getDatabankIndex returns an up-to-date Map', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    const a = await storage.createDatabank('A');
    const b = await storage.createDatabank('B');
    await storage.addToDatabank(a.id, { platform: 'youtube', videoId: 'v1' });
    await storage.addToDatabank(b.id, { platform: 'youtube', videoId: 'v1' });
    const idx = storage.getDatabankIndex();
    expect(idx.get('youtube::v1')).toEqual(new Set([a.id, b.id]));
  });
});
