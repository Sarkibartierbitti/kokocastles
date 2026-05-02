// src/lib/llm/providers.ts
export type ApiStyle = 'anthropic-native' | 'openai-compat' | 'gemini-native';

export interface ProviderModel {
  id: string;
  label: string;
  /** Hint for tier slotting. */
  tier: 'eco' | 'standard' | 'max' | 'premium';
}

export interface ProviderDef {
  id: string;
  label: string;
  apiStyle: ApiStyle;
  /** Regex to match a pasted key. Order matters only as a tiebreaker. */
  keyRegex: RegExp;
  /** Higher = more specific. Used to rank detection candidates. */
  specificity: number;
  /** Base URL for openai-compat providers. Anthropic/Gemini use SDK defaults. */
  baseURL?: string;
  /** Curated model list — first 'standard' is the default. */
  models: ProviderModel[];
  /** External link shown in Help. */
  consoleUrl: string;
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    apiStyle: 'anthropic-native',
    keyRegex: /^sk-ant-api03-[A-Za-z0-9_-]{40,}$/,
    specificity: 13,
    consoleUrl: 'https://console.anthropic.com/',
    models: [
      { id: 'claude-haiku-4-5', label: 'Haiku 4.5 (cheap)', tier: 'eco' },
      { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6 (default)', tier: 'standard' },
      { id: 'claude-opus-4-7', label: 'Opus 4.7 (premium)', tier: 'premium' },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    apiStyle: 'openai-compat',
    keyRegex: /^sk-(proj-|svcacct-|None-)?[A-Za-z0-9_-]{40,}$/,
    specificity: 3,
    baseURL: 'https://api.openai.com/v1',
    consoleUrl: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'gpt-5.4-nano', label: 'GPT-5.4 nano (cheap)', tier: 'eco' },
      { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini (default)', tier: 'standard' },
      { id: 'gpt-5.4', label: 'GPT-5.4 (premium)', tier: 'premium' },
    ],
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    apiStyle: 'gemini-native',
    keyRegex: /^AIza[A-Za-z0-9_-]{35}$/,
    specificity: 4,
    consoleUrl: 'https://aistudio.google.com/apikey',
    models: [
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (cheap)', tier: 'eco' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (default)', tier: 'standard' },
      { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro (premium)', tier: 'premium' },
    ],
  },
  {
    id: 'mistral',
    label: 'Mistral',
    apiStyle: 'openai-compat',
    keyRegex: /^[A-Za-z0-9]{32}$/,
    specificity: 1,
    baseURL: 'https://api.mistral.ai/v1',
    consoleUrl: 'https://console.mistral.ai/',
    models: [
      { id: 'ministral-8b-2512', label: 'Ministral 8B (cheap)', tier: 'eco' },
      { id: 'mistral-small-2503', label: 'Mistral Small (default)', tier: 'standard' },
      { id: 'mistral-large-3', label: 'Mistral Large 3 (premium)', tier: 'premium' },
    ],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    apiStyle: 'openai-compat',
    keyRegex: /^sk-[a-f0-9]{48}$/,
    specificity: 3,
    baseURL: 'https://api.deepseek.com/v1',
    consoleUrl: 'https://platform.deepseek.com/api_keys',
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek Chat (cheap)', tier: 'eco' },
      { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash (default)', tier: 'standard' },
      { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro (premium)', tier: 'premium' },
    ],
  },
  {
    id: 'xai',
    label: 'xAI Grok',
    apiStyle: 'openai-compat',
    keyRegex: /^xai-[A-Za-z0-9]{40,}$/,
    specificity: 4,
    baseURL: 'https://api.x.ai/v1',
    consoleUrl: 'https://console.x.ai/',
    models: [
      { id: 'grok-4.1-fast-reasoning', label: 'Grok 4.1 Fast (cheap)', tier: 'eco' },
      { id: 'grok-4.20-non-reasoning', label: 'Grok 4.20 (default)', tier: 'standard' },
      { id: 'grok-4.3', label: 'Grok 4.3 (premium)', tier: 'premium' },
    ],
  },
  {
    id: 'moonshot',
    label: 'Moonshot Kimi',
    apiStyle: 'openai-compat',
    keyRegex: /^sk-[A-Za-z0-9]{48}$/,
    specificity: 3,
    baseURL: 'https://api.moonshot.ai/v1',
    consoleUrl: 'https://platform.moonshot.ai/',
    models: [
      { id: 'moonshot-v1-32k', label: 'Moonshot v1 32k (cheap)', tier: 'eco' },
      { id: 'kimi-k2', label: 'Kimi K2 (default)', tier: 'standard' },
      { id: 'kimi-k2.6', label: 'Kimi K2.6 (premium)', tier: 'premium' },
    ],
  },
  {
    id: 'zai',
    label: 'Z.ai (GLM)',
    apiStyle: 'openai-compat',
    keyRegex: /^[A-Za-z0-9._-]{32,}$/,
    specificity: 1,
    baseURL: 'https://api.z.ai/api/paas/v4',
    consoleUrl: 'https://z.ai/',
    models: [
      { id: 'glm-4.5-air', label: 'GLM 4.5 Air (cheap)', tier: 'eco' },
      { id: 'glm-4.6', label: 'GLM 4.6 (default)', tier: 'standard' },
      { id: 'glm-5.1', label: 'GLM 5.1 (premium)', tier: 'premium' },
    ],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    apiStyle: 'openai-compat',
    keyRegex: /^sk-or-v1-[a-f0-9]{64}$/,
    specificity: 9,
    baseURL: 'https://openrouter.ai/api/v1',
    consoleUrl: 'https://openrouter.ai/keys',
    models: [
      { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B (cheap)', tier: 'eco' },
      { id: 'openai/gpt-5.4', label: 'GPT-5.4 (default)', tier: 'standard' },
      { id: 'anthropic/claude-opus-4-7', label: 'Claude Opus 4.7 (premium)', tier: 'premium' },
    ],
  },
  {
    id: 'groq',
    label: 'Groq',
    apiStyle: 'openai-compat',
    keyRegex: /^gsk_[A-Za-z0-9]{40,}$/,
    specificity: 4,
    baseURL: 'https://api.groq.com/openai/v1',
    consoleUrl: 'https://console.groq.com/keys',
    models: [
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant (cheap)', tier: 'eco' },
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (default)', tier: 'standard' },
      { id: 'deepseek-r1-distill-llama-70b', label: 'DeepSeek R1 70B (premium)', tier: 'premium' },
    ],
  },
  {
    id: 'together',
    label: 'Together AI',
    apiStyle: 'openai-compat',
    keyRegex: /^[a-f0-9]{64}$/,
    specificity: 1,
    baseURL: 'https://api.together.xyz/v1',
    consoleUrl: 'https://api.together.ai/settings/api-keys',
    models: [
      { id: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', label: 'Llama 3.1 70B Turbo (cheap)', tier: 'eco' },
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', label: 'Llama 3.3 70B Turbo (default)', tier: 'standard' },
      { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', label: 'Qwen 2.5 72B Turbo (premium)', tier: 'premium' },
    ],
  },
  {
    id: 'fireworks',
    label: 'Fireworks AI',
    apiStyle: 'openai-compat',
    keyRegex: /^fw_[A-Za-z0-9]{20,}$/,
    specificity: 3,
    baseURL: 'https://api.fireworks.ai/inference/v1',
    consoleUrl: 'https://fireworks.ai/account/api-keys',
    models: [
      { id: 'accounts/fireworks/models/llama-v3p3-70b-instruct', label: 'Llama 3.3 70B (cheap)', tier: 'eco' },
      { id: 'accounts/fireworks/models/qwen2p5-72b-instruct', label: 'Qwen 2.5 72B (default)', tier: 'standard' },
      { id: 'accounts/fireworks/models/deepseek-v3p1', label: 'DeepSeek V3.1 (premium)', tier: 'premium' },
    ],
  },
];

export type ProviderId = (typeof PROVIDERS)[number]['id'];

export function getProvider(id: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function isValidProviderId(id: string): boolean {
  return PROVIDERS.some((p) => p.id === id);
}

export function allModelIds(): string[] {
  return PROVIDERS.flatMap((p) => p.models.map((m) => m.id));
}
