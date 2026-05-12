import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import HypothesisModal from './HypothesisModal';
import type { Hypothesis, Video } from '~/types';

function v(id: string, title = id): Video {
  return {
    platform: 'youtube',
    videoId: id,
    channelId: 'c',
    channelTitle: 'me',
    title,
    publishedAt: '',
    viewCount: 0,
    thumbnailUrl: '',
  };
}

describe('HypothesisModal', () => {
  it('renders fields', () => {
    render(<HypothesisModal ownVideos={[v('a')]} onClose={() => {}} onSave={async () => {}} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/apply to next/i)).toBeInTheDocument();
  });

  it('save disabled when name empty', () => {
    render(<HypothesisModal ownVideos={[]} onClose={() => {}} onSave={async () => {}} />);
    const btn = screen.getByRole('button', { name: /^save$/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('save calls onSave with correct shape', async () => {
    const onSave = vi.fn(async (_h: Hypothesis) => {});
    render(<HypothesisModal ownVideos={[v('a'), v('b')]} onClose={() => {}} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'My H' } });
    fireEvent.change(screen.getByLabelText(/apply to next/i), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const h = onSave.mock.calls[0][0];
    expect(h.name).toBe('My H');
    expect(h.applyToNext).toBe(3);
    expect(h.seedSnapshotIds).toEqual(['a', 'b']);
    expect(h.appliedAuto).toEqual([]);
  });

  it('ticking videos populates manualVideoIds', async () => {
    const onSave = vi.fn(async (_h: Hypothesis) => {});
    render(<HypothesisModal ownVideos={[v('a', 'Alpha')]} onClose={() => {}} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'X' } });
    fireEvent.click(screen.getByLabelText(/Alpha/));
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const h = onSave.mock.calls[0][0];
    expect(h.manualVideoIds).toEqual(['a']);
  });

  it('editing existing preserves appliedAuto + seedSnapshotIds + id + createdAt', async () => {
    const initial: Hypothesis = {
      id: 'fixed-id',
      name: 'Existing',
      description: 'd',
      manualVideoIds: [],
      applyToNext: 2,
      appliedAuto: ['x', 'y'],
      seedSnapshotIds: ['s1', 's2'],
      createdAt: '2026-01-01T00:00:00Z',
    };
    const onSave = vi.fn(async (_h: Hypothesis) => {});
    render(<HypothesisModal ownVideos={[v('a')]} initial={initial} onClose={() => {}} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const h = onSave.mock.calls[0][0];
    expect(h.id).toBe('fixed-id');
    expect(h.createdAt).toBe('2026-01-01T00:00:00Z');
    expect(h.appliedAuto).toEqual(['x', 'y']);
    expect(h.seedSnapshotIds).toEqual(['s1', 's2']);
  });
});
