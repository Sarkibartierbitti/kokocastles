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

describe('storage.hookCategory', () => {
  it('round-trip set/get', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.setHookCategory('youtube', 'v1', 'Curiosity Gap');
    expect(storage.getHookCategory('youtube', 'v1')).toBe('Curiosity Gap');
  });

  it('returns null when missing', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    expect(storage.getHookCategory('youtube', 'nope')).toBeNull();
  });

  it('junk values normalize to Uncategorized', async () => {
    fakeStore['koko.hookCategory.youtube.v1'] = 'TotallyMadeUp';
    const { storage } = await import('../storage');
    await storage.hydrate();
    expect(storage.getHookCategory('youtube', 'v1')).toBe('Uncategorized');
  });

  it('getAllHookCategories collects every key under prefix', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.setHookCategory('youtube', 'v1', 'Listicle');
    await storage.setHookCategory('youtube', 'v2', 'Question');
    const all = storage.getAllHookCategories();
    expect(all.get('youtube::v1')).toBe('Listicle');
    expect(all.get('youtube::v2')).toBe('Question');
    expect(all.size).toBe(2);
  });
});
