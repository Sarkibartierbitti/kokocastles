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

beforeEach(() => {
  for (const k of Object.keys(fakeStore)) delete fakeStore[k];
  vi.resetModules();
  vi.stubGlobal('confirm', () => true);
});

async function renderList() {
  const { storage } = await import('~/lib/storage');
  await storage.hydrate();
  const DatabanksList = (await import('./DatabanksList')).default;
  return render(<MemoryRouter><DatabanksList /></MemoryRouter>);
}

describe('DatabanksList', () => {
  it('shows empty state when no databanks', async () => {
    await renderList();
    expect(await screen.findByText(/no databanks yet/i)).toBeInTheDocument();
  });

  it('lists databanks with video counts', async () => {
    fakeStore['koko.databanks'] = [
      { id: 'a', name: 'Alpha', createdAt: '', videoRefs: [{ platform: 'youtube', videoId: 'v1', addedAt: '' }] },
    ];
    await renderList();
    expect(await screen.findByText(/alpha/i)).toBeInTheDocument();
    expect(screen.getByText(/1 video/i)).toBeInTheDocument();
  });

  it('creates a new databank inline', async () => {
    await renderList();
    fireEvent.click(await screen.findByRole('button', { name: /create databank/i }));
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
    await waitFor(() => {
      expect(screen.getByText(/hello/i)).toBeInTheDocument();
    });
  });

  it('deletes a databank', async () => {
    fakeStore['koko.databanks'] = [{ id: 'a', name: 'Alpha', createdAt: '', videoRefs: [] }];
    await renderList();
    fireEvent.click(await screen.findByRole('button', { name: /delete alpha/i }));
    await waitFor(() => {
      expect(screen.queryByText(/alpha/i)).not.toBeInTheDocument();
    });
  });
});
