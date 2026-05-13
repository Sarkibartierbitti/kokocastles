# Phase 8 — Writer Multi-Step Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Layer a multi-step conversational flow on top of Phase 5's single-shot Writer. Steps: **clarify → personalize → draft → iterate**. The clarify step asks the LLM for 3–5 follow-up questions and lets the user answer in line. The personalize step asks for 3–4 "twists" the user can pick from (or skip). The draft step is the same `generateScript` call from Phase 5, now enriched with the answers + chosen twist. The iterate step lets the user request a regenerate of a single paragraph (split on blank lines) instead of the whole draft.

Existing single-shot users are unaffected: a new per-thread `mode: 'single' | 'multi'` toggle defaults to `'single'`, preserving the Phase 5 UX. When the user flips to `'multi'`, the stepper renders.

**Architecture:**
- Extend `WriterThread` with optional multi-step state (`mode`, `step`, `clarifyQuestions`, `clarifyAnswers`, `personalizationOptions`, `pickedOption`). All new fields are optional → old threads continue to work without migration.
- Three new LLM tasks: `writerClarify`, `writerPersonalize`, `writerRegen` (paragraph-level regen). Each gets a Zod schema + tool def + system prompt + entry on `LLMTask` union.
- One new pure helper `splitDraftParagraphs(md: string): string[]` (split on `\n\n+`).
- `WriterRoute` grows a stepper section. Each step's UI is gated by `active.step`. "Start guided flow" button enters `mode='multi'`; "Back to single-shot" reverts to `mode='single'`.

**Tech Stack:** Same as Phases 1–7.

**Source spec:** `docs/superpowers/specs/2026-05-07-full-product-feasibility-and-design.md` §2.6 + §4 Phase 8 + `docs/sandcastles-reference.md` §AI-Prompts (XML pattern with `<personalization_options>`).

**Prerequisites:** Phase 5 (Writer single-shot) shipped.

---

## File Structure

**New files:**
- `extension/src/lib/writerSteps.ts` — pure helpers: `splitDraftParagraphs`, `mergeParagraphs(orig, idx, replacement)`
- `extension/src/lib/__tests__/writerSteps.test.ts`
- `extension/src/lib/__tests__/writerMultiStep.test.ts` — task wrappers

**Modified files:**
- `extension/src/types.ts` — extend `WriterThread`
- `extension/src/lib/storage.ts` — no shape changes; existing helpers still apply
- `extension/src/lib/llm/types.ts` — add `'writerClarify' | 'writerPersonalize' | 'writerRegen'`
- `extension/src/lib/prompts.ts` — three new schemas + tools + system prompts
- `extension/src/lib/llm/tasks.ts` — `writerClarify()`, `writerPersonalize()`, `writerRegenParagraph()`
- `extension/src/app/routes/WriterRoute.tsx` — mode toggle + stepper + per-step UI
- `extension/src/app/routes/WriterRoute.test.tsx` — extend tests

---

## Task 1: Types

Extend `WriterThread`:

```typescript
export interface WriterThread {
  id: string;
  title: string;
  topic: string;
  context: WriterContextRef;
  drafts: WriterDraft[];
  createdAt: string;
  updatedAt: string;
  // Phase 8 — all optional, default to 'single' / 'idle'
  mode?: 'single' | 'multi';
  step?: 'idle' | 'clarify' | 'personalize' | 'draft' | 'iterate';
  clarifyQuestions?: string[];
  clarifyAnswers?: Record<string, string>;     // keyed by question
  personalizationOptions?: string[];
  pickedOption?: string;
}
```

- [ ] tsc clean.

---

## Task 2: Pure paragraph helpers + tests

`extension/src/lib/writerSteps.ts`:

```typescript
export function splitDraftParagraphs(md: string): string[] {
  return md.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 0);
}

export function mergeParagraphs(paragraphs: string[], index: number, replacement: string): string[] {
  if (index < 0 || index >= paragraphs.length) return paragraphs;
  const out = [...paragraphs];
  out[index] = replacement.trim();
  return out;
}
```

Tests: empty input, single paragraph, multiple separated by `\n\n` and `\n\n\n`, merge replaces target, merge clamped at bounds. ~5 cases.

- [ ] Run tests.

---

## Task 3: LLM types + schemas + prompts

`extension/src/lib/llm/types.ts`:
```typescript
export type LLMTask = 'triage' | 'deep' | 'outlierWhy' | 'synthesis' | 'ideas' | 'writer' | 'categorizeHook' | 'writerClarify' | 'writerPersonalize' | 'writerRegen';
```

`prompts.ts` — schemas:
```typescript
export const writerClarifySchema = z.object({
  questions: z.array(z.string().min(3)).min(1).max(8),
});

export const writerPersonalizeSchema = z.object({
  options: z.array(z.string().min(3)).min(1).max(6),
});

export const writerRegenSchema = z.object({
  paragraph: z.string().min(10),
});
```

`taskTools`:
```typescript
writerClarify: {
  name: 'record_clarifying_questions',
  description: 'Record short follow-up questions to refine the user’s topic.',
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
  description: 'Record distinct angle / twist options the user can pick from.',
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
```

`systemPrompts`:
- `writerClarify`: "Ask 3–5 short follow-up questions to clarify scope, audience, tone. Each ≤120 chars. No multi-part questions. Reply via record_clarifying_questions."
- `writerPersonalize`: "Given the topic + clarifying answers, propose 3–4 distinct angles (twists) the script could take. Each option = 1 sentence ≤140 chars. Reply via record_personalization_options."
- `writerRegen`: "Rewrite a single paragraph of an existing script. Preserve the markdown shape (headings/lists). Match the rest of the draft’s voice. Return only the new paragraph via record_paragraph_rewrite — no preamble, no surrounding paragraphs."

---

## Task 4: Task wrappers + tests

`extension/src/lib/llm/tasks.ts`:

```typescript
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
    .map(([q, a]) => `Q: ${q}\nA: ${a}`)
    .join('\n\n');
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
  modelOverride?: string;
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
```

Tests `writerMultiStep.test.ts`: mock callLLM, assert each wrapper builds correct system + body and returns parsed payload. ~3 cases per wrapper.

---

## Task 5: WriterRoute UI

Add mode toggle button under title input. When `mode === 'multi'`, render a stepper:

```
[1 Clarify] → [2 Personalize] → [3 Draft] → [4 Iterate]
```

Each step's content:

**Clarify:**
- "Generate questions" button → `writerClarify(args)` → `clarifyQuestions` saved.
- Render textareas for each question; bind to `clarifyAnswers[question]`.
- "Next: personalize" advances.

**Personalize:**
- "Suggest twists" → `writerPersonalize(...)` → `personalizationOptions` saved.
- Radio list to pick one. "Skip" allowed.
- "Next: draft" advances.

**Draft:**
- "Generate" → `generateScript(args)` (Phase 5 path) BUT now `topic` is augmented internally: include `clarifyAnswers` block + `pickedOption` in the prompt. **Quickest implementation:** prepend a synthetic block to `args.topic` so we don't need to thread new fields through `buildWriterPrompt`:

```typescript
const augTopic = [
  args.topic,
  pickedOption ? `Angle: ${pickedOption}` : '',
  Object.entries(clarifyAnswers || {})
    .filter(([, a]) => a.trim())
    .map(([q, a]) => `Q: ${q}\nA: ${a}`)
    .join('\n'),
].filter(Boolean).join('\n\n');
```

- On success, advance to `iterate`.

**Iterate:**
- Show the latest draft split via `splitDraftParagraphs`. Each paragraph has a "Regenerate" button.
- Click → optional hint textarea → `writerRegenParagraph(...)` → `mergeParagraphs` → save new `WriterDraft` with the patched markdown (appendDraft, not mutate).
- "Back to draft step" allowed.

Add at least 2 more tests for: mode toggle entering multi flow + clarify questions appear; paragraph regenerate replaces the chosen paragraph and persists.

---

## Task 6: Verify + commit

Targets:
- tsc clean.
- 214 + ~10 new tests = ~224 green.
- Build clean.

Commit:
```
feat(extension): Phase 8 Writer multi-step flow

- WriterThread gains optional mode/step/clarify/personalize state
- writerClarify, writerPersonalize, writerRegen LLM tasks
- WriterRoute: mode toggle + stepper UI + paragraph regenerate
- writerSteps.ts: splitDraftParagraphs + mergeParagraphs pure helpers
- Old single-shot threads unaffected (mode defaults to 'single')
- 10 new tests; tsc + build clean
```

## Out of scope (later)
- Re-running clarify after iteration — single pass per thread.
- Multiple personalization picks (currently single).
- Diff view between draft versions.
