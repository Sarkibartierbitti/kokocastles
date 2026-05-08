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

describe('storage — ideas', () => {
  it('default empty', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    expect(storage.getIdeas()).toEqual([]);
  });

  it('addIdeas appends + persists', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.addIdeas([
      { id: 'a', title: 'A', rationale: 'r', bucket: 'inbox', createdAt: '2026-01-01', sourceRefs: [], score: 0.8 },
    ]);
    const all = storage.getIdeas();
    expect(all).toHaveLength(1);
    expect(fakeStore['koko.ideas']).toBeTruthy();
  });

  it('moveIdeaBucket switches bucket', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.addIdeas([
      { id: 'a', title: 'A', rationale: 'r', bucket: 'inbox', createdAt: '', sourceRefs: [], score: 1 },
    ]);
    await storage.moveIdeaBucket('a', 'shortlist');
    expect(storage.getIdeas()[0].bucket).toBe('shortlist');
  });

  it('deleteIdea removes', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.addIdeas([
      { id: 'a', title: 'A', rationale: 'r', bucket: 'inbox', createdAt: '', sourceRefs: [], score: 1 },
    ]);
    await storage.deleteIdea('a');
    expect(storage.getIdeas()).toHaveLength(0);
  });
});
