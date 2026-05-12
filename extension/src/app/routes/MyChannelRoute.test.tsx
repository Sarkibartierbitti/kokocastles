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

vi.mock('~/lib/ownChannel', () => ({
  refreshOwnChannel: vi.fn(async () => {
    // Simulate the orchestrator's storage writes
    const { storage } = await import('~/lib/storage');
    await storage.setOwnChannelVideos([
      {
        platform: 'youtube',
        videoId: 'v1',
        channelId: 'UC123',
        channelTitle: 'me',
        title: 'Hello world',
        publishedAt: '2026-05-12',
        viewCount: 1000,
        thumbnailUrl: '',
      },
    ]);
    await storage.setOwnChannelRefreshedAt('2026-05-12T00:00:00Z');
  }),
}));

beforeEach(() => {
  for (const k of Object.keys(fakeStore)) delete fakeStore[k];
  vi.resetModules();
  vi.clearAllMocks();
});

async function renderRoute() {
  const { storage } = await import('~/lib/storage');
  await storage.hydrate();
  const MyChannelRoute = (await import('./MyChannelRoute')).default;
  return render(
    <MemoryRouter>
      <MyChannelRoute />
    </MemoryRouter>
  );
}

describe('MyChannelRoute', () => {
  it('empty state when no ownChannel', async () => {
    await renderRoute();
    expect(await screen.findByText(/no own channel linked/i)).toBeInTheDocument();
  });

  it('refresh button populates videos', async () => {
    fakeStore['koko.ownChannel'] = {
      platform: 'youtube',
      channelId: 'UC123',
      title: 'My Channel',
    };
    await renderRoute();
    fireEvent.click(await screen.findByRole('button', { name: /refresh now/i }));
    await waitFor(() => {
      expect(screen.getByText(/Hello world/)).toBeInTheDocument();
    });
  });

  it('renders existing hypotheses', async () => {
    fakeStore['koko.ownChannel'] = { platform: 'youtube', channelId: 'UC', title: 'Me' };
    fakeStore['koko.hypotheses'] = [
      {
        id: 'h1', name: 'Shorts test', description: '', manualVideoIds: ['v1'], applyToNext: 2,
        appliedAuto: [], seedSnapshotIds: [], createdAt: '',
      },
    ];
    await renderRoute();
    // Hypothesis name appears in both the hypotheses panel and the filter <option>
    const hits = await screen.findAllByText(/Shorts test/);
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });

  it('hypothesis filter hides untagged videos', async () => {
    fakeStore['koko.ownChannel'] = { platform: 'youtube', channelId: 'UC', title: 'Me' };
    fakeStore['koko.ownChannelVideos'] = [
      { platform: 'youtube', videoId: 'v1', channelId: 'UC', channelTitle: 'Me', title: 'tagged-vid', publishedAt: '', viewCount: 100, thumbnailUrl: '' },
      { platform: 'youtube', videoId: 'v2', channelId: 'UC', channelTitle: 'Me', title: 'untagged-vid', publishedAt: '', viewCount: 200, thumbnailUrl: '' },
    ];
    fakeStore['koko.hypotheses'] = [
      { id: 'h1', name: 'H', description: '', manualVideoIds: ['v1'], applyToNext: 0, appliedAuto: [], seedSnapshotIds: [], createdAt: '' },
    ];
    await renderRoute();
    expect(await screen.findByText(/untagged-vid/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: /hypothesis/i }), { target: { value: 'h1' } });
    await waitFor(() => {
      expect(screen.queryByText(/untagged-vid/)).not.toBeInTheDocument();
    });
    expect(screen.getByText(/tagged-vid/)).toBeInTheDocument();
  });

  it('delete hypothesis removes row', async () => {
    fakeStore['koko.ownChannel'] = { platform: 'youtube', channelId: 'UC', title: 'Me' };
    fakeStore['koko.hypotheses'] = [
      { id: 'h1', name: 'Doomed', description: '', manualVideoIds: [], applyToNext: 0, appliedAuto: [], seedSnapshotIds: [], createdAt: '' },
    ];
    await renderRoute();
    const del = await screen.findByRole('button', { name: /delete hypothesis Doomed/i });
    fireEvent.click(del);
    await waitFor(() => {
      expect((fakeStore['koko.hypotheses'] as unknown[]).length).toBe(0);
    });
  });

  it('create hypothesis via modal upserts', async () => {
    fakeStore['koko.ownChannel'] = { platform: 'youtube', channelId: 'UC', title: 'Me' };
    await renderRoute();
    fireEvent.click(await screen.findByRole('button', { name: /\+ new hypothesis/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'Made it' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => {
      const list = fakeStore['koko.hypotheses'] as Array<{ name: string }>;
      expect(list?.[0]?.name).toBe('Made it');
    });
    void dialog;
  });
});
