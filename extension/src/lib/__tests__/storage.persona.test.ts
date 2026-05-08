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

describe('storage — persona', () => {
  it('returns empty persona when none stored', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    const p = storage.getPersona();
    expect(p).toEqual({ niche: '', context: '', styleSample: '', attachedDatabankIds: [] });
  });

  it('round-trips persona through storage', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.setPersona({
      niche: 'AI tools for creators',
      context: 'I build kokocastles, an open clone of sandcastles.',
      styleSample: 'Hey friends! Today we are going to build…',
      attachedDatabankIds: ['db1', 'db2'],
    });
    const p = storage.getPersona();
    expect(p.niche).toBe('AI tools for creators');
    expect(p.attachedDatabankIds).toEqual(['db1', 'db2']);
    expect(fakeStore['koko.persona']).toBeTruthy();
  });
});
