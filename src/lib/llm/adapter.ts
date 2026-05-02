import type { z } from 'zod';
import type { LLMModelId, LLMTask } from './types';

export type ContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image';
      mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
      base64: string;
    };

export interface CallOptions<T> {
  task: LLMTask;
  model: LLMModelId;
  systemPrompt: string;
  content: ContentBlock[];
  toolName: string;
  toolDescription: string;
  schema: z.ZodType<T>;
  maxTokens: number;
}

export interface LLMAdapter {
  call<T>(opts: CallOptions<T>): Promise<T>;
}
