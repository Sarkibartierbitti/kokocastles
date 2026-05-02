import { describe, it, expect } from 'vitest';
import { modelLabel, modelsForProvider } from './models';

describe('modelLabel', () => {
  it('returns the registry label for a known model id', () => {
    expect(modelLabel('claude-haiku-4-5')).toBe('Claude Haiku 4.5');
  });

  it('falls back to the id for an unknown model', () => {
    expect(modelLabel('not-a-real-model' as never)).toBe('not-a-real-model');
  });
});

describe('modelsForProvider', () => {
  it('returns the registry model id list for a known provider', () => {
    const ids = modelsForProvider('anthropic');
    expect(ids).toContain('claude-haiku-4-5');
    expect(ids[0]).toBe('claude-haiku-4-5'); // first entry is default
    expect(ids.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty array for unknown provider', () => {
    expect(modelsForProvider('nope' as never)).toEqual([]);
  });
});
