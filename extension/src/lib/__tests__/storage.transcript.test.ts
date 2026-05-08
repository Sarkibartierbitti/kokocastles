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

describe('storage — transcript cache', () => {
  it('returns null when no transcript stored', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    const t = await storage.getTranscript('youtube', 'v1');
    expect(t).toBeNull();
  });

  it('round-trips transcript', async () => {
    const segs = [{ start: 0, dur: 1.5, text: 'hello' }];
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.setTranscript('youtube', 'v1', segs);
    const t = await storage.getTranscript('youtube', 'v1');
    expect(t).toEqual(segs);
    expect(fakeStore['koko.transcript.youtube.v1']).toEqual(segs);
  });

  it('snapshot helpers expose deep + transcript entries', async () => {
    fakeStore['koko.deep.youtube.a'] = { hook: { type: 'visual' } };
    fakeStore['koko.deep.youtube.b'] = { hook: { type: 'verbal' } };
    fakeStore['koko.transcript.youtube.a'] = [{ start: 0, dur: 1, text: 'hi' }];
    const { storage } = await import('../storage');
    await storage.hydrate();
    const deeps = storage.getAllDeepEntries();
    const transcripts = storage.getAllTranscriptEntries();
    expect(deeps).toHaveLength(2);
    expect(deeps[0].platform).toBe('youtube');
    expect(transcripts).toHaveLength(1);
    expect(transcripts[0].videoId).toBe('a');
  });
});
