import { z } from 'zod';
import type { LLMTask } from '../types';
import { HOOK_CATEGORIES } from './hookCategories';

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

export const ideasSchema = z.object({
  ideas: z.array(
    z.object({
      title: z.string().min(3),
      rationale: z.string().min(5),
      score: z.number().min(0).max(1),
    })
  ).min(1).max(20),
});

export const writerSchema = z.object({
  script: z.string().min(20),
});

export const categorizeHookSchema = z.object({
  assignments: z.array(
    z.object({
      videoId: z.string(),
      category: z.string(),
    })
  ),
});

export const writerClarifySchema = z.object({
  questions: z.array(z.string().min(3)).min(1).max(8),
});

export const writerPersonalizeSchema = z.object({
  options: z.array(z.string().min(3)).min(1).max(6),
});

export const writerRegenSchema = z.object({
  paragraph: z.string().min(10),
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
  ideas: {
    name: 'record_ideas',
    description: 'Record the generated short-form video ideas.',
    input_schema: {
      type: 'object',
      properties: {
        ideas: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'catchy hook-style title, ≤80 chars' },
              rationale: { type: 'string', description: 'why this might work for this creator, 1–2 sentences' },
              score: { type: 'number', description: 'confidence 0..1' },
            },
            required: ['title', 'rationale', 'score'],
          },
        },
      },
      required: ['ideas'],
    },
  },
  categorizeHook: {
    name: 'record_hook_categories',
    description: 'Classify each short-form video hook into one of the closed-set categories.',
    input_schema: {
      type: 'object',
      properties: {
        assignments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              videoId: { type: 'string' },
              category: { type: 'string', enum: [...HOOK_CATEGORIES, 'Uncategorized'] },
            },
            required: ['videoId', 'category'],
          },
        },
      },
      required: ['assignments'],
    },
  },
  writerClarify: {
    name: 'record_clarifying_questions',
    description: 'Record short follow-up questions to refine the user\'s topic.',
    input_schema: {
      type: 'object',
      properties: {
        questions: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 8 },
      },
      required: ['questions'],
    },
  },
  writerPersonalize: {
    name: 'record_personalization_options',
    description: 'Record distinct angle/twist options the user can pick from.',
    input_schema: {
      type: 'object',
      properties: {
        options: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 6 },
      },
      required: ['options'],
    },
  },
  writerRegen: {
    name: 'record_paragraph_rewrite',
    description: 'Record a rewritten markdown paragraph that replaces a single paragraph in the draft.',
    input_schema: {
      type: 'object',
      properties: { paragraph: { type: 'string' } },
      required: ['paragraph'],
    },
  },
  writer: {
    name: 'record_script',
    description: 'Record the finished short-form video script as markdown.',
    input_schema: {
      type: 'object',
      properties: {
        script: { type: 'string', description: 'Markdown script with HOOK/BODY/CTA sections.' },
      },
      required: ['script'],
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
    'You analyze short-form vertical video for viral structure. Identify the hook, narrative beats with timestamps, pacing, and reusable techniques. Be platform-neutral. Return strict JSON via the record_analysis tool. No prose. When the user provides "(no captions)" or empty transcript content, you MUST NOT invent verbal hook lines, narrative beats from speech, or CTAs that aren\'t visible in the thumbnail. Mark such fields as null or "(thumbnail-only — not verifiable)" rather than fabricating plausible content. Visual-only inferences from the thumbnail are fine; transcribed words you cannot see in the thumbnail are NOT.',
  outlierWhy:
    'You write one short, plain-language sentence explaining why a video likely over-performed its channel baseline. No hedging. Return JSON via the record_outlier_reason tool.',
  synthesis:
    'You synthesize patterns across multiple analyzed short-form videos in the same niche, then produce a reusable script template. Be specific and actionable. Return JSON via the record_synthesis tool.',
  ideas:
    "You are a creative strategist generating short-form video ideas inspired by a creator's analyzed videos and persona. Output 8 to 12 distinct ideas. Each idea has: title (catchy hook style, ≤80 chars), rationale (why it might work for this creator, 1–2 sentences), score (0..1 confidence). Do not repeat themes already saturated in the source set.",
  writer:
    "You write short-form social-media video scripts. Output is markdown only, returned via the record_script tool. The script must have three sections: HOOK (≤8s spoken, attention-grabbing), BODY (main content), CTA (final call to action). Use [B-ROLL: ...] inline cues where helpful. Stay tight enough to read in 60 seconds. Match the persona's writing style if provided. Never invent statistics or facts not present in inputs.",
  categorizeHook:
    `You classify short-form video hooks into a fixed set of categories. Choose exactly one category per hook from this list: ${HOOK_CATEGORIES.join(', ')}. If no category fits, return 'Uncategorized'. Reply only via the record_hook_categories tool. No prose.`,
  writerClarify:
    'Ask 3–5 short follow-up questions that would help refine scope, audience, tone, or constraints for a short-form video script. Each question ≤120 characters; no multi-part questions. Return strict JSON via the record_clarifying_questions tool. No prose.',
  writerPersonalize:
    'Given the topic + clarifying answers, propose 3–4 DISTINCT angles ("twists") this short-form video could take. Each option is one sentence ≤140 characters describing the angle. Return strict JSON via the record_personalization_options tool. No prose.',
  writerRegen:
    'Rewrite a SINGLE paragraph of an existing short-form video script. Preserve markdown shape (headings/lists) and match the rest of the draft\'s voice. Return ONLY the new paragraph via record_paragraph_rewrite — no preamble, no surrounding paragraphs.',
};
