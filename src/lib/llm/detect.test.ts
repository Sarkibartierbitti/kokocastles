import { describe, it, expect } from 'vitest';
import { detectProvider } from './detect';

describe('detectProvider', () => {
  it('empty string → unknown', () => {
    expect(detectProvider('')).toEqual({ kind: 'unknown' });
  });
  it('sk-ant- → anthropic', () => {
    expect(detectProvider('sk-ant-abc123')).toEqual({ kind: 'detected', provider: 'anthropic' });
  });
  it('sk-proj- → openai', () => {
    expect(detectProvider('sk-proj-abc123')).toEqual({ kind: 'detected', provider: 'openai' });
  });
  it('plain sk- → openai', () => {
    expect(detectProvider('sk-abc123')).toEqual({ kind: 'detected', provider: 'openai' });
  });
  it('AIza → ambiguous (gemini or youtube)', () => {
    expect(detectProvider('AIzaSyAbc123')).toEqual({
      kind: 'ambiguous',
      candidates: ['gemini'],
    });
  });
  it('whitespace trimmed', () => {
    expect(detectProvider('  sk-ant-abc  ')).toEqual({ kind: 'detected', provider: 'anthropic' });
  });
  it('unrecognized prefix → unknown', () => {
    expect(detectProvider('foobar123')).toEqual({ kind: 'unknown' });
  });
});
