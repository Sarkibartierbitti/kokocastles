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

function makeThread(id: string, updatedAt: string) {
  return {
    id,
    title: `T-${id}`,
    topic: '',
    context: { usePersona: false, databankIds: [], files: [] },
    drafts: [],
    createdAt: updatedAt,
    updatedAt,
  };
}

describe('storage.writerThreads', () => {
  it('upsert creates a thread', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.upsertWriterThread(makeThread('a', '2026-05-11T00:00:00Z'));
    expect(storage.getWriterThreads()).toHaveLength(1);
  });

  it('upsert replaces existing thread by id', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.upsertWriterThread(makeThread('a', '2026-05-11T00:00:00Z'));
    const replacement = { ...makeThread('a', '2026-05-11T00:01:00Z'), topic: 'v2' };
    await storage.upsertWriterThread(replacement);
    const list = storage.getWriterThreads();
    expect(list).toHaveLength(1);
    expect(list[0].topic).toBe('v2');
  });

  it('LRU caps at 50 newest by updatedAt', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    for (let i = 0; i < 55; i++) {
      const stamp = `2026-05-11T00:00:${String(i).padStart(2, '0')}Z`;
      await storage.upsertWriterThread(makeThread(`t${i}`, stamp));
    }
    const list = storage.getWriterThreads();
    expect(list).toHaveLength(50);
    expect(list[0].id).toBe('t54');
    // oldest 5 (t0..t4) evicted; t5 is newest of the survivors at the tail
    expect(list[list.length - 1].id).toBe('t5');
  });

  it('appendWriterDraft adds to drafts and bumps updatedAt', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.upsertWriterThread(makeThread('a', '2026-05-11T00:00:00Z'));
    await storage.appendWriterDraft('a', {
      id: 'd1',
      model: 'claude-sonnet-4-5',
      contentMd: '# hi',
      createdAt: '2026-05-11T01:00:00Z',
    });
    const t = storage.getWriterThreads()[0];
    expect(t.drafts).toHaveLength(1);
    expect(t.updatedAt).not.toBe('2026-05-11T00:00:00Z');
  });

  it('deleteWriterThread removes a thread', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.upsertWriterThread(makeThread('a', '2026-05-11T00:00:00Z'));
    await storage.deleteWriterThread('a');
    expect(storage.getWriterThreads()).toHaveLength(0);
  });
});
