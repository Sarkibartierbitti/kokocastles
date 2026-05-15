import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const fakeStore: Record<string, unknown> = {
  'koko.watchlist': [{ platform: 'youtube', channelId: 'UC1', title: 'Channel One' }],
};
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
      set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(fakeStore, items); }),
      remove: vi.fn(async () => {}),
    },
  },
  runtime: {
    sendMessage: vi.fn(async () => ({
      type: 'scrape-result',
      payload: {
        kind: 'channel', channelId: 'UC1', channelTitle: 'Channel One',
        videos: [{ videoId: 'v1', title: 't1', viewCount: 100, publishedAtRelative: '1d', thumbnailUrl: '', durationSec: 60 }],
      },
    })),
  },
};
(globalThis as Record<string, unknown>).browser = mockBrowser;

beforeEach(() => {
  for (const k of Object.keys(fakeStore)) delete fakeStore[k];
  fakeStore['koko.watchlist'] = [{ platform: 'youtube', channelId: 'UC1', title: 'Channel One' }];
  vi.clearAllMocks();
  vi.resetModules();
});

describe('ScrapeControl', () => {
  it('renders multipicker + latestN input + databank select + run button', async () => {
    const { storage } = await import('~/lib/storage');
    await storage.hydrate();
    const ScrapeControl = (await import('./ScrapeControl')).default;
    render(<MemoryRouter><ScrapeControl /></MemoryRouter>);
    expect(screen.getByText('Channel One')).toBeInTheDocument();
    expect(screen.getByText(/Latest N videos/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Scrape 0 channels/i })).toBeDisabled();
  });

  it('enables run when a channel is picked + latestN clamps to 30', async () => {
    const { storage } = await import('~/lib/storage');
    await storage.hydrate();
    const ScrapeControl = (await import('./ScrapeControl')).default;
    render(<MemoryRouter><ScrapeControl /></MemoryRouter>);
    const cb = screen.getByRole('checkbox');
    fireEvent.click(cb);
    expect(screen.getByRole('button', { name: /Scrape 1 channel/i })).toBeEnabled();
    const n = screen.getByRole('spinbutton') as HTMLInputElement;
    fireEvent.change(n, { target: { value: '99' } });
    expect(n.value).toBe('30');
  });
});
