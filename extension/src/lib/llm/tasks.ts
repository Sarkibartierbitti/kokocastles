import { callLLM, type ContentBlock } from './index';
import { storage } from '../storage';
import { systemPrompts, taskTools, triageSchema, deepSchema, outlierWhySchema, synthesisSchema, ideasSchema, writerSchema, categorizeHookSchema, writerClarifySchema, writerPersonalizeSchema, writerRegenSchema } from '../prompts';
import { normalizeHookCategory, type HookCategory } from '../hookCategories';
import { fullText, sliceByTime } from '../transcript';
import { buildWriterPrompt, type DatabankBundle } from '../writerPrompt';
import type { DeepAnalysis, Idea, IdeaSourceRef, Persona, PlatformId, TranscriptSegment, TriageResult, Video, WriterContextRef, WriterDraft } from '../../types';
import type { LLMModelId } from './types';

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
  const cached = await storage.getTriage(video.platform, video.videoId);
  if (cached) return cached;
  const tool = taskTools.triage;
  const content: ContentBlock[] = [
    { type: 'image', mediaType: thumb.mediaType, base64: thumb.data },
    {
      type: 'text',
      text: `Title: ${video.title}\nChannel: ${video.channelTitle}\nViews: ${video.viewCount}\nDuration: ${video.durationSec ?? '?'} s\n\nHook transcript (0–5s): ${hookTranscript || '(none)'}`,
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
  const cached = await storage.getDeep(video.platform, video.videoId);
  if (cached) return cached;
  const tool = taskTools.deep;
  const hasTranscript = transcript.length > 0;
  const hookLine = hasTranscript
    ? `Hook (0–5s): ${sliceByTime(transcript, 0, 5) || '(no captions in window)'}`
    : 'Hook (0–5s): TRANSCRIPT UNAVAILABLE. Do not infer spoken hook content.';
  const fullLine = hasTranscript
    ? `Full transcript:\n${fullText(transcript)}`
    : 'Full transcript: TRANSCRIPT UNAVAILABLE. Use only the thumbnail for visual cues. Do not invent verbal/textual content the thumbnail does not show.';
  const content: ContentBlock[] = [
    { type: 'image', mediaType: thumb.mediaType, base64: thumb.data },
    {
      type: 'text',
      text: `Title: ${video.title}\nChannel: ${video.channelTitle}\nViews: ${video.viewCount}\nDuration: ${video.durationSec ?? '?'} s`,
    },
    { type: 'text', text: hookLine },
    { type: 'text', text: fullLine },
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

interface IdeasInput {
  deepEntries: Array<{ platform: PlatformId; videoId: string; deep: DeepAnalysis }>;
  persona: Persona | null;
}

export async function generateIdeas({ deepEntries, persona }: IdeasInput): Promise<Idea[]> {
  const tool = taskTools.ideas;
  const personaBlock = persona && (persona.niche || persona.context)
    ? `Creator niche: ${persona.niche}\nBrand context: ${persona.context}`
    : '(no persona configured)';
  const summaries = deepEntries.slice(0, 30).map((d, i) => {
    const h = d.deep.hook;
    return `${i + 1}. [${d.platform}/${d.videoId}] hook: "${h.spoken || h.onScreen}" · format: ${h.visualFormat} · techniques: ${d.deep.techniques.join(', ')}`;
  }).join('\n');

  const content: ContentBlock[] = [
    { type: 'text', text: `${personaBlock}\n\nAnalyzed videos:\n${summaries || '(none)'}` },
  ];

  const result = await callLLM<{ ideas: Array<{ title: string; rationale: string; score: number }> }>({
    task: 'ideas',
    systemPrompt: systemPrompts.ideas,
    content,
    toolName: tool.name,
    toolDescription: tool.description ?? 'record ideas',
    schema: ideasSchema,
    maxTokens: 1500,
  });

  const refs: IdeaSourceRef[] = deepEntries.map((d) => ({ platform: d.platform, videoId: d.videoId }));
  const now = new Date().toISOString();
  return result.ideas.map((i) => ({
    id: crypto.randomUUID(),
    title: i.title,
    rationale: i.rationale,
    bucket: 'inbox' as const,
    createdAt: now,
    sourceRefs: refs,
    score: i.score,
  }));
}

export interface GenerateScriptArgs {
  topic: string;
  context: WriterContextRef;
  persona: Persona | null;
  databankBundles: DatabankBundle[];
  modelOverride?: LLMModelId;
}

export async function generateScript(args: GenerateScriptArgs): Promise<WriterDraft> {
  const userPrompt = buildWriterPrompt({
    topic: args.topic,
    context: args.context,
    persona: args.persona,
    databankBundles: args.databankBundles,
  });
  const tool = taskTools.writer;
  const result = await callLLM<{ script: string }>({
    task: 'writer',
    systemPrompt: systemPrompts.writer,
    content: [{ type: 'text', text: userPrompt }],
    toolName: tool.name,
    toolDescription: tool.description ?? 'record script',
    schema: writerSchema,
    maxTokens: 4000,
    modelOverride: args.modelOverride,
  });
  const usedModel = args.modelOverride || storage.getLLMModel() || 'unknown';
  return {
    id: crypto.randomUUID(),
    model: usedModel,
    contentMd: result.script,
    createdAt: new Date().toISOString(),
  };
}

export interface HookCategorizationInput {
  videoId: string;
  spoken: string;
  onScreen: string;
  visualFormat: string;
}

const CATEGORIZE_BATCH_SIZE = 30;

export async function categorizeHooks(
  items: HookCategorizationInput[]
): Promise<Array<{ videoId: string; category: HookCategory }>> {
  if (items.length === 0) return [];
  const results: Array<{ videoId: string; category: HookCategory }> = [];
  for (let i = 0; i < items.length; i += CATEGORIZE_BATCH_SIZE) {
    const batch = items.slice(i, i + CATEGORIZE_BATCH_SIZE);
    const body = batch
      .map(
        (b, idx) =>
          `${idx + 1}. videoId=${b.videoId}\n   spoken: ${b.spoken || '(none)'}\n   on-screen: ${b.onScreen || '(none)'}\n   visualFormat: ${b.visualFormat || '(none)'}`
      )
      .join('\n\n');
    const tool = taskTools.categorizeHook;
    const out = await callLLM<{ assignments: Array<{ videoId: string; category: string }> }>({
      task: 'categorizeHook',
      systemPrompt: systemPrompts.categorizeHook,
      content: [{ type: 'text', text: body }],
      toolName: tool.name,
      toolDescription: tool.description ?? 'record hook categories',
      schema: categorizeHookSchema,
      maxTokens: 600,
    });
    for (const a of out.assignments) {
      results.push({ videoId: a.videoId, category: normalizeHookCategory(a.category) });
    }
  }
  return results;
}

export async function writerClarify(args: GenerateScriptArgs): Promise<string[]> {
  const userPrompt = buildWriterPrompt({
    topic: args.topic,
    context: args.context,
    persona: args.persona,
    databankBundles: args.databankBundles,
  });
  const tool = taskTools.writerClarify;
  const r = await callLLM<{ questions: string[] }>({
    task: 'writerClarify',
    systemPrompt: systemPrompts.writerClarify,
    content: [{ type: 'text', text: userPrompt }],
    toolName: tool.name,
    toolDescription: tool.description ?? 'record clarifying questions',
    schema: writerClarifySchema,
    maxTokens: 500,
    modelOverride: args.modelOverride,
  });
  return r.questions;
}

export interface WriterPersonalizeArgs extends GenerateScriptArgs {
  clarifyAnswers: Record<string, string>;
}

export async function writerPersonalize(args: WriterPersonalizeArgs): Promise<string[]> {
  const base = buildWriterPrompt({
    topic: args.topic,
    context: args.context,
    persona: args.persona,
    databankBundles: args.databankBundles,
  });
  const qa = Object.entries(args.clarifyAnswers)
    .filter(([, a]) => a.trim().length > 0)
    .map(([q, a]) => `Q: ${q}\nA: ${a}`)
    .join('\n\n') || '(no clarifying answers provided)';
  const tool = taskTools.writerPersonalize;
  const r = await callLLM<{ options: string[] }>({
    task: 'writerPersonalize',
    systemPrompt: systemPrompts.writerPersonalize,
    content: [{ type: 'text', text: `${base}\n\n<clarifying_answers>\n${qa}\n</clarifying_answers>` }],
    toolName: tool.name,
    toolDescription: tool.description ?? 'record personalization options',
    schema: writerPersonalizeSchema,
    maxTokens: 500,
    modelOverride: args.modelOverride,
  });
  return r.options;
}

export interface WriterRegenArgs {
  fullDraftMd: string;
  paragraphIndex: number;
  paragraphText: string;
  hint?: string;
  modelOverride?: LLMModelId;
}

export async function writerRegenParagraph(args: WriterRegenArgs): Promise<string> {
  const tool = taskTools.writerRegen;
  const body = `<full_draft>\n${args.fullDraftMd}\n</full_draft>\n\n<target_paragraph index="${args.paragraphIndex}">\n${args.paragraphText}\n</target_paragraph>${args.hint ? `\n\n<user_hint>\n${args.hint}\n</user_hint>` : ''}`;
  const r = await callLLM<{ paragraph: string }>({
    task: 'writerRegen',
    systemPrompt: systemPrompts.writerRegen,
    content: [{ type: 'text', text: body }],
    toolName: tool.name,
    toolDescription: tool.description ?? 'record paragraph rewrite',
    schema: writerRegenSchema,
    maxTokens: 800,
    modelOverride: args.modelOverride,
  });
  return r.paragraph;
}
