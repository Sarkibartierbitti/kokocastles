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

const baseArgs = {
  topic: 'About bread',
  context: { usePersona: false, databankIds: [], files: [] },
  persona: null,
  databankBundles: [],
};

describe('writerClarify', () => {
  it('returns questions array from tool response', async () => {
    callLLMSpy.mockResolvedValueOnce({ questions: ['Who is the audience?', 'What tone?'] });
    const { writerClarify } = await import('../llm/tasks');
    const r = await writerClarify(baseArgs);
    expect(r).toEqual(['Who is the audience?', 'What tone?']);
    expect(callLLMSpy).toHaveBeenCalledTimes(1);
    const call = callLLMSpy.mock.calls[0][0];
    expect(call.task).toBe('writerClarify');
  });
});

describe('writerPersonalize', () => {
  it('passes clarify answers in the prompt body', async () => {
    callLLMSpy.mockResolvedValueOnce({ options: ['Storytime', 'Tutorial'] });
    const { writerPersonalize } = await import('../llm/tasks');
    const r = await writerPersonalize({
      ...baseArgs,
      clarifyAnswers: { 'Audience?': 'beginners', 'Tone?': 'casual' },
    });
    expect(r).toEqual(['Storytime', 'Tutorial']);
    const body = callLLMSpy.mock.calls[0][0].content[0].text as string;
    expect(body).toMatch(/Audience\?/);
    expect(body).toMatch(/beginners/);
  });

  it('emits placeholder when no answers given', async () => {
    callLLMSpy.mockResolvedValueOnce({ options: ['One'] });
    const { writerPersonalize } = await import('../llm/tasks');
    await writerPersonalize({ ...baseArgs, clarifyAnswers: {} });
    const body = callLLMSpy.mock.calls[0][0].content[0].text as string;
    expect(body).toMatch(/no clarifying answers provided/);
  });
});

describe('writerRegenParagraph', () => {
  it('passes full draft + target paragraph + hint', async () => {
    callLLMSpy.mockResolvedValueOnce({ paragraph: 'NEW paragraph text here.' });
    const { writerRegenParagraph } = await import('../llm/tasks');
    const out = await writerRegenParagraph({
      fullDraftMd: 'A\n\nB\n\nC',
      paragraphIndex: 1,
      paragraphText: 'B',
      hint: 'punchier',
    });
    expect(out).toBe('NEW paragraph text here.');
    const body = callLLMSpy.mock.calls[0][0].content[0].text as string;
    expect(body).toMatch(/<full_draft>/);
    expect(body).toMatch(/<target_paragraph index="1">/);
    expect(body).toMatch(/<user_hint>/);
    expect(body).toMatch(/punchier/);
  });

  it('omits hint block when not provided', async () => {
    callLLMSpy.mockResolvedValueOnce({ paragraph: 'replacement paragraph text' });
    const { writerRegenParagraph } = await import('../llm/tasks');
    await writerRegenParagraph({
      fullDraftMd: 'A\n\nB',
      paragraphIndex: 0,
      paragraphText: 'A',
    });
    const body = callLLMSpy.mock.calls[0][0].content[0].text as string;
    expect(body).not.toMatch(/<user_hint>/);
  });
});
