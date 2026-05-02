import { describe, it, expect } from 'vitest';
import { TIER_LADDER, pickModelForProvider, modelLabel } from './models';

describe('TIER_LADDER', () => {
  it('has anthropic, openai, gemini', () => {
    expect(Object.keys(TIER_LADDER).sort()).toEqual(['anthropic', 'gemini', 'openai']);
  });
});

describe('pickModelForProvider', () => {
  it('eco anthropic triage → haiku', () => {
    expect(pickModelForProvider('anthropic', 'eco', 'triage')).toBe('claude-haiku-4-5');
  });
  it('eco anthropic synthesis → sonnet (synthesis floor)', () => {
    expect(pickModelForProvider('anthropic', 'eco', 'synthesis')).toBe('claude-sonnet-4-6');
  });
  it('max anthropic synthesis → opus', () => {
    expect(pickModelForProvider('anthropic', 'max', 'synthesis')).toBe('claude-opus-4-7');
  });
  it('standard openai triage → gpt-5.4-mini', () => {
    expect(pickModelForProvider('openai', 'standard', 'triage')).toBe('gpt-5.4-mini');
  });
  it('eco gemini deep → flash-lite', () => {
    expect(pickModelForProvider('gemini', 'eco', 'deep')).toBe('gemini-2.5-flash-lite');
  });
  it('max gemini synthesis → pro', () => {
    expect(pickModelForProvider('gemini', 'max', 'synthesis')).toBe('gemini-1.5-pro');
  });
});

describe('modelLabel', () => {
  it('returns a human label for known model', () => {
    expect(modelLabel('claude-haiku-4-5')).toContain('Haiku');
  });
});
