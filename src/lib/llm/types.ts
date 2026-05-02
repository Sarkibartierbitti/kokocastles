export type LLMProvider = 'anthropic' | 'openai' | 'gemini';

export type AnthropicModelId =
  | 'claude-haiku-4-5'
  | 'claude-sonnet-4-6'
  | 'claude-opus-4-7';

export type OpenAIModelId =
  | 'gpt-5.4-nano'
  | 'gpt-5.4-mini'
  | 'gpt-5.4';

export type GeminiModelId =
  | 'gemini-2.5-flash-lite'
  | 'gemini-2.5-flash'
  | 'gemini-1.5-pro';

export type LLMModelId = AnthropicModelId | OpenAIModelId | GeminiModelId;

export type LLMTask = 'triage' | 'deep' | 'outlierWhy' | 'synthesis';

export type TierMode = 'eco' | 'standard' | 'max';

export interface ProviderTierLadder {
  eco: LLMModelId;
  standard: LLMModelId;
  max: LLMModelId;
  synthesisMax: LLMModelId;
}
