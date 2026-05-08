import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ComingSoon from './ComingSoon';

describe('ComingSoon', () => {
  it('renders the kind in the heading', () => {
    render(<ComingSoon kind="databanks" />);
    expect(screen.getByRole('heading', { name: /databanks/i })).toBeInTheDocument();
  });

  it('shows the planned-phase badge', () => {
    render(<ComingSoon kind="ideas" phase={4} />);
    expect(screen.getByText(/phase 4/i)).toBeInTheDocument();
  });

  it('falls back gracefully when phase is omitted', () => {
    render(<ComingSoon kind="writer" />);
    expect(screen.queryByText(/phase/i)).not.toBeInTheDocument();
  });
});
