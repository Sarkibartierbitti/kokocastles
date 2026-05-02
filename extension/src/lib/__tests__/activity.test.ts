import { describe, it, expect, beforeEach, vi } from 'vitest';

const fakeStore: Record<string, unknown> = {};
(globalThis as Record<string, unknown>).browser = {
  storage: {
    local: {
      get: vi.fn(async (k?: string | string[] | null) => {
        if (k == null) return { ...fakeStore };
        const arr = typeof k === 'string' ? [k] : k;
        const out: Record<string, unknown> = {};
        for (const key of arr) if (key in fakeStore) out[key] = fakeStore[key];
        return out;
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(fakeStore, items);
      }),
      remove: vi.fn(async () => {}),
    },
  },
};

beforeEach(() => {
  for (const k of Object.keys(fakeStore)) delete fakeStore[k];
  vi.clearAllMocks();
  vi.resetModules();
});

describe('activity', () => {
  it('start returns a token; done updates entry; events broadcast to subscribers', async () => {
    const { activity } = await import('../activity');
    const events: string[] = [];
    activity.subscribe((evt) => events.push(evt.kind));
    const token = activity.start({ task: 'triage', provider: 'anthropic', model: 'claude-haiku-4-5' });
    activity.done(token, { tokensIn: 100, tokensOut: 50 });
    const list = activity.list();
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe('done');
    expect(list[0].tokensIn).toBe(100);
    expect(events).toEqual(['start', 'done']);
  });

  it('error marks entry failed with message', async () => {
    const { activity } = await import('../activity');
    const token = activity.start({ task: 'deep', provider: 'openai', model: 'gpt-5.4' });
    activity.error(token, 'rate limited');
    expect(activity.list()[0]).toMatchObject({ status: 'error', error: 'rate limited' });
  });

  it('keeps at most 50 entries (ring buffer)', async () => {
    const { activity } = await import('../activity');
    for (let i = 0; i < 60; i++) {
      const t = activity.start({ task: 'triage', provider: 'anthropic', model: 'claude-haiku-4-5' });
      activity.done(t, {});
    }
    expect(activity.list().length).toBeLessThanOrEqual(50);
  });

  it('estimates USD cost when model+tokens known', async () => {
    const { activity, estimateCost } = await import('../activity');
    expect(estimateCost('claude-haiku-4-5', 1_000_000, 0)).toBeCloseTo(1.0, 1);
    expect(estimateCost('claude-haiku-4-5', 0, 1_000_000)).toBeCloseTo(5.0, 1);
    expect(estimateCost('unknown-model', 100, 100)).toBeNull();
    void activity;
  });

  it('hydrate restores recent entries from storage', async () => {
    fakeStore['koko.activity'] = [
      { id: 'x', task: 'triage', provider: 'anthropic', model: 'claude-haiku-4-5',
        status: 'done', startedAt: 0, finishedAt: 1 },
    ];
    const { activity } = await import('../activity');
    await activity.hydrate();
    expect(activity.list()).toHaveLength(1);
    expect(activity.list()[0].id).toBe('x');
  });
});
