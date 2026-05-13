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

describe('frameStorageKey + decideShouldCapture', () => {
  it('frameStorageKey shape', async () => {
    const { frameStorageKey } = await import('../frameQueue');
    expect(frameStorageKey('youtube', 'abc')).toBe('koko.frame.youtube.abc');
  });

  it('decideShouldCapture truth table', async () => {
    const { decideShouldCapture } = await import('../frameQueue');
    expect(decideShouldCapture(true, false)).toBe(true);
    expect(decideShouldCapture(true, true)).toBe(false);
    expect(decideShouldCapture(false, false)).toBe(false);
    expect(decideShouldCapture(false, true)).toBe(false);
  });
});

describe('enqueueFrameCapture', () => {
  it('persists dataUrl on success', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    const { enqueueFrameCapture, __resetQueueForTests } = await import('../frameQueue');
    __resetQueueForTests();
    const r = await enqueueFrameCapture('youtube', 'v1', async () => 'data:image/jpeg;base64,AAA');
    expect(r).toBe('data:image/jpeg;base64,AAA');
    expect(fakeStore['koko.frame.youtube.v1']).toBe('data:image/jpeg;base64,AAA');
  });

  it('serializes calls (B starts after A resolves)', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    const { enqueueFrameCapture, __resetQueueForTests } = await import('../frameQueue');
    __resetQueueForTests();
    const events: string[] = [];
    const a = enqueueFrameCapture('youtube', 'a', async () => {
      events.push('A start');
      await new Promise((r) => setTimeout(r, 20));
      events.push('A end');
      return 'data:a';
    });
    const b = enqueueFrameCapture('youtube', 'b', async () => {
      events.push('B start');
      return 'data:b';
    });
    await Promise.all([a, b]);
    expect(events).toEqual(['A start', 'A end', 'B start']);
  });

  it('duplicate key returns null', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    const { enqueueFrameCapture, __resetQueueForTests } = await import('../frameQueue');
    __resetQueueForTests();
    const slow = enqueueFrameCapture('youtube', 'x', async () => {
      await new Promise((r) => setTimeout(r, 30));
      return 'data:slow';
    });
    const dup = await enqueueFrameCapture('youtube', 'x', async () => 'data:dup');
    expect(dup).toBeNull();
    await slow;
  });

  it('empty capture result returns null and writes nothing', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    const { enqueueFrameCapture, __resetQueueForTests } = await import('../frameQueue');
    __resetQueueForTests();
    const r = await enqueueFrameCapture('youtube', 'empty', async () => '');
    expect(r).toBeNull();
    expect(fakeStore['koko.frame.youtube.empty']).toBeUndefined();
  });

  it('throwing capture resolves to null', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    const { enqueueFrameCapture, __resetQueueForTests } = await import('../frameQueue');
    __resetQueueForTests();
    const r = await enqueueFrameCapture('youtube', 'boom', async () => {
      throw new Error('boom');
    });
    expect(r).toBeNull();
  });
});
