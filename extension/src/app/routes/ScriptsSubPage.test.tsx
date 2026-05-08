import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

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

describe('ScriptsSubPage', () => {
  it('renders empty state when no transcripts', async () => {
    const { storage } = await import('~/lib/storage');
    await storage.hydrate();
    const ScriptsSubPage = (await import('./ScriptsSubPage')).default;
    render(<ScriptsSubPage />);
    expect(await screen.findByText(/no scripts yet/i)).toBeInTheDocument();
  });

  it('renders ScriptCard per transcript', async () => {
    fakeStore['koko.transcript.youtube.a'] = [
      { start: 0, dur: 1, text: 'opening sentence' },
      { start: 1, dur: 1, text: 'continuation' },
    ];
    const { storage } = await import('~/lib/storage');
    await storage.hydrate();
    const ScriptsSubPage = (await import('./ScriptsSubPage')).default;
    render(<ScriptsSubPage />);
    expect(await screen.findByText(/opening sentence/i)).toBeInTheDocument();
  });
});
