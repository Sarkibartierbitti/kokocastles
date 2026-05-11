import type { DeepAnalysis, Persona, TranscriptSegment, Video, WriterContextRef } from '../types';
import { fullText } from './transcript';

export interface DatabankBundle {
  databankName: string;
  videos: Array<{
    video: Video;
    deep: DeepAnalysis | null;
    transcript: TranscriptSegment[] | null;
  }>;
}

export interface BuildWriterInputArgs {
  topic: string;
  context: WriterContextRef;
  persona: Persona | null;
  databankBundles: DatabankBundle[];
}

const ROLE =
  'You are a world-class assistant for creating short-form social media videos. Your job is to help create the highest quality content.';

const TASK =
  'Assist me in developing the topic below into a fully-fledged, ready-to-publish short-form social media video script. Use any persona, reference videos, and uploaded files as context. Output only the script in markdown — sections for HOOK, BODY, and CTA. No preamble.';

const INSTRUCTIONS = [
  '1. Read all of the content I provide so that you understand the niche, voice, and reference material.',
  '2. Match the writing-style sample if one is given.',
  '3. The script must be tight enough to read in 60 seconds.',
  '4. Use clear visual cues in brackets where helpful, e.g. [B-ROLL: ...].',
  "5. Do not invent facts. If reference material is sparse, lean on the persona's brand context.",
].join('\n');

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function buildWriterPrompt(args: BuildWriterInputArgs): string {
  const parts: string[] = [];
  parts.push(`<role>\n${ROLE}\n</role>`);
  parts.push(`<task>\n${TASK}\n</task>`);
  parts.push(`<instructions>\n${INSTRUCTIONS}\n</instructions>`);

  const inputsInner: string[] = [];
  const topicText = args.topic.trim() || '(no topic provided)';
  inputsInner.push(`<topic>\n${escapeXml(topicText)}\n</topic>`);

  if (args.context.usePersona && args.persona) {
    const p = args.persona;
    const personaParts = [
      p.niche ? `<niche>\n${escapeXml(p.niche)}\n</niche>` : '',
      p.context ? `<brand_context>\n${escapeXml(p.context)}\n</brand_context>` : '',
      p.styleSample ? `<writing_style_sample>\n${escapeXml(p.styleSample)}\n</writing_style_sample>` : '',
    ].filter(Boolean);
    if (personaParts.length) {
      inputsInner.push(`<persona>\n${personaParts.join('\n')}\n</persona>`);
    }
  }

  if (args.databankBundles.length) {
    const dbXml = args.databankBundles
      .map((b) => {
        const vids = b.videos
          .slice(0, 30)
          .map((v) => {
            const hook = v.deep?.hook;
            const hookLine = hook
              ? `${hook.spoken || hook.onScreen} (format: ${hook.visualFormat})`
              : '(not analyzed)';
            const techniques = v.deep?.techniques.join(', ') ?? '';
            const transcript = v.transcript ? fullText(v.transcript).slice(0, 800) : '';
            return [
              `<video title="${escapeXml(v.video.title)}" channel="${escapeXml(v.video.channelTitle)}">`,
              `  <hook>${escapeXml(hookLine)}</hook>`,
              techniques ? `  <techniques>${escapeXml(techniques)}</techniques>` : '',
              transcript ? `  <transcript_excerpt>${escapeXml(transcript)}</transcript_excerpt>` : '',
              `</video>`,
            ]
              .filter(Boolean)
              .join('\n');
          })
          .join('\n');
        return `<databank name="${escapeXml(b.databankName)}">\n${vids}\n</databank>`;
      })
      .join('\n');
    inputsInner.push(`<reference_videos>\n${dbXml}\n</reference_videos>`);
  }

  if (args.context.files.length) {
    const filesXml = args.context.files
      .map(
        (f) =>
          `<file name="${escapeXml(f.name)}">\n${escapeXml(f.text.slice(0, 100_000))}\n</file>`
      )
      .join('\n');
    inputsInner.push(`<uploaded_files>\n${filesXml}\n</uploaded_files>`);
  }

  parts.push(`<inputs>\n${inputsInner.join('\n')}\n</inputs>`);
  return parts.join('\n\n');
}
