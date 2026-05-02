// src/lib/llm/providers.ts
export type ApiStyle = 'anthropic-native' | 'openai-compat' | 'gemini-native';

export interface ProviderModel {
  id: string;
  label: string;
  /** True if model accepts image content. Absent = unknown / text-only assumed. */
  vision?: boolean;
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
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', vision: true },
      { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', vision: true },
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', vision: true },
      { id: 'claude-opus-4-1', label: 'Claude Opus 4.1', vision: true },
      { id: 'claude-opus-4-5', label: 'Claude Opus 4.5', vision: true },
      { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', vision: true },
      { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', vision: true },
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
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', vision: true },
      { id: 'gpt-4.1', label: 'GPT-4.1', vision: true },
      { id: 'gpt-5-nano', label: 'GPT-5 nano' },
      { id: 'gpt-5-mini', label: 'GPT-5 mini', vision: true },
      { id: 'gpt-5', label: 'GPT-5', vision: true },
      { id: 'gpt-5.1', label: 'GPT-5.1', vision: true },
      { id: 'gpt-5.2', label: 'GPT-5.2', vision: true },
      { id: 'gpt-5.3-chat', label: 'GPT-5.3 (chat)', vision: true },
      { id: 'gpt-5.4-nano', label: 'GPT-5.4 nano' },
      { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini', vision: true },
      { id: 'gpt-5.4', label: 'GPT-5.4', vision: true },
      { id: 'gpt-5.5', label: 'GPT-5.5', vision: true },
      { id: 'o3', label: 'o3', vision: true },
      { id: 'chatgpt-4o-latest', label: 'ChatGPT-4o (latest)', vision: true },
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
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', vision: true },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', vision: true },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', vision: true },
      { id: 'gemini-3-flash', label: 'Gemini 3 Flash', vision: true },
      { id: 'gemini-3-pro', label: 'Gemini 3 Pro', vision: true },
      { id: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite (preview)', vision: true },
      { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (preview)', vision: true },
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
      { id: 'mistral-medium-2508', label: 'Mistral Medium' },
      { id: 'mistral-large-3', label: 'Mistral Large 3', vision: true },
      { id: 'pixtral-large-2411', label: 'Pixtral Large', vision: true },
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
      { id: 'deepseek-v3.1', label: 'DeepSeek V3.1' },
      { id: 'deepseek-v3.1-terminus', label: 'DeepSeek V3.1 Terminus' },
      { id: 'deepseek-v3.2', label: 'DeepSeek V3.2' },
      { id: 'deepseek-v3.2-exp', label: 'DeepSeek V3.2 Experimental' },
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
      { id: 'grok-3', label: 'Grok 3', vision: true },
      { id: 'grok-4', label: 'Grok 4', vision: true },
      { id: 'grok-4-fast', label: 'Grok 4 Fast', vision: true },
      { id: 'grok-4.1-fast-reasoning', label: 'Grok 4.1 Fast (reasoning)', vision: true },
      { id: 'grok-4.1', label: 'Grok 4.1', vision: true },
      { id: 'grok-4.20', label: 'Grok 4.20', vision: true },
      { id: 'grok-4.3', label: 'Grok 4.3', vision: true },
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
      { id: 'moonshot-v1-128k-vision-preview', label: 'Moonshot v1 128k (vision)', vision: true },
      { id: 'kimi-k2-0711-preview', label: 'Kimi K2 (0711)' },
      { id: 'kimi-k2-0905-preview', label: 'Kimi K2 (0905)' },
      { id: 'kimi-k2', label: 'Kimi K2' },
      { id: 'kimi-k2.5', label: 'Kimi K2.5' },
      { id: 'kimi-k2.5-instant', label: 'Kimi K2.5 Instant' },
      { id: 'kimi-k2.5-thinking', label: 'Kimi K2.5 (thinking)' },
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
      { id: 'glm-4.5v', label: 'GLM 4.5V (vision)', vision: true },
      { id: 'glm-4.6', label: 'GLM 4.6' },
      { id: 'glm-4.7', label: 'GLM 4.7' },
      { id: 'glm-5', label: 'GLM 5' },
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
      // Anthropic
      { id: 'anthropic/claude-haiku-4.5', label: 'Claude Haiku 4.5', vision: true },
      { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5', vision: true },
      { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6', vision: true },
      { id: 'anthropic/claude-opus-4.1', label: 'Claude Opus 4.1', vision: true },
      { id: 'anthropic/claude-opus-4.5', label: 'Claude Opus 4.5', vision: true },
      { id: 'anthropic/claude-opus-4.6', label: 'Claude Opus 4.6', vision: true },
      { id: 'anthropic/claude-opus-4.6-fast', label: 'Claude Opus 4.6 Fast', vision: true },
      { id: 'anthropic/claude-opus-4.7', label: 'Claude Opus 4.7', vision: true },
      // OpenAI
      { id: 'openai/gpt-4.1-mini', label: 'GPT-4.1 mini', vision: true },
      { id: 'openai/gpt-4.1', label: 'GPT-4.1', vision: true },
      { id: 'openai/gpt-5-mini', label: 'GPT-5 mini', vision: true },
      { id: 'openai/gpt-5', label: 'GPT-5', vision: true },
      { id: 'openai/gpt-5-pro', label: 'GPT-5 Pro', vision: true },
      { id: 'openai/gpt-5.1', label: 'GPT-5.1', vision: true },
      { id: 'openai/gpt-5.2', label: 'GPT-5.2', vision: true },
      { id: 'openai/gpt-5.3-chat', label: 'GPT-5.3 (chat)', vision: true },
      { id: 'openai/gpt-5.4-mini', label: 'GPT-5.4 mini', vision: true },
      { id: 'openai/gpt-5.4', label: 'GPT-5.4', vision: true },
      { id: 'openai/gpt-5.4-pro', label: 'GPT-5.4 Pro', vision: true },
      { id: 'openai/gpt-5.5', label: 'GPT-5.5', vision: true },
      { id: 'openai/gpt-5.5-pro', label: 'GPT-5.5 Pro', vision: true },
      { id: 'openai/o3', label: 'o3', vision: true },
      // Google
      { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', vision: true },
      { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', vision: true },
      { id: 'google/gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite (preview)', vision: true },
      { id: 'google/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (preview)', vision: true },
      { id: 'google/gemma-4-26b-a4b-it', label: 'Gemma 4 26B' },
      { id: 'google/gemma-4-31b-it', label: 'Gemma 4 31B' },
      // xAI
      { id: 'x-ai/grok-4', label: 'Grok 4', vision: true },
      { id: 'x-ai/grok-4-fast', label: 'Grok 4 Fast', vision: true },
      { id: 'x-ai/grok-4.1-fast', label: 'Grok 4.1 Fast', vision: true },
      { id: 'x-ai/grok-4.20', label: 'Grok 4.20', vision: true },
      { id: 'x-ai/grok-4.20-multi-agent', label: 'Grok 4.20 Multi-Agent', vision: true },
      { id: 'x-ai/grok-4.3', label: 'Grok 4.3', vision: true },
      { id: 'x-ai/grok-code-fast-1', label: 'Grok Code Fast 1' },
      // DeepSeek
      { id: 'deepseek/deepseek-chat-v3.1', label: 'DeepSeek Chat V3.1' },
      { id: 'deepseek/deepseek-r1-0528', label: 'DeepSeek R1 (0528)' },
      { id: 'deepseek/deepseek-v3.1-terminus', label: 'DeepSeek V3.1 Terminus' },
      { id: 'deepseek/deepseek-v3.2', label: 'DeepSeek V3.2' },
      { id: 'deepseek/deepseek-v3.2-exp', label: 'DeepSeek V3.2 Experimental' },
      { id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
      { id: 'deepseek/deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
      // Moonshot
      { id: 'moonshotai/kimi-k2', label: 'Kimi K2' },
      { id: 'moonshotai/kimi-k2-0905', label: 'Kimi K2 (0905)' },
      { id: 'moonshotai/kimi-k2-thinking', label: 'Kimi K2 (thinking)' },
      { id: 'moonshotai/kimi-k2.5', label: 'Kimi K2.5' },
      { id: 'moonshotai/kimi-k2.6', label: 'Kimi K2.6' },
      // Z.ai
      { id: 'z-ai/glm-4.5', label: 'GLM 4.5' },
      { id: 'z-ai/glm-4.5-air', label: 'GLM 4.5 Air' },
      { id: 'z-ai/glm-4.5v', label: 'GLM 4.5V (vision)', vision: true },
      { id: 'z-ai/glm-4.6', label: 'GLM 4.6' },
      { id: 'z-ai/glm-4.7', label: 'GLM 4.7' },
      { id: 'z-ai/glm-5', label: 'GLM 5' },
      { id: 'z-ai/glm-5.1', label: 'GLM 5.1' },
      // Mistral
      { id: 'mistralai/codestral-2508', label: 'Codestral' },
      { id: 'mistralai/devstral-2512', label: 'Devstral' },
      { id: 'mistralai/ministral-8b-2512', label: 'Ministral 8B' },
      { id: 'mistralai/mistral-large-2512', label: 'Mistral Large', vision: true },
      { id: 'mistralai/mistral-medium-3.1', label: 'Mistral Medium 3.1' },
      // Qwen / Alibaba
      { id: 'qwen/qwen-max', label: 'Qwen Max' },
      { id: 'qwen/qwen-plus', label: 'Qwen Plus' },
      { id: 'qwen/qwen3-235b-a22b-2507', label: 'Qwen3 235B A22B' },
      { id: 'qwen/qwen3-coder', label: 'Qwen3 Coder' },
      { id: 'qwen/qwen3-max', label: 'Qwen3 Max' },
      { id: 'qwen/qwen3-vl-235b-a22b-instruct', label: 'Qwen3-VL 235B', vision: true },
      { id: 'qwen/qwen3.5-122b-a10b', label: 'Qwen3.5 122B A10B' },
      { id: 'qwen/qwen3.5-27b', label: 'Qwen3.5 27B' },
      { id: 'qwen/qwen3.5-397b-a17b', label: 'Qwen3.5 397B A17B' },
      { id: 'qwen/qwen3.6-max-preview', label: 'Qwen3.6 Max (preview)' },
      { id: 'qwen/qwen3.6-plus', label: 'Qwen3.6 Plus' },
      // Meta
      { id: 'meta-llama/llama-4-maverick', label: 'Llama 4 Maverick', vision: true },
      { id: 'meta-llama/llama-4-scout', label: 'Llama 4 Scout', vision: true },
      // MiniMax
      { id: 'minimax/minimax-m2', label: 'MiniMax M2' },
      { id: 'minimax/minimax-m2.5', label: 'MiniMax M2.5' },
      { id: 'minimax/minimax-m2.7', label: 'MiniMax M2.7' },
      // Xiaomi
      { id: 'xiaomi/mimo-v2.5-pro', label: 'Mimo V2.5 Pro' },
      // NVIDIA
      { id: 'nvidia/nemotron-3-super-120b-a12b', label: 'Nemotron 3 Super 120B' },
      // Bytedance
      { id: 'bytedance-seed/seed-2.0-mini', label: 'Seed 2.0 Mini' },
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
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
      { id: 'gemma2-9b-it', label: 'Gemma 2 9B' },
      { id: 'qwen3-32b', label: 'Qwen3 32B' },
      { id: 'kimi-k2-instruct', label: 'Kimi K2 Instruct' },
      { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', label: 'Llama 4 Maverick 17B', vision: true },
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout 17B', vision: true },
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
      { id: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8', label: 'Llama 4 Maverick 17B', vision: true },
      { id: 'meta-llama/Llama-4-Scout-17B-16E-Instruct', label: 'Llama 4 Scout 17B', vision: true },
      { id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3' },
      { id: 'deepseek-ai/DeepSeek-R1', label: 'DeepSeek R1' },
      { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', label: 'Qwen 2.5 72B Turbo' },
      { id: 'Qwen/Qwen3-235B-A22B-Instruct-2507', label: 'Qwen3 235B A22B' },
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
      { id: 'accounts/fireworks/models/llama4-maverick-instruct-basic', label: 'Llama 4 Maverick', vision: true },
      { id: 'accounts/fireworks/models/llama4-scout-instruct-basic', label: 'Llama 4 Scout', vision: true },
      { id: 'accounts/fireworks/models/qwen2p5-72b-instruct', label: 'Qwen 2.5 72B' },
      { id: 'accounts/fireworks/models/qwen3-235b-a22b', label: 'Qwen3 235B A22B' },
      { id: 'accounts/fireworks/models/deepseek-v3p1', label: 'DeepSeek V3.1' },
      { id: 'accounts/fireworks/models/deepseek-r1', label: 'DeepSeek R1' },
      { id: 'accounts/fireworks/models/mixtral-8x22b-instruct', label: 'Mixtral 8x22B' },
      { id: 'accounts/fireworks/models/kimi-k2-instruct', label: 'Kimi K2' },
      { id: 'accounts/fireworks/models/glm-4p5', label: 'GLM 4.5' },
    ],
  },
];

export type ProviderId = (typeof PROVIDERS)[number]['id'];

export function getProvider(id: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function getModel(providerId: string, modelId: string): ProviderModel | undefined {
  return getProvider(providerId)?.models.find((m) => m.id === modelId);
}

export function isValidProviderId(id: string): boolean {
  return PROVIDERS.some((p) => p.id === id);
}

export function allModelIds(): string[] {
  return PROVIDERS.flatMap((p) => p.models.map((m) => m.id));
}
