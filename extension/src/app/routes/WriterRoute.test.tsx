import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

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

vi.mock('~/lib/llm/tasks', () => ({
  generateScript: vi.fn(async () => ({
    id: 'd-mock',
    model: 'claude-sonnet-4-5',
    contentMd: '# HOOK\n\nFirst paragraph.\n\nSecond paragraph.',
    createdAt: '2026-05-11T00:00:00Z',
  })),
  writerClarify: vi.fn(async () => ['Audience?', 'Tone?']),
  writerPersonalize: vi.fn(async () => ['Storytime', 'Tutorial']),
  writerRegenParagraph: vi.fn(async () => 'A REWRITTEN paragraph from the mock.'),
}));

beforeEach(() => {
  for (const k of Object.keys(fakeStore)) delete fakeStore[k];
  vi.resetModules();
  vi.clearAllMocks();
});

async function renderRoute() {
  const { storage } = await import('~/lib/storage');
  await storage.hydrate();
  const WriterRoute = (await import('./WriterRoute')).default;
  return render(
    <MemoryRouter>
      <WriterRoute />
    </MemoryRouter>
  );
}

describe('WriterRoute', () => {
  it('renders empty state when no threads', async () => {
    await renderRoute();
    expect(await screen.findByText(/no threads yet/i)).toBeInTheDocument();
    expect(screen.getByText(/pick a thread on the left/i)).toBeInTheDocument();
  });

  it('creates a thread and selects it', async () => {
    await renderRoute();
    fireEvent.click(screen.getByRole('button', { name: /\+ new thread/i }));
    await waitFor(() => {
      expect((fakeStore['koko.writerThreads'] as unknown[])?.length).toBe(1);
    });
    expect(await screen.findByLabelText(/^title$/i)).toBeInTheDocument();
  });

  it('generates a draft and appends it', async () => {
    fakeStore['koko.llmKey'] = 'sk-ant-api03-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    fakeStore['koko.llmProvider'] = 'anthropic';
    fakeStore['koko.llmModel'] = 'claude-sonnet-4-5';
    await renderRoute();
    fireEvent.click(screen.getByRole('button', { name: /\+ new thread/i }));
    const topic = await screen.findByLabelText(/^topic$/i);
    fireEvent.change(topic, { target: { value: 'About bread' } });
    const genBtn = await screen.findByRole('button', { name: /^generate$/i });
    fireEvent.click(genBtn);
    await waitFor(() => {
      expect(screen.getByText(/HOOK/)).toBeInTheDocument();
    });
    const threads = fakeStore['koko.writerThreads'] as Array<{ drafts: unknown[] }>;
    expect(threads[0].drafts).toHaveLength(1);
  });

  it('regenerate appends second draft', async () => {
    fakeStore['koko.llmKey'] = 'sk-ant-api03-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    fakeStore['koko.llmProvider'] = 'anthropic';
    fakeStore['koko.llmModel'] = 'claude-sonnet-4-5';
    await renderRoute();
    fireEvent.click(screen.getByRole('button', { name: /\+ new thread/i }));
    const topic = await screen.findByLabelText(/^topic$/i);
    fireEvent.change(topic, { target: { value: 'About bread' } });
    fireEvent.click(await screen.findByRole('button', { name: /^generate$/i }));
    await waitFor(() => {
      expect(screen.getByText(/HOOK/)).toBeInTheDocument();
    });
    fireEvent.click(await screen.findByRole('button', { name: /^regenerate$/i }));
    await waitFor(() => {
      const threads = fakeStore['koko.writerThreads'] as Array<{ drafts: unknown[] }>;
      expect(threads[0].drafts).toHaveLength(2);
    });
  });

  it('deletes a thread', async () => {
    await renderRoute();
    fireEvent.click(screen.getByRole('button', { name: /\+ new thread/i }));
    await waitFor(() => {
      expect((fakeStore['koko.writerThreads'] as unknown[])?.length).toBe(1);
    });
    const del = await screen.findByRole('button', { name: /delete thread/i });
    fireEvent.click(del);
    await waitFor(() => {
      expect((fakeStore['koko.writerThreads'] as unknown[])?.length).toBe(0);
    });
  });

  it('disables persona toggle when persona is empty', async () => {
    await renderRoute();
    fireEvent.click(screen.getByRole('button', { name: /\+ new thread/i }));
    const checkbox = (await screen.findByLabelText(/use persona/i)) as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
  });

  it('enables persona toggle when persona is configured', async () => {
    fakeStore['koko.persona'] = { niche: 'baking', context: '', styleSample: '', attachedDatabankIds: [] };
    await renderRoute();
    fireEvent.click(screen.getByRole('button', { name: /\+ new thread/i }));
    const checkbox = (await screen.findByLabelText(/use persona/i)) as HTMLInputElement;
    expect(checkbox.disabled).toBe(false);
  });

  it('generate button disabled when topic is empty', async () => {
    fakeStore['koko.llmKey'] = 'sk-ant-api03-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    fakeStore['koko.llmProvider'] = 'anthropic';
    await renderRoute();
    fireEvent.click(screen.getByRole('button', { name: /\+ new thread/i }));
    const btn = (await screen.findByRole('button', { name: /^generate$/i })) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('switching to guided mode reveals stepper + clarify generates questions', async () => {
    fakeStore['koko.llmKey'] = 'sk-ant-api03-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    fakeStore['koko.llmProvider'] = 'anthropic';
    await renderRoute();
    fireEvent.click(screen.getByRole('button', { name: /\+ new thread/i }));
    const topic = await screen.findByLabelText(/^topic$/i);
    fireEvent.change(topic, { target: { value: 'My topic' } });
    fireEvent.click(screen.getByRole('button', { name: /guided/i }));
    expect(await screen.findByRole('tab', { name: /1\. clarify/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /generate questions/i }));
    expect(await screen.findByLabelText(/answer to: Audience\?/i)).toBeInTheDocument();
    expect(await screen.findByLabelText(/answer to: Tone\?/i)).toBeInTheDocument();
  });

  it('regenerate paragraph appends a new draft with the replacement', async () => {
    fakeStore['koko.llmKey'] = 'sk-ant-api03-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    fakeStore['koko.llmProvider'] = 'anthropic';
    fakeStore['koko.writerThreads'] = [
      {
        id: 't1',
        title: 'T',
        topic: 'About bread',
        context: { usePersona: false, databankIds: [], files: [] },
        drafts: [
          {
            id: 'd1',
            model: 'claude-sonnet-4-5',
            contentMd: '# HOOK\n\nFirst paragraph.\n\nSecond paragraph.',
            createdAt: '2026-05-12T00:00:00Z',
          },
        ],
        createdAt: '2026-05-12T00:00:00Z',
        updatedAt: '2026-05-12T00:00:00Z',
        mode: 'multi',
        step: 'iterate',
      },
    ];
    await renderRoute();
    fireEvent.click(await screen.findByText(/^T$/));
    // Need at least one regenerate button on a paragraph
    const regenBtns = await screen.findAllByRole('button', { name: /regenerate paragraph/i });
    fireEvent.click(regenBtns[0]);
    fireEvent.click(await screen.findByRole('button', { name: /^rewrite$/i }));
    await waitFor(() => {
      const threads = fakeStore['koko.writerThreads'] as Array<{ drafts: Array<{ contentMd: string }> }>;
      expect(threads[0].drafts.length).toBe(2);
      const newDraft = threads[0].drafts[1];
      expect(newDraft.contentMd).toMatch(/A REWRITTEN paragraph/);
    });
  });
});
