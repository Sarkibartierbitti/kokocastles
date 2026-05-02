import type { z } from 'zod';
import type { CallOptions, ContentBlock, LLMAdapter } from './adapter';
import { makeAnthropicAdapter } from './anthropic';
import { makeOpenAICompatAdapter } from './openaiCompat';
import { makeGeminiAdapter } from './gemini';
import { getProvider } from './providers';
import type { LLMProvider, LLMTask } from './types';
import { storage } from '../storage';
import { activity } from '../activity';

function adapterFor(provider: LLMProvider, apiKey: string): LLMAdapter {
  const def = getProvider(provider);
  if (!def) throw new Error(`Unknown provider: ${provider}`);
  switch (def.apiStyle) {
    case 'anthropic-native':
      return makeAnthropicAdapter(apiKey);
    case 'gemini-native':
      return makeGeminiAdapter(apiKey);
    case 'openai-compat':
      if (!def.baseURL) throw new Error(`Provider ${provider} missing baseURL`);
      return makeOpenAICompatAdapter(apiKey, def.baseURL);
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
  const def = getProvider(provider);
  if (!def) throw new Error(`Unknown provider: ${provider}`);
  const stored = storage.getLLMModel();
  const modelDef =
    (stored ? def.models.find((m) => m.id === stored) : undefined) ?? def.models[0];
  if (!modelDef) throw new Error(`No models registered for provider ${provider}`);
  const model = modelDef.id;
  const hasImages = args.content.some((b) => b.type === 'image');
  if (hasImages && !modelDef.vision) {
    throw new Error(
      `Model "${modelDef.label}" doesn't accept images. Pick a vision-capable model in Settings (look for the eye badge).`
    );
  }
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
  const token = activity.start({ task: args.task, provider, model });
  try {
    const result = await adapter.call<T>(opts);
    activity.done(token, {});
    return result;
  } catch (e) {
    activity.error(token, e instanceof Error ? e.message : String(e));
    throw e;
  }
}

export type { ContentBlock } from './adapter';
