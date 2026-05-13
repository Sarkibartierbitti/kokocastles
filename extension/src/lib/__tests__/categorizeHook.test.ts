import { describe, it, expect, vi, beforeEach } from 'vitest';

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

const callLLMSpy = vi.fn();

vi.mock('../../lib/llm/index', () => ({
  callLLM: (...args: unknown[]) => callLLMSpy(...args),
}));

beforeEach(() => {
  for (const k of Object.keys(fakeStore)) delete fakeStore[k];
  vi.resetModules();
  callLLMSpy.mockReset();
});

describe('categorizeHooks', () => {
  it('empty input → empty output, no LLM call', async () => {
    const { categorizeHooks } = await import('../llm/tasks');
    const r = await categorizeHooks([]);
    expect(r).toEqual([]);
    expect(callLLMSpy).not.toHaveBeenCalled();
  });

  it('5 inputs → 1 call, 5 results', async () => {
    callLLMSpy.mockResolvedValueOnce({
      assignments: [
        { videoId: 'v1', category: 'Curiosity Gap' },
        { videoId: 'v2', category: 'Listicle' },
        { videoId: 'v3', category: 'Question' },
        { videoId: 'v4', category: 'Pain Point' },
        { videoId: 'v5', category: 'Tutorial' },
      ],
    });
    const { categorizeHooks } = await import('../llm/tasks');
    const r = await categorizeHooks(
      [1, 2, 3, 4, 5].map((i) => ({ videoId: `v${i}`, spoken: 's', onScreen: 'o', visualFormat: 'f' }))
    );
    expect(callLLMSpy).toHaveBeenCalledTimes(1);
    expect(r).toHaveLength(5);
    expect(r[0]).toEqual({ videoId: 'v1', category: 'Curiosity Gap' });
  });

  it('35 inputs → 2 calls (30 + 5)', async () => {
    callLLMSpy.mockResolvedValueOnce({
      assignments: Array.from({ length: 30 }, (_, i) => ({
        videoId: `v${i + 1}`,
        category: 'Listicle',
      })),
    });
    callLLMSpy.mockResolvedValueOnce({
      assignments: Array.from({ length: 5 }, (_, i) => ({
        videoId: `v${i + 31}`,
        category: 'Question',
      })),
    });
    const inputs = Array.from({ length: 35 }, (_, i) => ({
      videoId: `v${i + 1}`,
      spoken: '',
      onScreen: '',
      visualFormat: '',
    }));
    const { categorizeHooks } = await import('../llm/tasks');
    const r = await categorizeHooks(inputs);
    expect(callLLMSpy).toHaveBeenCalledTimes(2);
    expect(r).toHaveLength(35);
  });

  it('out-of-enum category → normalized to Uncategorized', async () => {
    callLLMSpy.mockResolvedValueOnce({
      assignments: [{ videoId: 'v1', category: 'Totally Made Up' }],
    });
    const { categorizeHooks } = await import('../llm/tasks');
    const r = await categorizeHooks([
      { videoId: 'v1', spoken: '', onScreen: '', visualFormat: '' },
    ]);
    expect(r[0]).toEqual({ videoId: 'v1', category: 'Uncategorized' });
  });
});
