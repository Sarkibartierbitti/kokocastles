import { describe, it, expect } from 'vitest';
import { detectProvider } from './detect';

describe('detectProvider', () => {
  it('empty string → unknown', () => {
    expect(detectProvider('')).toEqual({ kind: 'unknown' });
  });
  it('sk-ant- → anthropic', () => {
    const key = 'sk-ant-api03-' + 'a'.repeat(95);
    expect(detectProvider(key)).toEqual({ kind: 'detected', provider: 'anthropic' });
  });
  it('sk-proj- → openai (ambiguous with moonshot)', () => {
    const key = 'sk-proj-' + 'A'.repeat(60);
    const r = detectProvider(key);
    expect(r.kind).toBe('detected');
    if (r.kind === 'detected') expect(r.provider).toBe('openai');
  });
  it('plain sk- with hex chars → ambiguous', () => {
    const key = 'sk-' + 'a'.repeat(48);
    const r = detectProvider(key);
    expect(r.kind).toBe('ambiguous');
  });
  it('AIza → detected gemini', () => {
    const key = 'AIza' + 'a'.repeat(35);
    expect(detectProvider(key)).toEqual({ kind: 'detected', provider: 'gemini' });
  });
  it('whitespace trimmed', () => {
    const key = '  sk-ant-api03-' + 'a'.repeat(95) + '  ';
    expect(detectProvider(key)).toEqual({ kind: 'detected', provider: 'anthropic' });
  });
  it('unrecognized prefix → unknown', () => {
    expect(detectProvider('foobar123')).toEqual({ kind: 'unknown' });
  });
});
