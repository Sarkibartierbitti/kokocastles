import { PROVIDERS, getProvider } from './providers';
import type { LLMModelId, LLMProvider } from './types';

export function modelLabel(id: LLMModelId): string {
  for (const p of PROVIDERS) {
    const m = p.models.find((mm) => mm.id === id);
    if (m) return m.label;
  }
  return id;
}

export function modelsForProvider(provider: LLMProvider): LLMModelId[] {
  const def = getProvider(provider);
  if (!def) return [];
  return def.models.map((m) => m.id as LLMModelId);
}
