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

export interface Idea {
  id: string;            // crypto.randomUUID
  title: string;
  rationale: string;
  bucket: 'inbox' | 'shortlist';
  createdAt: string;     // ISO
  sourceRefs: IdeaSourceRef[];
  score: number;         // 0..1, LLM-assigned
}
