// src/lib/llm/providers.ts
export type ApiStyle = 'anthropic-native' | 'openai-compat' | 'gemini-native';

export interface ProviderModel {
  id: string;
  label: string;
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
  /** Curated model list — first entry is the default if user hasn't picked one. */
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
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
      { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
      { id: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
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
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
      { id: 'gpt-4.1', label: 'GPT-4.1' },
      { id: 'gpt-5.4-nano', label: 'GPT-5.4 nano' },
      { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
      { id: 'gpt-5.4', label: 'GPT-5.4' },
      { id: 'gpt-5.5', label: 'GPT-5.5' },
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
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { id: 'gemini-3-pro', label: 'Gemini 3 Pro' },
      { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (preview)' },
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
      { id: 'ministral-8b-2512', label: 'Ministral 8B' },
      { id: 'mistral-small-2503', label: 'Mistral Small' },
      { id: 'codestral-2501', label: 'Codestral' },
      { id: 'devstral-2512', label: 'Devstral' },
      { id: 'magistral-small-2509', label: 'Magistral Small' },
      { id: 'magistral-medium-2509', label: 'Magistral Medium' },
      { id: 'mistral-large-3', label: 'Mistral Large 3' },
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
      { id: 'deepseek-chat', label: 'DeepSeek Chat' },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
      { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
      { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
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
      { id: 'grok-code-fast-1', label: 'Grok Code Fast 1' },
      { id: 'grok-4.1-fast-reasoning', label: 'Grok 4.1 Fast (reasoning)' },
      { id: 'grok-4.20-non-reasoning', label: 'Grok 4.20' },
      { id: 'grok-4.20-reasoning', label: 'Grok 4.20 (reasoning)' },
      { id: 'grok-4.3', label: 'Grok 4.3' },
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
      { id: 'moonshot-v1-8k', label: 'Moonshot v1 8k' },
      { id: 'moonshot-v1-32k', label: 'Moonshot v1 32k' },
      { id: 'moonshot-v1-128k', label: 'Moonshot v1 128k' },
      { id: 'kimi-k2', label: 'Kimi K2' },
      { id: 'kimi-k2.5', label: 'Kimi K2.5' },
      { id: 'kimi-k2.6', label: 'Kimi K2.6' },
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
      { id: 'glm-4.5-air', label: 'GLM 4.5 Air' },
      { id: 'glm-4.5', label: 'GLM 4.5' },
      { id: 'glm-4.6', label: 'GLM 4.6' },
      { id: 'glm-4.7', label: 'GLM 4.7' },
      { id: 'glm-5-turbo', label: 'GLM 5 Turbo' },
      { id: 'glm-5.1', label: 'GLM 5.1' },
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
      { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
      { id: 'deepseek/deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
      { id: 'z-ai/glm-4.6', label: 'GLM 4.6' },
      { id: 'openai/gpt-5.4', label: 'GPT-5.4' },
      { id: 'google/gemini-3-pro', label: 'Gemini 3 Pro' },
      { id: 'anthropic/claude-opus-4-7', label: 'Claude Opus 4.7' },
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
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant' },
      { id: 'gemma2-9b-it', label: 'Gemma 2 9B' },
      { id: 'qwen-2.5-32b', label: 'Qwen 2.5 32B' },
      { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B' },
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
      { id: 'deepseek-r1-distill-llama-70b', label: 'DeepSeek R1 Distill 70B' },
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
      { id: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', label: 'Llama 3.1 70B Turbo' },
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', label: 'Llama 3.3 70B Turbo' },
      { id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3' },
      { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', label: 'Qwen 2.5 72B Turbo' },
      { id: 'mistralai/Mixtral-8x22B-Instruct-v0.1', label: 'Mixtral 8x22B' },
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
      { id: 'accounts/fireworks/models/llama-v3p3-70b-instruct', label: 'Llama 3.3 70B' },
      { id: 'accounts/fireworks/models/qwen2p5-72b-instruct', label: 'Qwen 2.5 72B' },
      { id: 'accounts/fireworks/models/mixtral-8x22b-instruct', label: 'Mixtral 8x22B' },
      { id: 'accounts/fireworks/routers/kimi-k2p5-turbo', label: 'Kimi K2.5 Turbo' },
      { id: 'accounts/fireworks/models/deepseek-v3p1', label: 'DeepSeek V3.1' },
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
