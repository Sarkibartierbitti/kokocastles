import { describe, it, expect } from 'vitest';
import { HOOK_CATEGORIES, isHookCategory, normalizeHookCategory } from '../hookCategories';

describe('hookCategories', () => {
  it('isHookCategory recognizes each enum entry and Uncategorized', () => {
    for (const c of HOOK_CATEGORIES) expect(isHookCategory(c)).toBe(true);
    expect(isHookCategory('Uncategorized')).toBe(true);
  });

  it('isHookCategory rejects junk', () => {
    expect(isHookCategory('Lol')).toBe(false);
    expect(isHookCategory('')).toBe(false);
  });

  it('normalizeHookCategory maps unknown to Uncategorized and preserves known', () => {
    expect(normalizeHookCategory('Curiosity Gap')).toBe('Curiosity Gap');
    expect(normalizeHookCategory('Made-up')).toBe('Uncategorized');
    expect(normalizeHookCategory('Uncategorized')).toBe('Uncategorized');
  });
});
