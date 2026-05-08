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

async function renderRoute() {
  const { storage } = await import('~/lib/storage');
  await storage.hydrate();
  const Persona = (await import('./Persona')).default;
  return render(
    <MemoryRouter>
      <Persona />
    </MemoryRouter>
  );
}

describe('Persona route', () => {
  it('renders three textareas with correct char limits', async () => {
    await renderRoute();
    const niche = await screen.findByLabelText(/content niche/i) as HTMLTextAreaElement;
    const context = screen.getByLabelText(/brand context/i) as HTMLTextAreaElement;
    const style = screen.getByLabelText(/writing style/i) as HTMLTextAreaElement;
    expect(niche.maxLength).toBe(5000);
    expect(context.maxLength).toBe(5000);
    expect(style.maxLength).toBe(3000);
  });

  it('persists values to storage on save', async () => {
    await renderRoute();
    const niche = await screen.findByLabelText(/content niche/i);
    fireEvent.change(niche, { target: { value: 'Generative AI demos' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      const persona = fakeStore['koko.persona'] as { niche: string };
      expect(persona?.niche).toBe('Generative AI demos');
    });
  });

  it('shows char counter that updates as you type', async () => {
    await renderRoute();
    const context = await screen.findByLabelText(/brand context/i);
    fireEvent.change(context, { target: { value: 'hi' } });
    expect(screen.getByText(/2 \/ 5000/i)).toBeInTheDocument();
  });
});
