// src/lib/llm/detect.ts
import { PROVIDERS } from './providers';
import type { LLMProvider } from './types';

export type DetectResult =
  | { kind: 'detected'; provider: LLMProvider }
  | { kind: 'ambiguous'; candidates: LLMProvider[] }
  | { kind: 'unknown' };

/**
 * Detection rules:
 * 1. Trim. Empty → unknown.
 * 2. Find every provider whose regex matches.
 * 3. Group by specificity (highest first).
 * 4. If the top-specificity group has exactly one provider AND its specificity ≥ 2 → detected.
 * 5. Else if multiple providers match → ambiguous (return all matches, sorted by specificity desc).
 * 6. Else → unknown.
 *
 * The specificity ≥ 2 floor prevents pure-charset heuristics (mistral 32-alnum,
 * together 64-hex, zai 32+ alnum) from ever auto-winning — they only surface as
 * ambiguous candidates the user must confirm.
 */
export function detectProvider(rawKey: string): DetectResult {
  const key = rawKey.trim();
  if (!key) return { kind: 'unknown' };

  const matches = PROVIDERS.filter((p) => p.keyRegex.test(key))
    .sort((a, b) => b.specificity - a.specificity);

  if (matches.length === 0) return { kind: 'unknown' };

  const top = matches[0];
  const topGroup = matches.filter((m) => m.specificity === top.specificity);

  if (topGroup.length === 1 && top.specificity >= 2) {
    return { kind: 'detected', provider: top.id as LLMProvider };
  }

  return {
    kind: 'ambiguous',
    candidates: matches.map((m) => m.id as LLMProvider),
  };
}
