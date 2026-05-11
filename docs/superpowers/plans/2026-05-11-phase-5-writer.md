# Phase 5 — Writer v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Phase 1 `/writer` ComingSoon stub with a real, single-shot script writer. User picks contexts (persona, databanks, freeform topic, plain-text file uploads), picks a model, fires one generation, and gets back a markdown draft. Regenerate keeps prior drafts as history rows inside the same thread. Threads persist under `koko.writerThreads.<id>`. Phase 8 will layer the multi-step conversational flow on top.

**Architecture:**
- New `WriterThread` + `WriterDraft` types. Thread = topic + context refs + N drafts. Draft = `{ id, model, contentMd, createdAt, costUsd?, tokensIn?, tokensOut? }`.
- New `lib/writerPrompt.ts` builds the sandcastles XML pattern (`<role> / <task> / <instructions> / <inputs>`) from selected contexts.
- New `lib/llm/tasks.ts → generateScript()` calls Anthropic/etc. via the existing `callLLM` tool path; tool schema is a single `{ script: string }` so we keep the structured-output guarantee. Adds `'writer'` to `LLMTask`.
- New `/writer` route (`WriterRoute.tsx`) layout: left sidebar = thread list with "New thread"; main pane = context picker form on top, drafts stack below (newest first). Existing `Writer.tsx` stub forwarded to `WriterRoute` (same trick as `Ideas.tsx → IdeasRoute`).
- Model selector dropdown reads provider's model list from `lib/llm/providers.ts`; per-call override stored on the draft, never overwrites global `koko.llmModel`.
- Markdown render: lightweight inline converter (handle `# / ## / ### / **bold** / *italic* / lists / code fences / blank-line paragraphs). No new dep — keeps bundle small. If complexity escalates, swap to `react-markdown` in a follow-up.
- File uploads: `.txt` / `.md` only, read via `FileReader.readAsText()`, capped at 100 KB each, cumulative 500 KB per thread. PDFs/images deferred to Phase 8.
- LRU cap 50 threads (oldest by `updatedAt` evicted on overflow).

**Tech Stack:** Same as Phases 1–4 (Vite + React + TS + Tailwind + wxt).

**Source spec:** `docs/superpowers/specs/2026-05-07-full-product-feasibility-and-design.md` §2.6 and §4 Phase 5.

**Prerequisites:** Phases 1–4 complete (Persona, Databanks, Ideas all required by the context picker).

---

## File Structure

**New files:**
- `extension/src/lib/writerPrompt.ts` — XML prompt builder + token-rough estimator
- `extension/src/lib/__tests__/writerPrompt.test.ts`
- `extension/src/lib/__tests__/storage.writer.test.ts`
- `extension/src/app/routes/WriterRoute.tsx`
- `extension/src/app/routes/WriterRoute.test.tsx`
- `extension/src/app/components/MarkdownView.tsx` — inline markdown → React element converter
- `extension/src/app/components/MarkdownView.test.tsx`

**Modified files:**
- `extension/src/types.ts` — add `WriterThread`, `WriterDraft`, `WriterContextRef`
- `extension/src/lib/storage.ts` — add `writerThreads` accessors (list/get/upsert/delete/append-draft) with 50-thread LRU
- `extension/src/lib/llm/types.ts` — extend `LLMTask` with `'writer'`
- `extension/src/lib/prompts.ts` — add `writerSchema` (`{ script: string }`) + `taskTools.writer` tool def + `systemPrompts.writer` entry
- `extension/src/lib/llm/index.ts` — accept optional `modelOverride?: LLMModelId` on `CallLLMArgs`; if present, use it instead of `storage.getLLMModel()` (no global mutation)
- `extension/src/lib/llm/tasks.ts` — add `generateScript(input, modelOverride?)`
- `extension/src/app/routes/Writer.tsx` — replace stub body with `<WriterRoute />` import (keep filename so `App.tsx` route table is untouched)

---

## Task 1: Types

**Files:**
- Modify: `extension/src/types.ts`

- [ ] **Step 1: Append types**

```typescript
export interface WriterContextRef {
  /** Toggle: include current persona in inputs. */
  usePersona: boolean;
  /** Databank IDs whose video deep-analyses + transcripts are included. */
  databankIds: string[];
  /** Inline text files uploaded by the user (already read as utf-8). */
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
  title: string;         // derived from topic first 60 chars, user-editable
  topic: string;         // freeform user prompt
  context: WriterContextRef;
  drafts: WriterDraft[]; // newest-last; UI renders reverse
  createdAt: string;     // ISO
  updatedAt: string;     // ISO, bumped on every draft append or context edit
}
```

- [ ] **Step 2: Verify `tsc` clean**

```
cd extension && npm run compile
```

---

## Task 2: Storage helpers + LRU + tests

**Files:**
- Modify: `extension/src/lib/storage.ts`
- Create: `extension/src/lib/__tests__/storage.writer.test.ts`

- [ ] **Step 1: Add accessors**

Add to the `KEY` map:
```
writerThreads: 'koko.writerThreads',
```

Then append to the `storage` object:
```typescript
getWriterThreads: () => getCached<WriterThread[]>(KEY.writerThreads, []),

upsertWriterThread: async (t: WriterThread): Promise<void> => {
  const list = storage.getWriterThreads();
  const i = list.findIndex((x) => x.id === t.id);
  const next = i >= 0 ? list.map((x, idx) => (idx === i ? t : x)) : [t, ...list];
  // LRU: keep newest 50 by updatedAt
  next.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  await writeThrough(KEY.writerThreads, next.slice(0, 50));
},

deleteWriterThread: async (id: string): Promise<void> => {
  const list = storage.getWriterThreads().filter((t) => t.id !== id);
  await writeThrough(KEY.writerThreads, list);
},

appendWriterDraft: async (threadId: string, draft: WriterDraft): Promise<void> => {
  const list = storage.getWriterThreads();
  const next = list.map((t) =>
    t.id === threadId
      ? { ...t, drafts: [...t.drafts, draft], updatedAt: new Date().toISOString() }
      : t
  );
  await writeThrough(KEY.writerThreads, next);
},
```

Import `WriterThread`, `WriterDraft` from `../types` at the top of the file.

- [ ] **Step 2: Tests**

`extension/src/lib/__tests__/storage.writer.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

const fakeStore: Record<string, unknown> = {};
(globalThis as Record<string, unknown>).browser = {
  storage: {
    local: {
      get: vi.fn(async () => ({ ...fakeStore })),
      set: vi.fn(async (items: Record<string, unknown>) => Object.assign(fakeStore, items)),
      remove: vi.fn(async () => {}),
    },
  },
};

beforeEach(() => {
  for (const k of Object.keys(fakeStore)) delete fakeStore[k];
});

describe('storage.writerThreads', () => {
  it('upsert creates a thread', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    const t = {
      id: 'a', title: 'Hello', topic: 'about ducks',
      context: { usePersona: false, databankIds: [], files: [] },
      drafts: [], createdAt: '2026-05-11T00:00:00Z', updatedAt: '2026-05-11T00:00:00Z',
    };
    await storage.upsertWriterThread(t);
    expect(storage.getWriterThreads()).toHaveLength(1);
  });

  it('upsert replaces existing thread by id', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    const base = {
      id: 'a', title: 'Hello', topic: 'v1',
      context: { usePersona: false, databankIds: [], files: [] },
      drafts: [], createdAt: '2026-05-11T00:00:00Z', updatedAt: '2026-05-11T00:00:00Z',
    };
    await storage.upsertWriterThread(base);
    await storage.upsertWriterThread({ ...base, topic: 'v2', updatedAt: '2026-05-11T00:01:00Z' });
    const list = storage.getWriterThreads();
    expect(list).toHaveLength(1);
    expect(list[0].topic).toBe('v2');
  });

  it('LRU caps at 50 newest by updatedAt', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    for (let i = 0; i < 55; i++) {
      await storage.upsertWriterThread({
        id: `t${i}`, title: `T${i}`, topic: '',
        context: { usePersona: false, databankIds: [], files: [] },
        drafts: [],
        createdAt: `2026-05-11T00:00:${String(i).padStart(2,'0')}Z`,
        updatedAt: `2026-05-11T00:00:${String(i).padStart(2,'0')}Z`,
      });
    }
    expect(storage.getWriterThreads()).toHaveLength(50);
    expect(storage.getWriterThreads()[0].id).toBe('t54');
  });

  it('appendWriterDraft adds to drafts and bumps updatedAt', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.upsertWriterThread({
      id: 'a', title: 'T', topic: '',
      context: { usePersona: false, databankIds: [], files: [] },
      drafts: [], createdAt: '2026-05-11T00:00:00Z', updatedAt: '2026-05-11T00:00:00Z',
    });
    await storage.appendWriterDraft('a', {
      id: 'd1', model: 'claude-sonnet-4-5', contentMd: '# hi', createdAt: '2026-05-11T01:00:00Z',
    });
    const t = storage.getWriterThreads()[0];
    expect(t.drafts).toHaveLength(1);
    expect(t.updatedAt).not.toBe('2026-05-11T00:00:00Z');
  });

  it('delete removes a thread', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.upsertWriterThread({
      id: 'a', title: 'T', topic: '',
      context: { usePersona: false, databankIds: [], files: [] },
      drafts: [], createdAt: '2026-05-11T00:00:00Z', updatedAt: '2026-05-11T00:00:00Z',
    });
    await storage.deleteWriterThread('a');
    expect(storage.getWriterThreads()).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run tests**

```
cd extension && npx vitest run src/lib/__tests__/storage.writer.test.ts
```

Five green.

---

## Task 3: XML prompt builder + tests

**Files:**
- Create: `extension/src/lib/writerPrompt.ts`
- Create: `extension/src/lib/__tests__/writerPrompt.test.ts`

- [ ] **Step 1: Builder**

```typescript
// extension/src/lib/writerPrompt.ts
import type { DeepAnalysis, Persona, PlatformId, TranscriptSegment, Video, WriterContextRef } from '../types';
import { fullText } from './transcript';

export interface BuildWriterInputArgs {
  topic: string;
  context: WriterContextRef;
  persona: Persona | null;
  /** Resolved databank video bundles (caller fetches; builder is pure). */
  databankBundles: {
    databankName: string;
    videos: Array<{
      video: Video;
      deep: DeepAnalysis | null;
      transcript: TranscriptSegment[] | null;
    }>;
  }[];
}

const ROLE = `You are a world-class assistant for creating short-form social media videos. Your job is to help create the highest quality content.`;

const TASK = `Assist me in developing the topic below into a fully-fledged, ready-to-publish short-form social media video script. Use any persona, reference videos, and uploaded files as context. Output only the script in markdown — sections for HOOK, BODY, and CTA. No preamble.`;

const INSTRUCTIONS = `1. Read all of the content I provide so that you understand the niche, voice, and reference material.
2. Match the writing-style sample if one is given.
3. The script must be tight enough to read in 60 seconds.
4. Use clear visual cues in brackets where helpful, e.g. [B-ROLL: ...].
5. Do not invent facts. If reference material is sparse, lean on the persona's brand context.`;

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildWriterPrompt(args: BuildWriterInputArgs): string {
  const parts: string[] = [];
  parts.push(`<role>\n${ROLE}\n</role>`);
  parts.push(`<task>\n${TASK}\n</task>`);
  parts.push(`<instructions>\n${INSTRUCTIONS}\n</instructions>`);

  const inputsInner: string[] = [];
  inputsInner.push(`<topic>\n${escapeXml(args.topic.trim() || '(no topic provided)')}\n</topic>`);

  if (args.context.usePersona && args.persona) {
    const p = args.persona;
    const personaBlock = [
      p.niche ? `<niche>\n${escapeXml(p.niche)}\n</niche>` : '',
      p.context ? `<brand_context>\n${escapeXml(p.context)}\n</brand_context>` : '',
      p.styleSample ? `<writing_style_sample>\n${escapeXml(p.styleSample)}\n</writing_style_sample>` : '',
    ].filter(Boolean).join('\n');
    if (personaBlock) inputsInner.push(`<persona>\n${personaBlock}\n</persona>`);
  }

  if (args.databankBundles.length) {
    const dbXml = args.databankBundles.map((b) => {
      const vids = b.videos.slice(0, 30).map((v) => {
        const hook = v.deep?.hook;
        const hookLine = hook ? `${hook.spoken || hook.onScreen} (format: ${hook.visualFormat})` : '(not analyzed)';
        const techniques = v.deep?.techniques.join(', ') ?? '';
        const transcript = v.transcript ? fullText(v.transcript).slice(0, 800) : '';
        return [
          `<video title="${escapeXml(v.video.title)}" channel="${escapeXml(v.video.channelTitle)}">`,
          `  <hook>${escapeXml(hookLine)}</hook>`,
          techniques ? `  <techniques>${escapeXml(techniques)}</techniques>` : '',
          transcript ? `  <transcript_excerpt>${escapeXml(transcript)}</transcript_excerpt>` : '',
          `</video>`,
        ].filter(Boolean).join('\n');
      }).join('\n');
      return `<databank name="${escapeXml(b.databankName)}">\n${vids}\n</databank>`;
    }).join('\n');
    inputsInner.push(`<reference_videos>\n${dbXml}\n</reference_videos>`);
  }

  if (args.context.files.length) {
    const filesXml = args.context.files.map((f) =>
      `<file name="${escapeXml(f.name)}">\n${escapeXml(f.text.slice(0, 100_000))}\n</file>`
    ).join('\n');
    inputsInner.push(`<uploaded_files>\n${filesXml}\n</uploaded_files>`);
  }

  parts.push(`<inputs>\n${inputsInner.join('\n')}\n</inputs>`);
  return parts.join('\n\n');
}
```

- [ ] **Step 2: Tests**

```typescript
// extension/src/lib/__tests__/writerPrompt.test.ts
import { describe, it, expect } from 'vitest';
import { buildWriterPrompt } from '../writerPrompt';

describe('buildWriterPrompt', () => {
  it('always includes role/task/instructions/inputs/topic', () => {
    const out = buildWriterPrompt({
      topic: 'How sourdough bread changed my life',
      context: { usePersona: false, databankIds: [], files: [] },
      persona: null,
      databankBundles: [],
    });
    expect(out).toMatch(/<role>/);
    expect(out).toMatch(/<task>/);
    expect(out).toMatch(/<instructions>/);
    expect(out).toMatch(/<inputs>/);
    expect(out).toMatch(/<topic>\s*How sourdough bread changed my life\s*<\/topic>/);
  });

  it('omits persona block when usePersona is false', () => {
    const out = buildWriterPrompt({
      topic: 't',
      context: { usePersona: false, databankIds: [], files: [] },
      persona: { niche: 'baking', context: 'small business', styleSample: 's', attachedDatabankIds: [] },
      databankBundles: [],
    });
    expect(out).not.toMatch(/<persona>/);
  });

  it('includes persona when usePersona is true', () => {
    const out = buildWriterPrompt({
      topic: 't',
      context: { usePersona: true, databankIds: [], files: [] },
      persona: { niche: 'baking', context: 'small business', styleSample: 'short punchy', attachedDatabankIds: [] },
      databankBundles: [],
    });
    expect(out).toMatch(/<persona>/);
    expect(out).toMatch(/<niche>\s*baking\s*<\/niche>/);
    expect(out).toMatch(/<brand_context>/);
    expect(out).toMatch(/<writing_style_sample>/);
  });

  it('renders reference_videos when databank bundles provided', () => {
    const out = buildWriterPrompt({
      topic: 't',
      context: { usePersona: false, databankIds: ['x'], files: [] },
      persona: null,
      databankBundles: [{
        databankName: 'Winners',
        videos: [{
          video: {
            platform: 'youtube', videoId: 'v1', channelId: 'c1', channelTitle: 'Chan',
            title: 'Viral take', publishedAt: '', viewCount: 100, thumbnailUrl: '',
          },
          deep: {
            hook: { type: 'curiosity', spoken: 'You wont believe', onScreen: '', visualFormat: 'talking head' },
            structure: [], pacing: { avgCutSec: 1, rhythm: 'fast' },
            techniques: ['list', 'pattern interrupt'],
          },
          transcript: [{ start: 0, dur: 1, text: 'hello world' }],
        }],
      }],
    });
    expect(out).toMatch(/<reference_videos>/);
    expect(out).toMatch(/<databank name="Winners">/);
    expect(out).toMatch(/title="Viral take"/);
    expect(out).toMatch(/<techniques>list, pattern interrupt<\/techniques>/);
  });

  it('escapes XML special chars in user input', () => {
    const out = buildWriterPrompt({
      topic: 'a < b & c > d',
      context: { usePersona: false, databankIds: [], files: [] },
      persona: null,
      databankBundles: [],
    });
    expect(out).toMatch(/a &lt; b &amp; c &gt; d/);
  });

  it('includes uploaded files block when files present', () => {
    const out = buildWriterPrompt({
      topic: 't',
      context: { usePersona: false, databankIds: [], files: [{ name: 'notes.md', text: '# Idea' }] },
      persona: null,
      databankBundles: [],
    });
    expect(out).toMatch(/<uploaded_files>/);
    expect(out).toMatch(/<file name="notes.md">/);
  });
});
```

- [ ] **Step 3: Run tests**

```
cd extension && npx vitest run src/lib/__tests__/writerPrompt.test.ts
```

Six green.

---

## Task 4: LLM task + tool + system prompt + per-call model override

**Files:**
- Modify: `extension/src/lib/llm/types.ts`
- Modify: `extension/src/lib/llm/index.ts`
- Modify: `extension/src/lib/prompts.ts`
- Modify: `extension/src/lib/llm/tasks.ts`

- [ ] **Step 1: Extend `LLMTask`**

`extension/src/lib/llm/types.ts`:
```typescript
export type LLMTask = 'triage' | 'deep' | 'outlierWhy' | 'synthesis' | 'ideas' | 'writer';
```

- [ ] **Step 2: Per-call model override on `callLLM`**

In `extension/src/lib/llm/index.ts`:
- Add `modelOverride?: LLMModelId` to `CallLLMArgs<T>` (import `LLMModelId` from `./types`).
- Inside `callLLM`, replace
  ```
  const stored = storage.getLLMModel();
  const modelDef = (stored ? def.models.find((m) => m.id === stored) : undefined) ?? def.models[0];
  ```
  with
  ```
  const stored = args.modelOverride || storage.getLLMModel();
  const modelDef = (stored ? def.models.find((m) => m.id === stored) : undefined) ?? def.models[0];
  ```

No other callers need to change — they omit `modelOverride`.

- [ ] **Step 3: Schema + tool + system prompt**

In `extension/src/lib/prompts.ts`:
```typescript
export const writerSchema = z.object({
  script: z.string().min(20),
});
```

Add to `taskTools`:
```typescript
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
```

Add to `systemPrompts` (which is `Record<LLMTask, string>` — TS will flag the missing key):
```typescript
writer:
  "You write short-form social-media video scripts. Output is markdown only, returned via the record_script tool. The script must have three sections: HOOK (≤8s spoken, attention-grabbing), BODY (main content), CTA (final call to action). Use [B-ROLL: ...] inline cues where helpful. Stay tight enough to read in 60 seconds. Match the persona's writing style if provided. Never invent statistics or facts not present in inputs.",
```

- [ ] **Step 4: Task function**

In `extension/src/lib/llm/tasks.ts`:
```typescript
import { writerSchema } from '../prompts';
import type { WriterContextRef, WriterDraft } from '../../types';
import { buildWriterPrompt } from '../writerPrompt';

export interface GenerateScriptArgs {
  topic: string;
  context: WriterContextRef;
  persona: Persona | null;
  databankBundles: Parameters<typeof buildWriterPrompt>[0]['databankBundles'];
  modelOverride?: string;
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
  return {
    id: crypto.randomUUID(),
    model: args.modelOverride || (await import('../storage')).storage.getLLMModel() || 'unknown',
    contentMd: result.script,
    createdAt: new Date().toISOString(),
  };
}
```

Import additions: `writerSchema` from `../prompts`, `WriterContextRef`, `WriterDraft` from `../../types`, `buildWriterPrompt` from `../writerPrompt`.

- [ ] **Step 5: Verify**

```
cd extension && npm run compile && npx vitest run
```

`tsc` clean, all prior tests pass.

---

## Task 5: MarkdownView component + tests

**Files:**
- Create: `extension/src/app/components/MarkdownView.tsx`
- Create: `extension/src/app/components/MarkdownView.test.tsx`

- [ ] **Step 1: Component**

```tsx
// Minimal markdown renderer: # ## ### headings, **bold**, *italic*, - and 1. lists,
// ``` code fences, blank-line paragraphs. Enough for LLM script output. No deps.
import { Fragment, type ReactNode } from 'react';

function renderInline(s: string): ReactNode {
  // Bold then italic. Escape HTML by virtue of returning ReactNodes, never dangerouslySetInnerHTML.
  const parts: ReactNode[] = [];
  let i = 0;
  let key = 0;
  const re = /(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > i) parts.push(s.slice(i, m.index));
    if (m[1]) parts.push(<strong key={key++}>{m[1].slice(2, -2)}</strong>);
    else if (m[2]) parts.push(<em key={key++}>{m[2].slice(1, -1)}</em>);
    i = m.index + m[0].length;
  }
  if (i < s.length) parts.push(s.slice(i));
  return <Fragment>{parts}</Fragment>;
}

export default function MarkdownView({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { buf.push(lines[i]); i++; }
      i++;
      blocks.push(<pre key={key++} className="rounded bg-zinc-100 p-3 text-sm overflow-x-auto"><code>{buf.join('\n')}</code></pre>);
      continue;
    }
    if (line.startsWith('### ')) { blocks.push(<h3 key={key++} className="text-base font-semibold mt-3">{renderInline(line.slice(4))}</h3>); i++; continue; }
    if (line.startsWith('## ')) { blocks.push(<h2 key={key++} className="text-lg font-semibold mt-4">{renderInline(line.slice(3))}</h2>); i++; continue; }
    if (line.startsWith('# ')) { blocks.push(<h1 key={key++} className="text-xl font-bold mt-4">{renderInline(line.slice(2))}</h1>); i++; continue; }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, '')); i++; }
      blocks.push(<ul key={key++} className="list-disc pl-5 my-2">{items.map((it, idx) => <li key={idx}>{renderInline(it)}</li>)}</ul>);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+\.\s+/, '')); i++; }
      blocks.push(<ol key={key++} className="list-decimal pl-5 my-2">{items.map((it, idx) => <li key={idx}>{renderInline(it)}</li>)}</ol>);
      continue;
    }
    if (line.trim() === '') { i++; continue; }
    // paragraph: gather until blank
    const buf: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('#') && !lines[i].startsWith('```') && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i])) {
      buf.push(lines[i]); i++;
    }
    blocks.push(<p key={key++} className="my-2">{renderInline(buf.join(' '))}</p>);
  }
  return <div className="prose prose-sm max-w-none">{blocks}</div>;
}
```

- [ ] **Step 2: Tests**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MarkdownView from '../components/MarkdownView';

describe('MarkdownView', () => {
  it('renders h1', () => {
    render(<MarkdownView source="# Hello" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hello');
  });
  it('renders bold and italic', () => {
    render(<MarkdownView source="This is **bold** and *italic*." />);
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByText('italic').tagName).toBe('EM');
  });
  it('renders bullet list', () => {
    render(<MarkdownView source="- one\n- two" />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
  it('renders code fence', () => {
    render(<MarkdownView source="```\nconst x = 1;\n```" />);
    expect(document.querySelector('pre code')?.textContent).toBe('const x = 1;');
  });
  it('escapes raw HTML (no innerHTML injection)', () => {
    render(<MarkdownView source="hello <script>alert(1)</script>" />);
    // text contains literal <script> as text, not as element
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
  });
});
```

Adjust the import path of `MarkdownView` to match wherever the test sits relative to `components/`. (Test file lives in `app/components/MarkdownView.test.tsx` so relative path is `./MarkdownView`.)

- [ ] **Step 3: Run tests**

```
cd extension && npx vitest run src/app/components/MarkdownView.test.tsx
```

Five green.

---

## Task 6: WriterRoute UI + tests

**Files:**
- Create: `extension/src/app/routes/WriterRoute.tsx`
- Create: `extension/src/app/routes/WriterRoute.test.tsx`
- Modify: `extension/src/app/routes/Writer.tsx`

- [ ] **Step 1: Component shape**

Layout (Tailwind):
- Two-column flex container, h-full.
- Left column `w-64 border-r overflow-y-auto`:
  - Button `"+ New thread"` at top.
  - List of threads (title, last-edited relative). Active thread highlighted.
  - Delete on hover for each row.
- Right column `flex-1 overflow-y-auto p-4 space-y-4`:
  - If no active thread: empty-state ("Pick a thread or start a new one").
  - Else:
    - Title input (editable).
    - Context picker card:
      - Persona toggle (disabled if no persona set; label "Use persona: <niche or 'none configured'>").
      - Databanks multi-select (chip list of all databanks; click to toggle).
      - File uploads input `<input type="file" accept=".txt,.md" multiple>` → reads via FileReader, capped 100KB each, 500KB total. List uploaded filenames with × to remove.
    - Topic `<textarea>` (large, autosize-ish via min-h).
    - Model selector dropdown (default = storage.getLLMModel(); user can override per-thread; selection persists on thread object as `lastModel`).
    - "Generate" button (disabled if topic empty or LLM key/provider not set; show inline hint linking to Settings).
    - Generation status row: shows "Generating…" while in-flight, or last error.
    - Drafts stack (newest first):
      - Each draft card: model label + relative time + Copy + Export(.md) buttons; `<MarkdownView source={draft.contentMd} />` below.

State:
- `threads: WriterThread[]` (live; refreshes on every mutation by re-reading storage).
- `activeId: string | null` — selected thread id.
- `topicDraft`, `titleDraft`, `contextDraft`, `modelDraft` — local edit state for active thread.
- Persist on debounce 800ms via `storage.upsertWriterThread`.

Generation flow:
1. Save current thread first.
2. Resolve databank bundles: for each databankId, fetch its `Databank`, walk `videoRefs`, resolve each `Video` (from feed/databank index) + `deep` (from `storage.getDeep`) + transcript (`storage.getTranscript`). Skip refs with missing data; warn if > 0 missing.
3. Call `generateScript({...})`.
4. `storage.appendWriterDraft(threadId, draft)`.
5. Refresh state.

Errors surface in the status row, not toast.

`Writer.tsx` body becomes:
```tsx
import WriterRoute from './WriterRoute';
export default function Writer() { return <WriterRoute />; }
```

- [ ] **Step 2: Implementation (full file body)**

Write the component in `WriterRoute.tsx`. Keep it under 400 lines. The dev should split into sub-components only if a clean seam exists (e.g. `ThreadList`, `ContextPicker`, `DraftCard`).

Lookup `Video` for a `DatabankVideoRef`: the existing `databankIndex` (from `storage.getDatabankIndex()`) only stores membership, not full `Video`. Phase 2's pattern is to read videos from in-memory feed; for Writer we may not have a current feed. **Fallback:** when full `Video` not available for a databank entry, use a minimal stub `{ platform, videoId, channelId: '', channelTitle: '', title: '(unknown title)', viewCount: 0, publishedAt: '', thumbnailUrl: '' }` plus whatever `deep` data IS cached. Builder handles missing `deep`/`transcript` gracefully (already wired in `writerPrompt.ts`).

If this proves too lossy in manual smoke, extend storage with `koko.video.<platform>.<videoId>` cache in a follow-up — out of scope for v1.

- [ ] **Step 3: Tests**

Test the route end-to-end with `@testing-library/react` + a faked storage layer (same pattern as `IdeasRoute.test.tsx`). Cover:

- Renders empty state when no threads.
- "New thread" button creates a thread and selects it.
- Typing in topic + clicking Generate calls `generateScript` mock and appends a draft.
- Regenerate creates a second draft, both visible.
- Delete thread removes from list.
- Persona toggle is disabled when persona is empty.
- File upload over 100KB shows error and is rejected.

Mock the `generateScript` import via `vi.mock('../../lib/llm/tasks', ...)`.

Minimum: 6 test cases.

- [ ] **Step 4: Run tests**

```
cd extension && npx vitest run src/app/routes/WriterRoute.test.tsx
```

Six green.

---

## Task 7: Wire-up + verification

**Files:**
- Modify: `extension/src/app/routes/Writer.tsx`

- [ ] **Step 1: Forward stub**

Replace `Writer.tsx` body:
```tsx
import WriterRoute from './WriterRoute';

export default function Writer() {
  return <WriterRoute />;
}
```

- [ ] **Step 2: Full verification**

```
cd extension
npm run compile
npx vitest run
npm run build 2>&1 | tail -3
```

Targets:
- `tsc` clean
- All vitest cases green (149 prior + 5 storage + 6 prompt + 5 markdown + 6 route = 171 total)
- Build clean

- [ ] **Step 3: Manual smoke (per `docs/testing-playbook.md`)**

1. Load extension into Firefox MV2 (`web-ext run --source-dir=.output/firefox-mv2`).
2. Open sidebar → Writer.
3. Create a new thread.
4. Toggle persona (with persona set in /persona first).
5. Pick 1 databank (with at least 1 video that has deep+transcript).
6. Upload a small `.md` file.
7. Type topic, pick model = Sonnet, click Generate.
8. Expect: draft card appears with HOOK/BODY/CTA sections rendered as markdown headings.
9. Click Regenerate → second draft appears above first.
10. Reload sidebar → thread + drafts persist.
11. Delete thread → row vanishes; survives reload.

Any failure: file under "Open Bugs" in `remote.md` and roll the iteration back.

- [ ] **Step 4: Commit**

```
git add extension/src/types.ts \
        extension/src/lib/storage.ts \
        extension/src/lib/__tests__/storage.writer.test.ts \
        extension/src/lib/writerPrompt.ts \
        extension/src/lib/__tests__/writerPrompt.test.ts \
        extension/src/lib/llm/types.ts \
        extension/src/lib/llm/index.ts \
        extension/src/lib/llm/tasks.ts \
        extension/src/lib/prompts.ts \
        extension/src/app/components/MarkdownView.tsx \
        extension/src/app/components/MarkdownView.test.tsx \
        extension/src/app/routes/WriterRoute.tsx \
        extension/src/app/routes/WriterRoute.test.tsx \
        extension/src/app/routes/Writer.tsx \
        docs/superpowers/plans/2026-05-11-phase-5-writer.md

git commit -m "feat(extension): Phase 5 Writer v1 — single-shot script gen + thread history

- /writer route: thread sidebar + context picker (persona/databanks/files/topic) + model selector
- Markdown-rendered drafts with Copy/Export/Regenerate; new drafts append as history rows
- Sandcastles XML prompt pattern (role/task/instructions/inputs) in lib/writerPrompt.ts
- generateScript LLM task with per-call modelOverride; default model from Settings
- koko.writerThreads storage with 50-thread LRU
- 22 new tests; tsc + build clean

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Out of scope (Phase 8 will tackle)

- Multi-step conversational flow (clarify → personalize → draft → iterate state machine).
- `<personalization_options>` injection + user pick.
- "Regenerate paragraph" affordance inside a draft.
- PDF / image uploads.
- IndexedDB migration if threads grow > 100 KB each (unlikely in v1).
- Per-task model tier registry (`pickModel(task)`) — defer until at least one more task wants a different default than Settings.

## Open follow-ups (file as TODOs only if hit in smoke)

- Caching full `Video` objects by `(platform, videoId)` so databank context can render channel + view counts in drafts without re-fetch. Currently builder stubs unknown fields.
- Cost estimator pre-flight (already half-built in `activity.ts`). Surface predicted cost before Generate fires.
