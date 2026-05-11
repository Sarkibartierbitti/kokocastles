import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MarkdownView from './MarkdownView';

describe('MarkdownView', () => {
  it('renders h1', () => {
    render(<MarkdownView source="# Hello" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hello');
  });

  it('renders bold and italic', () => {
    render(<MarkdownView source="This is **bold** and *italic*." />);
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByText('italic').tagName).toBe('EM');
  });

  it('renders bullet list', () => {
    render(<MarkdownView source={'- one\n- two'} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('renders code fence', () => {
    render(<MarkdownView source={'```\nconst x = 1;\n```'} />);
    expect(document.querySelector('pre code')?.textContent).toBe('const x = 1;');
  });

  it('escapes raw HTML (no innerHTML injection)', () => {
    render(<MarkdownView source="hello <script>alert(1)</script>" />);
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
  });
});
