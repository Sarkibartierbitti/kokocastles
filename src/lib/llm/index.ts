import type { z } from 'zod';
import type { CallOptions, ContentBlock, LLMAdapter } from './adapter';
import { makeAnthropicAdapter } from './anthropic';
import { makeOpenAIAdapter } from './openai';
import { makeGeminiAdapter } from './gemini';
import { pickModelForProvider } from './models';
import type { LLMProvider, LLMTask } from './types';
import { storage } from '../storage';

function adapterFor(provider: LLMProvider, apiKey: string): LLMAdapter {
  switch (provider) {
    case 'anthropic':
      return makeAnthropicAdapter(apiKey);
    case 'openai':
      return makeOpenAIAdapter(apiKey);
    case 'gemini':
      return makeGeminiAdapter(apiKey);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

export interface CallLLMArgs<T> {
  task: LLMTask;
  systemPrompt: string;
  content: ContentBlock[];
  toolName: string;
  toolDescription: string;
  schema: z.ZodType<T>;
  maxTokens: number;
}

export async function callLLM<T>(args: CallLLMArgs<T>): Promise<T> {
  const apiKey = storage.getLLMKey();
  const provider = storage.getLLMProvider();
  if (!apiKey || !provider) {
    throw new Error('LLM API key missing — set in Settings');
  }
  const tier = storage.getTierMode();
  const override = storage.getModelOverrides()[args.task];
  const model = override ?? pickModelForProvider(provider, tier, args.task);
  const adapter = adapterFor(provider, apiKey);
  const opts: CallOptions<T> = {
    task: args.task,
    model,
    systemPrompt: args.systemPrompt,
    content: args.content,
    toolName: args.toolName,
    toolDescription: args.toolDescription,
    schema: args.schema,
    maxTokens: args.maxTokens,
  };
  return adapter.call<T>(opts);
}

export { pickModelForProvider } from './models';
export type { ContentBlock } from './adapter';
