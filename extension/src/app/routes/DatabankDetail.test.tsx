import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const fakeStore: Record<string, unknown> = {};
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
};
(globalThis as Record<string, unknown>).browser = mockBrowser;

beforeEach(() => {
  for (const k of Object.keys(fakeStore)) delete fakeStore[k];
  vi.clearAllMocks();
  vi.resetModules();
});

describe('DatabankDetail', () => {
  it('renders cache-hit rows with title + channel + views', async () => {
    const { storage } = await import('~/lib/storage');
    await storage.hydrate();
    const bank = await storage.createDatabank('B');
    await storage.addToDatabank(bank.id, { platform: 'youtube', videoId: 'v1' });
    await storage.setScrapedVideos([{
      platform: 'youtube', videoId: 'v1', channelId: 'UC1', channelTitle: 'Ch1',
      title: 'Hello', viewCount: 1000, publishedAtRelative: '2d', thumbnailUrl: 'http://x/v1', durationSec: 60,
      fetchedAt: '2026-05-15T00:00:00Z',
    }]);
    const DatabankDetail = (await import('./DatabankDetail')).default;
    render(
      <MemoryRouter initialEntries={[`/databanks/${bank.id}`]}>
        <Routes>
          <Route path="/databanks/:id" element={<DatabankDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText(/Ch1/)).toBeInTheDocument();
    expect(screen.getByText(/1,000 views/)).toBeInTheDocument();
  });

  it('renders fallback row for cache-miss ref', async () => {
    const { storage } = await import('~/lib/storage');
    await storage.hydrate();
    const bank = await storage.createDatabank('B');
    await storage.addToDatabank(bank.id, { platform: 'youtube', videoId: 'vMissing' });
    const DatabankDetail = (await import('./DatabankDetail')).default;
    render(
      <MemoryRouter initialEntries={[`/databanks/${bank.id}`]}>
        <Routes>
          <Route path="/databanks/:id" element={<DatabankDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(/no metadata yet/i)).toBeInTheDocument();
  });
});
