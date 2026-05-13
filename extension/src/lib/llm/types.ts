import { PROVIDERS, type ProviderId } from './providers';

export type LLMProvider = ProviderId;

/** Union of every model id across all providers. */
export type LLMModelId = (typeof PROVIDERS)[number]['models'][number]['id'];

export type LLMTask =
  | 'triage'
  | 'deep'
  | 'outlierWhy'
  | 'synthesis'
  | 'ideas'
  | 'writer'
  | 'categorizeHook'
  | 'writerClarify'
  | 'writerPersonalize'
  | 'writerRegen';
