import type { LLMModelId, LLMProvider, LLMTask, ProviderTierLadder, TierMode } from './types';

export const TIER_LADDER: Record<LLMProvider, ProviderTierLadder> = {
  anthropic: {
    eco: 'claude-haiku-4-5',
    standard: 'claude-sonnet-4-6',
    max: 'claude-sonnet-4-6',
    synthesisMax: 'claude-opus-4-7',
  },
  openai: {
    eco: 'gpt-5.4-nano',
    standard: 'gpt-5.4-mini',
    max: 'gpt-5.4',
    synthesisMax: 'gpt-5.4',
  },
  gemini: {
    eco: 'gemini-flash-lite',
    standard: 'gemini-flash',
    max: 'gemini-flash',
    synthesisMax: 'gemini-pro',
  },
};

export function pickModelForProvider(
  provider: LLMProvider,
  tier: TierMode,
  task: LLMTask
): LLMModelId {
  const ladder = TIER_LADDER[provider];
  if (tier === 'eco') {
    return task === 'synthesis' ? ladder.standard : ladder.eco;
  }
  if (tier === 'max') {
    return task === 'synthesis' ? ladder.synthesisMax : ladder.max;
  }
  // tier === 'standard'
  if (task === 'synthesis') {
    return ladder.standard;
  }
  return ladder.standard;
}

const LABELS: Record<LLMModelId, string> = {
  'claude-haiku-4-5': 'Haiku 4.5 (cheap)',
  'claude-sonnet-4-6': 'Sonnet 4.6 (default)',
  'claude-opus-4-7': 'Opus 4.7 (premium)',
  'gpt-5.4-nano': 'GPT-5.4 nano (cheap)',
  'gpt-5.4-mini': 'GPT-5.4 mini (default)',
  'gpt-5.4': 'GPT-5.4 (premium)',
  'gemini-flash-lite': 'Gemini Flash Lite (cheap)',
  'gemini-flash': 'Gemini Flash (default)',
  'gemini-pro': 'Gemini Pro (premium)',
};

export function modelLabel(id: LLMModelId): string {
  return LABELS[id];
}

export function modelsForProvider(provider: LLMProvider): LLMModelId[] {
  const ladder = TIER_LADDER[provider];
  const set = new Set<LLMModelId>([ladder.eco, ladder.standard, ladder.max, ladder.synthesisMax]);
  return [...set];
}
