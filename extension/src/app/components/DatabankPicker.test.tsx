import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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

async function renderPicker(props: Partial<{ onClose: () => void; onPicked: (id: string) => void }> = {}) {
  const { storage } = await import('~/lib/storage');
  await storage.hydrate();
  const Picker = (await import('./DatabankPicker')).default;
  return render(
    <Picker
      open
      videoRef={{ platform: 'youtube', videoId: 'v1' }}
      onClose={props.onClose ?? (() => {})}
      onPicked={props.onPicked ?? (() => {})}
    />
  );
}

describe('DatabankPicker', () => {
  it('lists existing databanks', async () => {
    fakeStore['koko.databanks'] = [
      { id: 'a', name: 'Alpha', createdAt: '', videoRefs: [] },
      { id: 'b', name: 'Beta', createdAt: '', videoRefs: [] },
    ];
    await renderPicker();
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('clicking an existing databank adds the video and calls onPicked', async () => {
    fakeStore['koko.databanks'] = [{ id: 'a', name: 'Alpha', createdAt: '', videoRefs: [] }];
    const onPicked = vi.fn();
    await renderPicker({ onPicked });
    fireEvent.click(await screen.findByRole('button', { name: /alpha/i }));
    await waitFor(() => {
      expect(onPicked).toHaveBeenCalledWith('a');
      const dbs = fakeStore['koko.databanks'] as Array<{ videoRefs: unknown[] }>;
      expect(dbs[0].videoRefs).toHaveLength(1);
    });
  });

  it('create-new path validates the name', async () => {
    await renderPicker();
    fireEvent.click(await screen.findByRole('button', { name: /new databank/i }));
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
    expect(await screen.findByText(/required/i)).toBeInTheDocument();
  });

  it('create-new path adds the video to the new databank', async () => {
    const onPicked = vi.fn();
    await renderPicker({ onPicked });
    fireEvent.click(await screen.findByRole('button', { name: /new databank/i }));
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Fresh' } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
    await waitFor(() => {
      expect(onPicked).toHaveBeenCalledTimes(1);
      const dbs = fakeStore['koko.databanks'] as Array<{ name: string; videoRefs: unknown[] }>;
      expect(dbs).toHaveLength(1);
      expect(dbs[0].name).toBe('Fresh');
      expect(dbs[0].videoRefs).toHaveLength(1);
    });
  });
});
