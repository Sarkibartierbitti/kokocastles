export type PlatformId = 'youtube' | 'tiktok' | 'instagram';

export interface Channel {
  platform: PlatformId;
  channelId: string;
  handle?: string;
  title: string;
  subscriberCount?: number;
  thumbnailUrl?: string;
}

export interface Persona {
  niche: string;        // ≤5000 chars
  context: string;      // ≤5000 chars
  styleSample: string;  // ≤3000 chars
  attachedDatabankIds: string[];
}

export interface Video {
  platform: PlatformId;
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  publishedAt: string;
  durationSec?: number;
  viewCount: number;
  likeCount?: number;
  thumbnailUrl: string;
}

export interface TranscriptSegment {
  start: number;
  dur: number;
  text: string;
}

export type {
  LLMProvider,
  LLMTask,
  LLMModelId,
} from './lib/llm/types';

export interface OutlierFlag {
  video: Video;
  isOutlier: boolean;
  ratio: number;
}

export interface TriageResult {
  hookType: string;
  spokenHook: string;
  onScreenText: string;
  visualFormat: string;
}

export interface DeepAnalysis {
  hook: {
    type: string;
    spoken: string;
    onScreen: string;
    visualFormat: string;
  };
  structure: { tStart: number; label: string; beat: string }[];
  pacing: { avgCutSec: number; rhythm: string };
  techniques: string[];
}

export interface DatabankVideoRef {
  platform: PlatformId;
  videoId: string;
  addedAt: string; // ISO date
}

export interface Databank {
  id: string;          // crypto.randomUUID
  name: string;
  createdAt: string;   // ISO
  videoRefs: DatabankVideoRef[];
}

export interface IdeaSourceRef {
  platform: PlatformId;
  videoId: string;
}

export interface ScrapedVideoCacheEntry {
  platform: PlatformId;
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  viewCount: number | null;
  publishedAtRelative: string;
  thumbnailUrl: string;
  durationSec: number | null;
  fetchedAt: string; // ISO
}

export interface Idea {
  id: string;            // crypto.randomUUID
  title: string;
  rationale: string;
  bucket: 'inbox' | 'shortlist';
  createdAt: string;     // ISO
  sourceRefs: IdeaSourceRef[];
  score: number;         // 0..1, LLM-assigned
}

export interface Hypothesis {
  id: string;                  // crypto.randomUUID
  name: string;
  description: string;
  manualVideoIds: string[];
  applyToNext: number;         // 0..20
  appliedAuto: string[];
  seedSnapshotIds: string[];
  createdAt: string;
}

export interface WriterContextRef {
  usePersona: boolean;
  databankIds: string[];
  files: { name: string; text: string }[];
}

export interface WriterDraft {
  id: string;            // crypto.randomUUID
  model: string;         // LLMModelId used for this draft
  contentMd: string;     // markdown body returned by the LLM
  createdAt: string;     // ISO
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
}

export interface WriterThread {
  id: string;            // crypto.randomUUID
  title: string;
  topic: string;
  context: WriterContextRef;
  drafts: WriterDraft[];
  createdAt: string;
  updatedAt: string;
  // Phase 8 multi-step state (all optional; absent = legacy single-shot)
  mode?: 'single' | 'multi';
  step?: 'idle' | 'clarify' | 'personalize' | 'draft' | 'iterate';
  clarifyQuestions?: string[];
  clarifyAnswers?: Record<string, string>;
  personalizationOptions?: string[];
  pickedOption?: string;
}
