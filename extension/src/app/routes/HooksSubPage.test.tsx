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

async function renderSubpage() {
  fakeStore['koko.deep.youtube.v1'] = {
    hook: { type: 'visual', spoken: 'Wait for it', onScreen: 'WAIT FOR IT', visualFormat: 'close-up' },
    structure: [],
    pacing: { avgCutSec: 1, rhythm: 'fast' },
    techniques: [],
  };
  fakeStore['koko.deep.youtube.v2'] = {
    hook: { type: 'verbal', spoken: 'You will not believe this', onScreen: '', visualFormat: 'b-roll' },
    structure: [],
    pacing: { avgCutSec: 1, rhythm: 'fast' },
    techniques: [],
  };
  const { storage } = await import('~/lib/storage');
  await storage.hydrate();
  const HooksSubPage = (await import('./HooksSubPage')).default;
  return render(<HooksSubPage />);
}

describe('HooksSubPage', () => {
  it('renders empty state when no analyzed videos', async () => {
    const { storage } = await import('~/lib/storage');
    await storage.hydrate();
    const HooksSubPage = (await import('./HooksSubPage')).default;
    render(<HooksSubPage />);
    expect(await screen.findByText(/no hooks yet/i)).toBeInTheDocument();
  });

  it('renders one HookCard per analyzed video', async () => {
    await renderSubpage();
    expect((await screen.findAllByText(/Wait for it/i)).length).toBeGreaterThan(0);
    expect(screen.getByText(/You will not believe this/i)).toBeInTheDocument();
  });

  it('shows a count badge', async () => {
    await renderSubpage();
    expect(await screen.findByText(/2 hooks/i)).toBeInTheDocument();
  });
});
