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

describe('storage.platformsEnabled', () => {
  it('default both off', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    expect(storage.getPlatformsEnabled()).toEqual({ instagram: false, tiktok: false });
  });

  it('toggle round-trip', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.setPlatformsEnabled({ instagram: true, tiktok: false });
    expect(storage.getPlatformsEnabled()).toEqual({ instagram: true, tiktok: false });
  });

  it('platformWarn round-trip + null clears', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.setPlatformWarn('instagram', 'selector drift');
    expect(storage.getPlatformWarn('instagram')).toBe('selector drift');
    await storage.setPlatformWarn('instagram', null);
    expect(storage.getPlatformWarn('instagram')).toBeNull();
  });
});
