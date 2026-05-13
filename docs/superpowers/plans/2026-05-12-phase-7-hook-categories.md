# Phase 7 — Hook Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the existing Hooks sub-page, each hook card grows a small **category bubble** (e.g. "Curiosity Gap", "Pattern Interrupt"). Categories are assigned by an LLM call on the Haiku tier, restricted to a fixed short-form taxonomy. The call runs **lazily and in batches** the moment the Hooks sub-page mounts, so the user sees bubbles fill in within a few seconds without clicking anything. Each result is cached per `(platform, videoId)`; no re-call after the first hit.

**Architecture:**
- `lib/hookCategories.ts` — single source of truth for the closed enum. ~15 categories. Exported as `HOOK_CATEGORIES: readonly string[]` and `HookCategory = (typeof HOOK_CATEGORIES)[number]`.
- New LLM task `categorizeHook` added to `LLMTask` union. Single batched call per Hooks sub-page mount over all uncategorized hooks (cap 30 per call to keep payload small; if more, run multiple calls).
- Tool schema accepts an array of `{ videoId, spoken, onScreen, visualFormat }` and returns `{ assignments: { videoId, category }[] }`. The Zod schema validates `category` against the enum; out-of-enum results fall back to `"Uncategorized"`.
- New storage prefix `koko.hookCategory.` + accessors. Set on each LLM response; surfaced to `aggregateHooks` so `HookEntry` carries a `category` field that the card renders.
- `HookCard` adds a small pill above the type row.
- `HooksSubPage` orchestrates: derive uncategorized hooks → batch → call → save → trigger re-aggregate.

**Tech Stack:** Same as Phases 1–6.

**Source spec:** `docs/superpowers/specs/2026-05-07-full-product-feasibility-and-design.md` §3.4 and §4 Phase 7.

**Prerequisites:** Phases 1–6 complete. Deep analyses must already exist for the categorization to have anything to chew on (Phase 3a/3b ships the deep cache, Phase C scrapes it).

---

## File Structure

**New files:**
- `extension/src/lib/hookCategories.ts`
- `extension/src/lib/__tests__/hookCategories.test.ts`
- `extension/src/lib/__tests__/storage.hookCategory.test.ts`
- `extension/src/lib/__tests__/categorizeHook.test.ts` — pure prompt/parse helper if extracted

**Modified files:**
- `extension/src/types.ts` — re-export `HookCategory` if convenient (optional)
- `extension/src/lib/storage.ts` — `koko.hookCategory.<platform>.<videoId>` accessors + bulk getter
- `extension/src/lib/llm/types.ts` — add `'categorizeHook'` to `LLMTask`
- `extension/src/lib/prompts.ts` — add `categorizeHookSchema` + `taskTools.categorizeHook` + `systemPrompts.categorizeHook`
- `extension/src/lib/llm/tasks.ts` — add `categorizeHooks(items: HookCategorizationInput[])`
- `extension/src/lib/aggregators.ts` — extend `HookEntry` with `category?: HookCategory`, plumb cached value through `aggregateHooks`
- `extension/src/app/components/HookCard.tsx` — render category pill
- `extension/src/app/routes/HooksSubPage.tsx` — orchestrate batched LLM call on mount + re-aggregate on completion

---

## Task 1: Static enum

**Files:**
- Create: `extension/src/lib/hookCategories.ts`
- Create: `extension/src/lib/__tests__/hookCategories.test.ts`

- [ ] **Step 1: Enum**

```typescript
// Closed set of short-form video hook categories. Names are descriptive labels — no
// proprietary content. LLM is asked to pick the closest match; out-of-enum responses
// fall back to "Uncategorized".
export const HOOK_CATEGORIES = [
  'Personal Experience',
  'Curiosity Gap',
  'Shock Visual',
  'Pattern Interrupt',
  'Listicle',
  'Question',
  'Bold Claim',
  'Pain Point',
  'Transformation',
  'Contrarian Take',
  'Authority',
  'Social Proof',
  'Direct Address',
  'Storytime',
  'Tutorial',
] as const;

export type HookCategory = (typeof HOOK_CATEGORIES)[number] | 'Uncategorized';

export function isHookCategory(s: string): s is HookCategory {
  return s === 'Uncategorized' || (HOOK_CATEGORIES as readonly string[]).includes(s);
}

export function normalizeHookCategory(s: string): HookCategory {
  return isHookCategory(s) ? s : 'Uncategorized';
}
```

- [ ] **Step 2: Tests**

Cover: `isHookCategory` recognizes each enum + 'Uncategorized', rejects junk; `normalizeHookCategory` maps unknown to 'Uncategorized'. ~3 cases.

- [ ] **Step 3: Run** — `npx vitest run src/lib/__tests__/hookCategories.test.ts`

---

## Task 2: Storage accessors + tests

**Files:**
- Modify: `extension/src/lib/storage.ts`
- Create: `extension/src/lib/__tests__/storage.hookCategory.test.ts`

- [ ] **Step 1: Keys + accessors**

Add to `KEY`:
```
hookCategoryPrefix: 'koko.hookCategory.',
```

Helper:
```typescript
function hookCategoryKey(p: PlatformId, id: string) { return `${KEY.hookCategoryPrefix}${p}.${id}`; }
```

Append to `storage`:
```typescript
getHookCategory: (platform: PlatformId, videoId: string): HookCategory | null => {
  const v = getCached<string | undefined>(hookCategoryKey(platform, videoId), undefined);
  if (!v) return null;
  return normalizeHookCategory(v);
},

setHookCategory: (platform: PlatformId, videoId: string, category: HookCategory) =>
  writeThrough(hookCategoryKey(platform, videoId), category),

getAllHookCategories: (): Map<string, HookCategory> => {
  const out = new Map<string, HookCategory>();
  for (const [k, v] of cache.entries()) {
    if (!k.startsWith(KEY.hookCategoryPrefix)) continue;
    const rest = k.slice(KEY.hookCategoryPrefix.length);
    const dot = rest.indexOf('.');
    if (dot < 0) continue;
    const platform = rest.slice(0, dot);
    const videoId = rest.slice(dot + 1);
    out.set(`${platform}::${videoId}`, normalizeHookCategory(String(v)));
  }
  return out;
},
```

Add imports: `HookCategory, normalizeHookCategory` from `./hookCategories`.

> **Note:** `cache` is the module-internal Map; verify the existing iteration pattern (`getAllHiddenKeys`, `getAllDeepEntries`) matches the conventions before copying.

- [ ] **Step 2: Tests**

Cover: round-trip, missing returns null, junk normalized to 'Uncategorized', getAllHookCategories returns map of all entries. ~4 cases.

- [ ] **Step 3: Run** — `npx vitest run src/lib/__tests__/storage.hookCategory.test.ts`

---

## Task 3: LLM task + tests

**Files:**
- Modify: `extension/src/lib/llm/types.ts`
- Modify: `extension/src/lib/prompts.ts`
- Modify: `extension/src/lib/llm/tasks.ts`
- Create: `extension/src/lib/__tests__/categorizeHook.test.ts`

- [ ] **Step 1: Type union**

```typescript
export type LLMTask = 'triage' | 'deep' | 'outlierWhy' | 'synthesis' | 'ideas' | 'writer' | 'categorizeHook';
```

- [ ] **Step 2: Prompt + schema + tool**

In `prompts.ts`:

```typescript
import { HOOK_CATEGORIES } from './hookCategories';

export const categorizeHookSchema = z.object({
  assignments: z.array(
    z.object({
      videoId: z.string(),
      category: z.string(), // post-validate via normalizeHookCategory
    })
  ).min(0),
});
```

In `taskTools`:
```typescript
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
```

In `systemPrompts`:
```typescript
categorizeHook:
  `You classify short-form video hooks into a fixed set of categories. Choose exactly one category per hook from this list: ${HOOK_CATEGORIES.join(', ')}. If no category fits, return 'Uncategorized'. Reply only via the record_hook_categories tool. No prose.`,
```

- [ ] **Step 3: Task function**

In `llm/tasks.ts`:

```typescript
import { categorizeHookSchema } from '../prompts';
import { HOOK_CATEGORIES, normalizeHookCategory, type HookCategory } from '../hookCategories';

export interface HookCategorizationInput {
  videoId: string;
  spoken: string;
  onScreen: string;
  visualFormat: string;
}

const BATCH_SIZE = 30;

export async function categorizeHooks(
  items: HookCategorizationInput[]
): Promise<Array<{ videoId: string; category: HookCategory }>> {
  if (items.length === 0) return [];
  const results: Array<{ videoId: string; category: HookCategory }> = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const body = batch
      .map((b, idx) =>
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
```

> **Note:** `categorizeHook` is a Haiku-tier task. Current LLM routing uses the Settings-selected model with no per-task tier; live up to spec by leaving the existing routing untouched — user picks the model in Settings. If user wants per-task model floors later, do it in a separate phase. Phase 5 added `modelOverride`; we deliberately do **not** use it here so users on a Sonnet-default global can still pay Haiku-equivalent costs by switching down for this run if they choose.

- [ ] **Step 4: Tests**

Use the `vi.mock('../llm/index', ...)` pattern from existing tests (e.g. `ideas`) — stub `callLLM` to return canned `assignments`. Cover:
- Empty input → empty output, no LLM call.
- 5 inputs → 1 call, 5 results.
- 35 inputs → 2 calls (sizes 30 + 5).
- Out-of-enum category from LLM → normalized to 'Uncategorized'.

~4 cases.

- [ ] **Step 5: Run** — `npx vitest run src/lib/__tests__/categorizeHook.test.ts`

---

## Task 4: Aggregator + HookCard wiring

**Files:**
- Modify: `extension/src/lib/aggregators.ts`
- Modify: `extension/src/app/components/HookCard.tsx`

- [ ] **Step 1: Extend `HookEntry`**

```typescript
export interface HookEntry {
  platform: PlatformId;
  videoId: string;
  hookType: string;
  spoken: string;
  onScreen: string;
  visualFormat: string;
  audioHook: string;
  category?: HookCategory; // populated when cache hit exists
}
```

In `aggregateHooks(deeps, transcripts, categories?: Map<string, HookCategory>)`:
- New optional parameter for the cache map (string key `platform::videoId`).
- Inject `category` if present.

Callers update: `HooksSubPage.tsx` passes `storage.getAllHookCategories()`.

- [ ] **Step 2: Pill in HookCard**

Before the `type` row, render:
```tsx
{entry.category && (
  <span className="inline-block rounded-full bg-koko-sky-deep px-2 py-0.5 text-[10px] font-medium text-white">
    {entry.category}
  </span>
)}
```

If no `koko-sky-deep` palette token exists, fall back to `bg-koko-sky text-slate-900` (matches existing chip style on `WriterRoute`).

- [ ] **Step 3: tsc clean**

---

## Task 5: Hooks sub-page orchestration + tests

**Files:**
- Modify: `extension/src/app/routes/HooksSubPage.tsx`
- Modify (or extend if test exists): `extension/src/app/routes/HooksSubPage.test.tsx`

- [ ] **Step 1: Auto-categorize on mount**

```tsx
import { useEffect, useMemo, useState } from 'react';
// ...

export default function HooksSubPage() {
  const [categories, setCategories] = useState<Map<string, HookCategory>>(new Map());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const hooks = useMemo(() => {
    const deeps = storage.getAllDeepEntries();
    const transcripts = storage.getAllTranscriptEntries();
    return aggregateHooks(deeps, transcripts, categories);
  }, [categories]);

  useEffect(() => {
    setCategories(storage.getAllHookCategories());
  }, []);

  useEffect(() => {
    const uncategorized = hooks.filter((h) => !h.category);
    if (uncategorized.length === 0 || busy) return;
    setBusy(true);
    (async () => {
      try {
        const { categorizeHooks } = await import('~/lib/llm/tasks');
        const out = await categorizeHooks(uncategorized.map((h) => ({
          videoId: h.videoId,
          spoken: h.spoken,
          onScreen: h.onScreen,
          visualFormat: h.visualFormat,
        })));
        for (const a of out) {
          // pair with the platform from the original hook (multi-platform safe)
          const match = uncategorized.find((h) => h.videoId === a.videoId);
          if (!match) continue;
          await storage.setHookCategory(match.platform, match.videoId, a.category);
        }
        setCategories(storage.getAllHookCategories());
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    })();
    // Run only when the set of uncategorized hooks changes — keyed on length.
  }, [hooks.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ... existing render, plus inline status row when busy or err.
}
```

- [ ] **Step 2: Tests**

If `HooksSubPage.test.tsx` exists, extend it; otherwise create. Mock `categorizeHooks` via `vi.mock('~/lib/llm/tasks', ...)`. Cover:
- Renders hooks from `getAllDeepEntries` with cached categories.
- On mount with no cache, calls `categorizeHooks` once and persists results to storage.
- On second mount with full cache, does NOT call `categorizeHooks` again.

~3 cases.

- [ ] **Step 3: Run** — `npx vitest run src/app/routes/HooksSubPage.test.tsx`

---

## Task 6: Full verify + commit

- [ ] **Step 1**

```
cd extension
npm run compile
npx vitest run
npm run build 2>&1 | tail -3
```

Targets:
- tsc clean
- ~215 tests green (201 prior + 3 enum + 4 storage + 4 task + 3 route = 215)
- Build clean

- [ ] **Step 2: Manual smoke** (per `docs/testing-playbook.md`)

1. Have at least 5 videos with `koko.deep.*` cached.
2. Open Hooks sub-page.
3. Expect bubbles to populate within ~3–5 seconds (single Haiku call).
4. Reload sub-page — bubbles appear instantly, no second LLM call (verify in activity panel).
5. Open DevTools storage; confirm `koko.hookCategory.youtube.<id>` keys exist.

- [ ] **Step 3: Commit**

```
git add extension/src/lib/hookCategories.ts \
        extension/src/lib/__tests__/hookCategories.test.ts \
        extension/src/lib/storage.ts \
        extension/src/lib/__tests__/storage.hookCategory.test.ts \
        extension/src/lib/llm/types.ts \
        extension/src/lib/prompts.ts \
        extension/src/lib/llm/tasks.ts \
        extension/src/lib/__tests__/categorizeHook.test.ts \
        extension/src/lib/aggregators.ts \
        extension/src/app/components/HookCard.tsx \
        extension/src/app/routes/HooksSubPage.tsx \
        extension/src/app/routes/HooksSubPage.test.tsx \
        docs/superpowers/plans/2026-05-12-phase-7-hook-categories.md

git commit -m "feat(extension): Phase 7 hook categories — auto pill per hook card

- Static HOOK_CATEGORIES enum (15 short-form taxonomies) + normalizeHookCategory()
- categorizeHook LLM task (batched 30/call; out-of-enum normalized)
- koko.hookCategory.<platform>.<videoId> cache + getAllHookCategories()
- HookEntry gains optional category; HookCard renders pill above type
- HooksSubPage auto-categorizes uncategorized hooks on mount
- 14 new tests; tsc + build clean

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Out of scope

- 'Best for' tags (spec §3.4 marked optional). Defer to follow-up.
- Live scrape of sandcastles default-hooks page. Static enum suffices.
- Per-task model tier registry (`pickModel('categorizeHook') → Haiku`). User-controlled via Settings in v1.
- Bubble color per category (visual-design polish).
- Filter hooks by category.

## Open follow-ups (file as TODOs only if hit in smoke)

- Token-budget guard: cap input hooks per session to N before warning the user about cost.
- "Re-categorize" affordance per card if a user disagrees with the assignment.
