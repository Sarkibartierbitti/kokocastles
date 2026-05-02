// src/lib/llm/__tests__/providers.test.ts
import { describe, it, expect } from 'vitest';
import { PROVIDERS, getProvider, isValidProviderId, allModelIds } from '../providers';

describe('providers registry', () => {
  it('has unique ids', () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique model ids globally', () => {
    const ids = allModelIds();
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every openai-compat provider has a baseURL', () => {
    for (const p of PROVIDERS) {
      if (p.apiStyle === 'openai-compat') {
        expect(p.baseURL, `${p.id} missing baseURL`).toBeTruthy();
      }
    }
  });

  it('every provider has at least one model', () => {
    for (const p of PROVIDERS) {
      expect(p.models.length, `${p.id} has no models`).toBeGreaterThanOrEqual(1);
    }
  });

  it('keyRegex matches its own example sample', () => {
    const samples: Record<string, string> = {
      anthropic: 'sk-ant-api03-' + 'a'.repeat(95),
      openai: 'sk-proj-' + 'A'.repeat(60),
      gemini: 'AIza' + 'a'.repeat(35),
      mistral: 'a'.repeat(32),
      deepseek: 'sk-' + 'a'.repeat(48),
      xai: 'xai-' + 'A'.repeat(80),
      moonshot: 'sk-' + 'A'.repeat(48),
      zai: 'a'.repeat(40),
      openrouter: 'sk-or-v1-' + 'a'.repeat(64),
      groq: 'gsk_' + 'A'.repeat(52),
      together: 'a'.repeat(64),
      fireworks: 'fw_' + 'A'.repeat(24),
    };
    for (const p of PROVIDERS) {
      const sample = samples[p.id];
      expect(p.keyRegex.test(sample), `${p.id} regex did not match its sample`).toBe(true);
    }
  });

  it('getProvider returns def for known id, undefined for unknown', () => {
    expect(getProvider('anthropic')?.label).toBe('Anthropic (Claude)');
    expect(getProvider('nope')).toBeUndefined();
  });

  it('isValidProviderId rejects empty string', () => {
    expect(isValidProviderId('')).toBe(false);
    expect(isValidProviderId('anthropic')).toBe(true);
  });
});
