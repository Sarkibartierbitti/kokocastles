import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Stub the heavy CrossChannel route so the test stays fast and isolated.
vi.mock('~/app/routes/CrossChannel', () => ({
  default: () => <div data-testid="cross-channel-stub">cross-channel</div>,
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

async function renderRoute() {
  const Analyze = (await import('./Analyze')).default;
  return render(
    <MemoryRouter>
      <Analyze />
    </MemoryRouter>
  );
}

describe('Analyze route', () => {
  it('renders Videos sub-page by default (CrossChannel grid)', async () => {
    await renderRoute();
    expect(await screen.findByTestId('cross-channel-stub')).toBeInTheDocument();
  });

  it('switches to Hooks sub-page (ComingSoon)', async () => {
    await renderRoute();
    fireEvent.click(screen.getByRole('tab', { name: /hooks/i }));
    expect(screen.getByRole('heading', { name: /hooks/i })).toBeInTheDocument();
    expect(screen.queryByTestId('cross-channel-stub')).not.toBeInTheDocument();
  });

  it('switches to Scripts sub-page (ComingSoon)', async () => {
    await renderRoute();
    fireEvent.click(screen.getByRole('tab', { name: /scripts/i }));
    expect(screen.getByRole('heading', { name: /scripts/i })).toBeInTheDocument();
  });
});
