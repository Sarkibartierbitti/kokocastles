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

// Stub the LLM call — return 2 fake ideas.
vi.mock('~/lib/llm/tasks', () => ({
  generateIdeas: vi.fn(async () => [
    { id: 'i1', title: 'Idea One', rationale: 'because', bucket: 'inbox', createdAt: '', sourceRefs: [], score: 0.9 },
    { id: 'i2', title: 'Idea Two', rationale: 'reasons', bucket: 'inbox', createdAt: '', sourceRefs: [], score: 0.7 },
  ]),
}));

beforeEach(() => {
  for (const k of Object.keys(fakeStore)) delete fakeStore[k];
  vi.resetModules();
});

async function renderRoute() {
  const { storage } = await import('~/lib/storage');
  await storage.hydrate();
  const IdeasRoute = (await import('./IdeasRoute')).default;
  return render(<MemoryRouter><IdeasRoute /></MemoryRouter>);
}

describe('IdeasRoute', () => {
  it('renders empty state when no ideas', async () => {
    await renderRoute();
    expect(await screen.findByText(/haven't saved any ideas yet/i)).toBeInTheDocument();
  });

  it('lists existing ideas in current bucket', async () => {
    fakeStore['koko.ideas'] = [
      { id: 'a', title: 'In Inbox', rationale: 'r', bucket: 'inbox', createdAt: '', sourceRefs: [], score: 1 },
      { id: 'b', title: 'In Shortlist', rationale: 'r', bucket: 'shortlist', createdAt: '', sourceRefs: [], score: 1 },
    ];
    await renderRoute();
    expect(await screen.findByText(/In Inbox/)).toBeInTheDocument();
    expect(screen.queryByText(/In Shortlist/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /shortlist/i }));
    expect(screen.getByText(/In Shortlist/)).toBeInTheDocument();
  });

  it('moves idea to shortlist via button', async () => {
    fakeStore['koko.ideas'] = [
      { id: 'a', title: 'Move me', rationale: 'r', bucket: 'inbox', createdAt: '', sourceRefs: [], score: 1 },
    ];
    await renderRoute();
    const btn = await screen.findByRole('button', { name: /shortlist move me/i });
    fireEvent.click(btn);
    await waitFor(() => {
      const stored = fakeStore['koko.ideas'] as Array<{ bucket: string }>;
      expect(stored[0].bucket).toBe('shortlist');
    });
  });
});
