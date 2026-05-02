import { callLLM, type ContentBlock } from './index';
import { storage } from '../storage';
import { systemPrompts, taskTools, triageSchema, deepSchema, outlierWhySchema, synthesisSchema } from '../prompts';
import { fullText, sliceByTime } from '../transcript';
import type { DeepAnalysis, TranscriptSegment, TriageResult, Video } from '../../types';

export async function imageUrlToBase64(url: string): Promise<{ data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`thumbnail fetch failed: ${res.status}`);
  const blob = await res.blob();
  const mediaType = (blob.type === 'image/png' || blob.type === 'image/webp' || blob.type === 'image/jpeg')
    ? (blob.type as 'image/jpeg' | 'image/png' | 'image/webp')
    : 'image/jpeg';
  const buf = await blob.arrayBuffer();
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return { data: btoa(bin), mediaType };
}

export async function analyzeTriage(
  video: Video,
  thumb: { data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' },
  hookTranscript: string
): Promise<TriageResult> {
  const cached = storage.getTriage(video.platform, video.videoId);
  if (cached) return cached;
  const tool = taskTools.triage;
  const content: ContentBlock[] = [
    { type: 'image', mediaType: thumb.mediaType, base64: thumb.data },
    {
      type: 'text',
      text: `Title: ${video.title}\nChannel: ${video.channelTitle}\nViews: ${video.viewCount}\nDuration: ${video.durationSec ?? '?'} s\n\nHook transcript (0–3s): ${hookTranscript || '(none)'}`,
    },
  ];
  const result = await callLLM<TriageResult>({
    task: 'triage',
    systemPrompt: systemPrompts.triage,
    content,
    toolName: tool.name,
    toolDescription: tool.description ?? 'record triage analysis',
    schema: triageSchema,
    maxTokens: 400,
  });
  storage.setTriage(video.platform, video.videoId, result);
  return result;
}

export async function analyzeDeep(
  video: Video,
  thumb: { data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' },
  transcript: TranscriptSegment[]
): Promise<DeepAnalysis> {
  const cached = storage.getDeep(video.platform, video.videoId);
  if (cached) return cached;
  const tool = taskTools.deep;
  const content: ContentBlock[] = [
    { type: 'image', mediaType: thumb.mediaType, base64: thumb.data },
    {
      type: 'text',
      text: `Title: ${video.title}\nChannel: ${video.channelTitle}\nViews: ${video.viewCount}\nDuration: ${video.durationSec ?? '?'} s`,
    },
    { type: 'text', text: `Hook (0–3s): ${sliceByTime(transcript, 0, 3) || '(no captions in window)'}` },
    { type: 'text', text: `Full transcript:\n${fullText(transcript) || '(no captions)'}` },
  ];
  const result = await callLLM<DeepAnalysis>({
    task: 'deep',
    systemPrompt: systemPrompts.deep,
    content,
    toolName: tool.name,
    toolDescription: tool.description ?? 'record deep analysis',
    schema: deepSchema,
    maxTokens: 1500,
  });
  storage.setDeep(video.platform, video.videoId, result);
  return result;
}

export async function explainOutlier(video: Video, ratio: number): Promise<{ reason: string }> {
  const tool = taskTools.outlierWhy;
  return callLLM<{ reason: string }>({
    task: 'outlierWhy',
    systemPrompt: systemPrompts.outlierWhy,
    content: [
      {
        type: 'text',
        text: `Video "${video.title}" by ${video.channelTitle} got ${video.viewCount.toLocaleString()} views, which is ${ratio.toFixed(1)}x the channel's median for recent uploads. Why might it have over-performed? One sentence.`,
      },
    ],
    toolName: tool.name,
    toolDescription: tool.description ?? 'record outlier explanation',
    schema: outlierWhySchema,
    maxTokens: 150,
  });
}

export async function synthesize(deepAnalyses: DeepAnalysis[], niche?: string) {
  const tool = taskTools.synthesis;
  const text = deepAnalyses.map((a, i) => `--- Video ${i + 1} ---\n${JSON.stringify(a, null, 2)}`).join('\n\n');
  return callLLM<ReturnType<typeof synthesisSchema.parse>>({
    task: 'synthesis',
    systemPrompt: systemPrompts.synthesis,
    content: [
      { type: 'text', text: niche ? `Niche: ${niche}` : 'Niche: (general)' },
      { type: 'text', text: `Analyses:\n${text}` },
    ],
    toolName: tool.name,
    toolDescription: tool.description ?? 'record synthesis',
    schema: synthesisSchema,
    maxTokens: 2000,
  });
}
