import { describe, it, expect, beforeEach, vi } from 'vitest';

const fakeStore: Record<string, unknown> = {};
const createSpy = vi.fn();
const clearSpy = vi.fn(async () => true);
const addListenerSpy = vi.fn();

(globalThis as Record<string, unknown>).browser = {
  storage: {
    local: {
      get: vi.fn(async () => ({ ...fakeStore })),
      set: vi.fn(async (items: Record<string, unknown>) => Object.assign(fakeStore, items)),
      remove: vi.fn(async () => {}),
    },
  },
  alarms: {
    create: createSpy,
    clear: clearSpy,
    onAlarm: { addListener: addListenerSpy },
  },
};

beforeEach(() => {
  for (const k of Object.keys(fakeStore)) delete fakeStore[k];
  vi.resetModules();
  createSpy.mockReset();
  clearSpy.mockClear();
  addListenerSpy.mockReset();
});

describe('setupOwnChannelAlarm', () => {
  it('no-ops (no create) when ownChannel unset', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    const { setupOwnChannelAlarm } = await import('../alarms');
    await setupOwnChannelAlarm();
    expect(clearSpy).toHaveBeenCalledWith('koko.ownChannelRefresh');
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('clears + creates alarm with refreshIntervalHours when ownChannel set', async () => {
    fakeStore['koko.ownChannel'] = { platform: 'youtube', channelId: 'UC123', title: 'me' };
    fakeStore['koko.refreshIntervalHours'] = 6;
    const { storage } = await import('../storage');
    await storage.hydrate();
    const { setupOwnChannelAlarm } = await import('../alarms');
    await setupOwnChannelAlarm();
    expect(clearSpy).toHaveBeenCalled();
    expect(createSpy).toHaveBeenCalledWith('koko.ownChannelRefresh', { periodInMinutes: 6 * 60 });
  });

  it('enforces 15-minute floor on period', async () => {
    fakeStore['koko.ownChannel'] = { platform: 'youtube', channelId: 'UC123', title: 'me' };
    fakeStore['koko.refreshIntervalHours'] = 0; // would yield 0 minutes
    const { storage } = await import('../storage');
    await storage.hydrate();
    const { setupOwnChannelAlarm } = await import('../alarms');
    await setupOwnChannelAlarm();
    expect(createSpy).toHaveBeenCalledWith('koko.ownChannelRefresh', { periodInMinutes: 15 });
  });

  it('registers onAlarm listener once', async () => {
    fakeStore['koko.ownChannel'] = { platform: 'youtube', channelId: 'UC123', title: 'me' };
    const { storage } = await import('../storage');
    await storage.hydrate();
    const { setupOwnChannelAlarm } = await import('../alarms');
    await setupOwnChannelAlarm();
    await setupOwnChannelAlarm();
    // Module-level guard prevents re-registration within same module instance.
    expect(addListenerSpy).toHaveBeenCalledTimes(1);
  });
});
