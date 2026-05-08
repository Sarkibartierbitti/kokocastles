import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('~/app/routes/CrossChannel', () => ({
  default: ({ videoFilter }: { videoFilter?: (v: unknown) => boolean }) => (
    <div data-testid="cc">{videoFilter ? 'filtered' : 'all'}</div>
  ),
}));

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

async function renderAt(id: string) {
  fakeStore['koko.databanks'] = [
    { id: 'd1', name: 'Alpha', createdAt: '', videoRefs: [{ platform: 'youtube', videoId: 'v1', addedAt: '' }] },
  ];
  const { storage } = await import('~/lib/storage');
  await storage.hydrate();
  const DatabankDetail = (await import('./DatabankDetail')).default;
  return render(
    <MemoryRouter initialEntries={[`/databanks/${id}`]}>
      <Routes>
        <Route path="/databanks/:id" element={<DatabankDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('DatabankDetail', () => {
  it('shows the databank name and renders CrossChannel with a filter', async () => {
    await renderAt('d1');
    expect(await screen.findByRole('heading', { name: /alpha/i })).toBeInTheDocument();
    expect(screen.getByTestId('cc')).toHaveTextContent('filtered');
  });

  it('shows a not-found state for missing databank', async () => {
    await renderAt('does-not-exist');
    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
  });
});
