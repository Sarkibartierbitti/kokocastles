import { z } from 'zod';
import type { LLMTask } from '../types';

export const triageSchema = z.object({
  hookType: z.string(),
  spokenHook: z.string(),
  onScreenText: z.string(),
  visualFormat: z.string(),
});

export const deepSchema = z.object({
  hook: z.object({
    type: z.string(),
    spoken: z.string(),
    onScreen: z.string(),
    visualFormat: z.string(),
  }),
  structure: z.array(
    z.object({
      tStart: z.number(),
      label: z.string(),
      beat: z.string(),
    })
  ),
  pacing: z.object({
    avgCutSec: z.number(),
    rhythm: z.string(),
  }),
  techniques: z.array(z.string()),
});

export const outlierWhySchema = z.object({
  reason: z.string(),
});

export const synthesisSchema = z.object({
  sharedPatterns: z.array(
    z.object({
      name: z.string(),
      evidence: z.string(),
      useCase: z.string(),
    })
  ),
  commonHookFormats: z.array(z.string()),
  scriptTemplate: z.object({
    hook: z.string(),
    body: z.string(),
    cta: z.string(),
  }),
});

export const taskTools = {
  triage: {
    name: 'record_triage',
    description: 'Record a fast triage scan of a short-form video.',
    input_schema: {
      type: 'object',
      properties: {
        hookType: { type: 'string', description: 'Hook category, e.g. "controversial claim", "curiosity gap", "shock visual"' },
        spokenHook: { type: 'string', description: 'Verbatim spoken text in first 0–3s' },
        onScreenText: { type: 'string', description: 'Text overlay visible on the thumbnail/hook frame' },
        visualFormat: { type: 'string', description: 'e.g. "talking head", "B-roll montage", "split-screen", "greenscreen"' },
      },
      required: ['hookType', 'spokenHook', 'onScreenText', 'visualFormat'],
    },
  },
  deep: {
    name: 'record_analysis',
    description: 'Record a full structural analysis of a short-form video.',
    input_schema: {
      type: 'object',
      properties: {
        hook: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            spoken: { type: 'string' },
            onScreen: { type: 'string' },
            visualFormat: { type: 'string' },
          },
          required: ['type', 'spoken', 'onScreen', 'visualFormat'],
        },
        structure: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tStart: { type: 'number', description: 'beat start time in seconds' },
              label: { type: 'string', description: 'short label, e.g. "setup", "twist", "payoff", "cta"' },
              beat: { type: 'string', description: 'one-sentence summary of what happens' },
            },
            required: ['tStart', 'label', 'beat'],
          },
        },
        pacing: {
          type: 'object',
          properties: {
            avgCutSec: { type: 'number' },
            rhythm: { type: 'string', description: 'e.g. "fast cuts <2s", "single take", "rising tempo"' },
          },
          required: ['avgCutSec', 'rhythm'],
        },
        techniques: {
          type: 'array',
          items: { type: 'string' },
          description: 'Repeatable techniques: pattern interrupts, list structures, narrative loops, etc.',
        },
      },
      required: ['hook', 'structure', 'pacing', 'techniques'],
    },
  },
  outlierWhy: {
    name: 'record_outlier_reason',
    description: 'One-sentence hypothesis why this video over-performed the channel baseline.',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'one sentence, plain language' },
      },
      required: ['reason'],
    },
  },
  synthesis: {
    name: 'record_synthesis',
    description: 'Cross-video pattern synthesis and a reusable script template.',
    input_schema: {
      type: 'object',
      properties: {
        sharedPatterns: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              evidence: { type: 'string' },
              useCase: { type: 'string' },
            },
            required: ['name', 'evidence', 'useCase'],
          },
        },
        commonHookFormats: { type: 'array', items: { type: 'string' } },
        scriptTemplate: {
          type: 'object',
          properties: {
            hook: { type: 'string' },
            body: { type: 'string' },
            cta: { type: 'string' },
          },
          required: ['hook', 'body', 'cta'],
        },
      },
      required: ['sharedPatterns', 'commonHookFormats', 'scriptTemplate'],
    },
  },
} as const;

export const systemPrompts: Record<LLMTask, string> = {
  triage:
    'You analyze short-form vertical video (TikTok, Reels, YouTube Shorts). Given the hook frame and the first seconds of transcript, classify the hook fast. Return strict JSON via the record_triage tool. No prose.',
  deep:
    'You analyze short-form vertical video for viral structure. Identify the hook, narrative beats with timestamps, pacing, and reusable techniques. Be platform-neutral. Return strict JSON via the record_analysis tool. No prose.',
  outlierWhy:
    'You write one short, plain-language sentence explaining why a video likely over-performed its channel baseline. No hedging. Return JSON via the record_outlier_reason tool.',
  synthesis:
    'You synthesize patterns across multiple analyzed short-form videos in the same niche, then produce a reusable script template. Be specific and actionable. Return JSON via the record_synthesis tool.',
};
