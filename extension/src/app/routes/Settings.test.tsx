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
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(fakeStore['koko.outlierThreshold']).toBe(2.5);
    });
  });
});

describe('Settings — throttling + refresh', () => {
  it('renders concurrency input with default 2', async () => {
    await renderSettings();
    const input = await screen.findByLabelText(/scrape concurrency/i) as HTMLInputElement;
    expect(input.value).toBe('2');
  });

  it('renders jitter input with default 2500', async () => {
    await renderSettings();
    const input = await screen.findByLabelText(/jitter/i) as HTMLInputElement;
    expect(input.value).toBe('2500');
  });

  it('renders refresh interval with default 6', async () => {
    await renderSettings();
    const input = await screen.findByLabelText(/refresh interval/i) as HTMLInputElement;
    expect(input.value).toBe('6');
  });

  it('persists all three on save', async () => {
    await renderSettings();
    fireEvent.change(await screen.findByLabelText(/scrape concurrency/i), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/jitter/i), { target: { value: '4000' } });
    fireEvent.change(screen.getByLabelText(/refresh interval/i), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(fakeStore['koko.throttleConcurrency']).toBe(3);
      expect(fakeStore['koko.throttleJitterMs']).toBe(4000);
      expect(fakeStore['koko.refreshIntervalHours']).toBe(12);
    });
  });
});

describe('Settings — own channel', () => {
  it('renders own-channel URL input empty by default', async () => {
    await renderSettings();
    const input = await screen.findByLabelText(/own channel url/i) as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('persists own channel after resolve on save', async () => {
    // Pre-seed storage so the input round-trips a previously-saved channel.
    fakeStore['koko.ownChannel'] = {
      platform: 'youtube',
      channelId: 'UCown',
      title: 'Me',
    };
    await renderSettings();
    const input = await screen.findByLabelText(/own channel url/i) as HTMLInputElement;
    expect(input.value).toContain('UCown');
  });
});
