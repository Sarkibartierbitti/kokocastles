export const HOOK_CATEGORIES = [
  'Personal Experience',
  'Curiosity Gap',
  'Shock Visual',
  'Pattern Interrupt',
  'Listicle',
  'Question',
  'Bold Claim',
  'Pain Point',
  'Transformation',
  'Contrarian Take',
  'Authority',
  'Social Proof',
  'Direct Address',
  'Storytime',
  'Tutorial',
] as const;

export type HookCategory = (typeof HOOK_CATEGORIES)[number] | 'Uncategorized';

export function isHookCategory(s: string): s is HookCategory {
  return s === 'Uncategorized' || (HOOK_CATEGORIES as readonly string[]).includes(s);
}

export function normalizeHookCategory(s: string): HookCategory {
  return isHookCategory(s) ? s : 'Uncategorized';
}
