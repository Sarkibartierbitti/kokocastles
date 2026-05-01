import type { LLMProvider } from './types';

export type DetectResult =
  | { kind: 'detected'; provider: LLMProvider }
  | { kind: 'ambiguous'; candidates: LLMProvider[] }
  | { kind: 'unknown' };

export function detectProvider(rawKey: string): DetectResult {
  const key = rawKey.trim();
  if (!key) return { kind: 'unknown' };
  if (key.startsWith('sk-ant-')) return { kind: 'detected', provider: 'anthropic' };
  if (key.startsWith('sk-')) return { kind: 'detected', provider: 'openai' };
  if (key.startsWith('AIza')) return { kind: 'ambiguous', candidates: ['gemini'] };
  return { kind: 'unknown' };
}
