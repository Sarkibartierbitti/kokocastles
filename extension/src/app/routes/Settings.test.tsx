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
});

async function renderSettings() {
  const { storage } = await import('~/lib/storage');
  await storage.hydrate();
  const Settings = (await import('./Settings')).default;
  return render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>
  );
}

describe('Settings — analysis defaults', () => {
  it('renders outlier threshold input with default 1.5', async () => {
    await renderSettings();
    const input = await screen.findByLabelText(/outlier threshold/i) as HTMLInputElement;
    expect(input.value).toBe('1.5');
  });

  it('persists outlier threshold on save', async () => {
    await renderSettings();
    const input = await screen.findByLabelText(/outlier threshold/i);
    fireEvent.change(input, { target: { value: '2.5' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(fakeStore['koko.outlierThreshold']).toBe(2.5);
    });
  });
});
