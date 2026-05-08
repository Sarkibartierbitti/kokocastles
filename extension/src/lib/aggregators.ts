import type { DeepAnalysis, PlatformId, TranscriptSegment } from '~/types';
import { sliceByTime, fullText } from './transcript';

export interface DeepEntry {
  platform: PlatformId;
  videoId: string;
  deep: DeepAnalysis;
}

export interface TranscriptEntry {
  platform: PlatformId;
  videoId: string;
  segments: TranscriptSegment[];
}

export interface HookEntry {
  platform: PlatformId;
  videoId: string;
  hookType: string;
  spoken: string;
  onScreen: string;
  visualFormat: string;
  audioHook: string;
}

export interface ScriptEntry {
  platform: PlatformId;
  videoId: string;
  fullText: string;
}

export function aggregateHooks(deeps: DeepEntry[], transcripts: TranscriptEntry[]): HookEntry[] {
  const tIndex = new Map<string, TranscriptSegment[]>();
  for (const t of transcripts) tIndex.set(`${t.platform}::${t.videoId}`, t.segments);

  return deeps.map((d) => {
    const segs = tIndex.get(`${d.platform}::${d.videoId}`) ?? [];
    return {
      platform: d.platform,
      videoId: d.videoId,
      hookType: d.deep.hook.type,
      spoken: d.deep.hook.spoken,
      onScreen: d.deep.hook.onScreen,
      visualFormat: d.deep.hook.visualFormat,
      audioHook: segs.length > 0 ? sliceByTime(segs, 0, 5) : '',
    };
  });
}

export function aggregateScripts(transcripts: TranscriptEntry[]): ScriptEntry[] {
  return transcripts.map((t) => ({
    platform: t.platform,
    videoId: t.videoId,
    fullText: fullText(t.segments),
  }));
}
