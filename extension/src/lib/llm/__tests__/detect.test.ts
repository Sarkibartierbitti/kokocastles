// src/lib/llm/__tests__/detect.test.ts
import { describe, it, expect } from 'vitest';
import { detectProvider } from '../detect';

describe('detectProvider', () => {
  it('returns unknown for empty input', () => {
    expect(detectProvider('')).toEqual({ kind: 'unknown' });
    expect(detectProvider('   ')).toEqual({ kind: 'unknown' });
  });

  it('detects anthropic from sk-ant- prefix even though sk- collides', () => {
    const key = 'sk-ant-api03-' + 'a'.repeat(95);
    const r = detectProvider(key);
    expect(r.kind).toBe('detected');
    if (r.kind === 'detected') expect(r.provider).toBe('anthropic');
  });

  it('detects openrouter from sk-or-v1- prefix unambiguously', () => {
    const key = 'sk-or-v1-' + 'a'.repeat(64);
    const r = detectProvider(key);
    expect(r.kind).toBe('detected');
    if (r.kind === 'detected') expect(r.provider).toBe('openrouter');
  });

  it('detects gemini from AIza prefix', () => {
    const key = 'AIza' + 'a'.repeat(35);
    const r = detectProvider(key);
    expect(r.kind).toBe('detected');
    if (r.kind === 'detected') expect(r.provider).toBe('gemini');
  });

  it('detects xai from xai- prefix', () => {
    const key = 'xai-' + 'A'.repeat(80);
    const r = detectProvider(key);
    expect(r.kind).toBe('detected');
    if (r.kind === 'detected') expect(r.provider).toBe('xai');
  });

  it('detects groq from gsk_ prefix', () => {
    const key = 'gsk_' + 'A'.repeat(52);
    const r = detectProvider(key);
    expect(r.kind).toBe('detected');
    if (r.kind === 'detected') expect(r.provider).toBe('groq');
  });

  it('detects fireworks from fw_ prefix', () => {
    const key = 'fw_' + 'A'.repeat(24);
    const r = detectProvider(key);
    expect(r.kind).toBe('detected');
    if (r.kind === 'detected') expect(r.provider).toBe('fireworks');
  });

  it('returns ambiguous for hex-only sk- key (openai/deepseek/moonshot collision)', () => {
    const key = 'sk-' + 'a'.repeat(48); // hex only — matches deepseek AND openai AND moonshot regex
    const r = detectProvider(key);
    expect(r.kind).toBe('ambiguous');
    if (r.kind === 'ambiguous') {
      expect(r.candidates).toContain('deepseek');
      expect(r.candidates).toContain('openai');
      expect(r.candidates).toContain('moonshot');
      expect(r.candidates).not.toContain('anthropic');
    }
  });

  it('returns unknown for clearly junk input', () => {
    expect(detectProvider('hello world')).toEqual({ kind: 'unknown' });
  });

  it('trims whitespace before matching', () => {
    const key = '  sk-or-v1-' + 'a'.repeat(64) + '  ';
    const r = detectProvider(key);
    expect(r.kind).toBe('detected');
  });

  it('low-specificity heuristic providers do not auto-win on a 32-hex string', () => {
    // mistral matches ^[A-Za-z0-9]{32}$ but specificity 1 — should be ambiguous, never auto-detected
    const key = 'a'.repeat(32);
    const r = detectProvider(key);
    // Should be ambiguous (mistral + zai both match) — never auto-detected because specificity ≤ 1
    expect(r.kind).toBe('ambiguous');
  });
});
