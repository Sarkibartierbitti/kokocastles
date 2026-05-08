# Phase 4 — Ideas Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Phase 1 `/ideas` ComingSoon stub with a real Ideas page. Inbox / Shortlist buckets, "Generate from feed/databank" action that calls a new `ideas` LLM task (Haiku tier), search + sort + export reuse, sandcastles-style empty state.

**Architecture:** New `Idea` type + `koko.ideas` storage. `lib/llm/tasks.ts` gets a `generateIdeas(deepEntries, persona)` function with a Zod-validated tool schema (8–12 ideas). `/ideas` route owns bucket toggle + search + sort. Generation pulls deep-cache + persona context.

**Tech Stack:** Same as Phases 1–3.

**Source spec:** `docs/superpowers/specs/2026-05-07-full-product-feasibility-and-design.md` §2.4.

**Prerequisites:** Phase 3a complete. Phase 3b not required.

---

## File Structure

**New files:**
- `extension/src/lib/__tests__/storage.ideas.test.ts`
- `extension/src/lib/__tests__/ideas-prompt.test.ts`
- `extension/src/app/routes/IdeasRoute.tsx`
- `extension/src/app/routes/IdeasRoute.test.tsx`

**Modified files:**
- `extension/src/types.ts` — add `Idea` interface
- `extension/src/lib/storage.ts` — add `ideas` accessors + bucket-move helper
- `extension/src/lib/prompts.ts` — add `ideasSchema` + system prompt + tool def
- `extension/src/lib/llm/tasks.ts` — add `generateIdeas(deepEntries, persona)` task function
- `extension/src/app/routes/Ideas.tsx` — replace stub with `<IdeasRoute />` (keep filename so route registration in App.tsx untouched, OR delete + create IdeasRoute.tsx and switch the import)

**Choice:** Keep filename `Ideas.tsx` and rewrite its body to forward to a new `IdeasRoute.tsx` to keep App.tsx import untouched. Reasoning: minimal route-table churn, and stub lives in a one-liner that's easy to swap.

---

## Task 1: Types + storage

**Files:**
- Modify: `extension/src/types.ts`
- Modify: `extension/src/lib/storage.ts`
- Create: `extension/src/lib/__tests__/storage.ideas.test.ts`

- [ ] **Step 1: Append types**

```typescript
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
```

- [ ] **Step 2: Test verbatim**

`extension/src/lib/__tests__/storage.ideas.test.ts`:
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
  vi.resetModules();
});

describe('storage — ideas', () => {
  it('default empty', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    expect(storage.getIdeas()).toEqual([]);
  });

  it('addIdeas appends + persists', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.addIdeas([
      { id: 'a', title: 'A', rationale: 'r', bucket: 'inbox', createdAt: '2026-01-01', sourceRefs: [], score: 0.8 },
    ]);
    const all = storage.getIdeas();
    expect(all).toHaveLength(1);
    expect(fakeStore['koko.ideas']).toBeTruthy();
  });

  it('moveIdeaBucket switches bucket', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.addIdeas([
      { id: 'a', title: 'A', rationale: 'r', bucket: 'inbox', createdAt: '', sourceRefs: [], score: 1 },
    ]);
    await storage.moveIdeaBucket('a', 'shortlist');
    expect(storage.getIdeas()[0].bucket).toBe('shortlist');
  });

  it('deleteIdea removes', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.addIdeas([
      { id: 'a', title: 'A', rationale: 'r', bucket: 'inbox', createdAt: '', sourceRefs: [], score: 1 },
    ]);
    await storage.deleteIdea('a');
    expect(storage.getIdeas()).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run — fails. Extend storage.ts:**

Add to `KEY` block:
```typescript
  ideas: 'koko.ideas',
```

Add `Idea` to the `~/types` import.

Append to storage object:
```typescript
  getIdeas: () => getCached<Idea[]>(KEY.ideas, []),

  addIdeas: async (newOnes: Idea[]) => {
    const list = [...storage.getIdeas(), ...newOnes];
    await writeThrough(KEY.ideas, list);
  },

  moveIdeaBucket: async (id: string, bucket: 'inbox' | 'shortlist') => {
    const list = storage.getIdeas().map((i) => (i.id === id ? { ...i, bucket } : i));
    await writeThrough(KEY.ideas, list);
  },

  deleteIdea: async (id: string) => {
    const list = storage.getIdeas().filter((i) => i.id !== id);
    await writeThrough(KEY.ideas, list);
  },
```

- [ ] **Step 4: Run vitest — 4/4 pass. Commit:**

```
feat(extension): Idea type + storage CRUD (add/move/delete)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Task 2: Ideas LLM prompt + schema

**Files:**
- Modify: `extension/src/lib/prompts.ts`
- Create: `extension/src/lib/__tests__/ideas-prompt.test.ts`

- [ ] **Step 1: Read existing prompts.ts**

It already exports `triageSchema`, `deepSchema`, etc. and `systemPrompts` + `taskTools` (verify by reading the file). Add to it:

```typescript
export const ideasSchema = z.object({
  ideas: z.array(
    z.object({
      title: z.string().min(3),
      rationale: z.string().min(5),
      score: z.number().min(0).max(1),
    })
  ).min(1).max(20),
});
```

Add to `systemPrompts` (object — find it in prompts.ts):
```typescript
ideas: `You are a creative strategist generating short-form video ideas inspired by a creator's analyzed videos and persona. Output 8 to 12 distinct ideas. Each idea has: title (catchy hook style, ≤80 chars), rationale (why it might work for this creator, 1–2 sentences), score (0..1 confidence). Do not repeat themes already saturated in the source set.`,
```

Add to `taskTools`:
```typescript
ideas: {
  name: 'record_ideas',
  description: 'Record the generated short-form video ideas',
  input_schema: {
    type: 'object',
    properties: {
      ideas: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            rationale: { type: 'string' },
            score: { type: 'number' },
          },
          required: ['title', 'rationale', 'score'],
        },
      },
    },
    required: ['ideas'],
  },
},
```

(If your tool registry has a different shape, match it — read the existing entries before editing.)

- [ ] **Step 2: Test the schema**

`extension/src/lib/__tests__/ideas-prompt.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { ideasSchema } from '../prompts';

describe('ideasSchema', () => {
  it('accepts 8–12 well-formed ideas', () => {
    const ideas = Array.from({ length: 10 }, (_, i) => ({
      title: `Idea ${i + 1}`,
      rationale: 'because reasons',
      score: 0.5,
    }));
    expect(() => ideasSchema.parse({ ideas })).not.toThrow();
  });

  it('rejects empty list', () => {
    expect(() => ideasSchema.parse({ ideas: [] })).toThrow();
  });

  it('rejects scores outside 0..1', () => {
    expect(() =>
      ideasSchema.parse({
        ideas: [{ title: 'X', rationale: 'why', score: 1.5 }],
      })
    ).toThrow();
  });
});
```

- [ ] **Step 3: Run — passes. Commit:**

```
feat(extension): ideas LLM schema + system prompt + tool definition

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Task 3: generateIdeas task function

**Files:**
- Modify: `extension/src/lib/llm/tasks.ts`

- [ ] **Step 1: Read existing tasks.ts to match patterns**

The file already exports `analyzeTriage`, `analyzeDeep`. Add a sibling:

```typescript
import type { Idea, IdeaSourceRef, Persona } from '../../types';
import { ideasSchema, systemPrompts, taskTools } from '../prompts';

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
```

If `LLMTask` type is a string-union that doesn't include `'ideas'` yet, add it to the union in `extension/src/lib/llm/types.ts`. Verify `pickModel('ideas')` falls into a sensible tier — add `ideas` to the Haiku tier in `pickModel` (file `extension/src/lib/llm/index.ts` or wherever `pickModel` lives). NEVER default to Opus.

- [ ] **Step 2: tsc clean. No new test (covered indirectly by IdeasRoute test)**

- [ ] **Step 3: Commit:**

```
feat(extension): generateIdeas LLM task on Haiku tier

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Task 4: IdeasRoute UI

**Files:**
- Create: `extension/src/app/routes/IdeasRoute.tsx`
- Create: `extension/src/app/routes/IdeasRoute.test.tsx`
- Modify: `extension/src/app/routes/Ideas.tsx` (forward to IdeasRoute)

- [ ] **Step 1: Test verbatim**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

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

// Stub the LLM call — return 2 fake ideas.
vi.mock('~/lib/llm/tasks', () => ({
  generateIdeas: vi.fn(async () => [
    { id: 'i1', title: 'Idea One', rationale: 'because', bucket: 'inbox', createdAt: '', sourceRefs: [], score: 0.9 },
    { id: 'i2', title: 'Idea Two', rationale: 'reasons', bucket: 'inbox', createdAt: '', sourceRefs: [], score: 0.7 },
  ]),
}));

beforeEach(() => {
  for (const k of Object.keys(fakeStore)) delete fakeStore[k];
  vi.resetModules();
});

async function renderRoute() {
  const { storage } = await import('~/lib/storage');
  await storage.hydrate();
  const IdeasRoute = (await import('./IdeasRoute')).default;
  return render(<MemoryRouter><IdeasRoute /></MemoryRouter>);
}

describe('IdeasRoute', () => {
  it('renders empty state when no ideas', async () => {
    await renderRoute();
    expect(await screen.findByText(/haven't saved any ideas yet/i)).toBeInTheDocument();
  });

  it('lists existing ideas in current bucket', async () => {
    fakeStore['koko.ideas'] = [
      { id: 'a', title: 'In Inbox', rationale: 'r', bucket: 'inbox', createdAt: '', sourceRefs: [], score: 1 },
      { id: 'b', title: 'In Shortlist', rationale: 'r', bucket: 'shortlist', createdAt: '', sourceRefs: [], score: 1 },
    ];
    await renderRoute();
    expect(await screen.findByText(/In Inbox/)).toBeInTheDocument();
    expect(screen.queryByText(/In Shortlist/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /shortlist/i }));
    expect(screen.getByText(/In Shortlist/)).toBeInTheDocument();
  });

  it('moves idea to shortlist via button', async () => {
    fakeStore['koko.ideas'] = [
      { id: 'a', title: 'Move me', rationale: 'r', bucket: 'inbox', createdAt: '', sourceRefs: [], score: 1 },
    ];
    await renderRoute();
    const btn = await screen.findByRole('button', { name: /shortlist move me/i });
    fireEvent.click(btn);
    await waitFor(() => {
      const stored = fakeStore['koko.ideas'] as Array<{ bucket: string }>;
      expect(stored[0].bucket).toBe('shortlist');
    });
  });
});
```

- [ ] **Step 2: Run — fails. Implement IdeasRoute.tsx:**

```typescript
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { storage } from '~/lib/storage';
import type { Idea } from '~/types';

type Bucket = 'inbox' | 'shortlist';

export default function IdeasRoute() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [bucket, setBucket] = useState<Bucket>('inbox');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function refresh() {
    setIdeas(storage.getIdeas());
  }

  useEffect(() => { refresh(); }, []);

  async function generate() {
    setBusy(true);
    setErr(null);
    try {
      const { generateIdeas } = await import('~/lib/llm/tasks');
      const deeps = storage.getAllDeepEntries();
      const persona = storage.getPersona();
      const fresh = await generateIdeas({ deepEntries: deeps, persona });
      await storage.addIdeas(fresh);
      refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function move(id: string, to: Bucket) {
    await storage.moveIdeaBucket(id, to);
    refresh();
  }

  async function remove(id: string) {
    await storage.deleteIdea(id);
    refresh();
  }

  const visible = ideas
    .filter((i) => i.bucket === bucket)
    .filter((i) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return i.title.toLowerCase().includes(q) || i.rationale.toLowerCase().includes(q);
    })
    .sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-4 max-w-3xl">
      <header>
        <h1 className="text-xl font-display font-semibold">Ideas</h1>
        <p className="text-sm text-slate-500">Review ideas generated from your analyzed videos.</p>
      </header>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div role="tablist" className="inline-flex rounded-full border border-sky-200 bg-white p-1">
          {(['inbox', 'shortlist'] as Bucket[]).map((b) => (
            <button
              key={b}
              role="tab"
              aria-selected={bucket === b}
              onClick={() => setBucket(b)}
              className={`px-3 py-1 rounded-full ${bucket === b ? 'bg-koko-pink-deep text-white' : 'text-slate-600 hover:bg-sky-50'}`}
            >
              {b}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="search ideas"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-sky-200 px-2 py-1 w-48"
          aria-label="search ideas"
        />
        <button onClick={generate} disabled={busy} className="koko-btn ml-auto">
          {busy ? 'generating…' : 'generate from feed'}
        </button>
      </div>

      {err ? <div className="text-sm text-rose-700">{err}</div> : null}

      {visible.length === 0 ? (
        <div className="koko-card p-8 max-w-xl mx-auto text-center text-sm text-slate-500 space-y-2">
          <p>You haven't saved any ideas yet! Pick videos from your feed to analyze.</p>
          <Link to="/" className="text-koko-pink-deep underline">Explore feed</Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((i) => (
            <li key={i.id} className="koko-card p-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{i.title}</div>
                <p className="text-xs text-slate-500 mt-0.5">{i.rationale}</p>
                <div className="text-[10px] text-slate-400 mt-1">score {i.score.toFixed(2)} · {i.sourceRefs.length} source{i.sourceRefs.length === 1 ? '' : 's'}</div>
              </div>
              <div className="flex flex-col gap-1 text-xs shrink-0">
                {bucket === 'inbox' ? (
                  <button onClick={() => move(i.id, 'shortlist')} className="text-koko-pink-deep" aria-label={`shortlist ${i.title}`}>
                    → shortlist
                  </button>
                ) : (
                  <button onClick={() => move(i.id, 'inbox')} className="text-slate-500" aria-label={`back to inbox ${i.title}`}>
                    → inbox
                  </button>
                )}
                <button onClick={() => remove(i.id)} className="text-rose-500" aria-label={`delete ${i.title}`}>
                  delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Replace stub** — `extension/src/app/routes/Ideas.tsx`:

```typescript
import IdeasRoute from './IdeasRoute';

export default function Ideas() {
  return <IdeasRoute />;
}
```

- [ ] **Step 4: Run — 3 cases pass. Verification gate:**

```
cd extension && npm run compile
cd extension && npm test
cd extension && npm run build 2>&1 | tail -3
```

- [ ] **Step 5: Commit:**

```
feat(extension): IdeasRoute — Inbox/Shortlist + generate-from-feed + search/sort

Replaces the Phase 1 stub. Inbox/Shortlist tab toggle, sort by score
desc, search over title+rationale, "generate from feed" pulls from
deep cache + persona and calls the new LLM task on Haiku tier.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Task 5: Push + iteration log

```
| 2026-05-08 <HHMM>Z | local | <sha> | Phase 4 — Ideas page (Inbox/Shortlist + LLM gen + search/sort) shipped |
```

Commit + `git push origin feat/full-product-spec`.

---

## Self-Review

- §2.4 Inbox/Shortlist buckets → Task 4 tab toggle + bucket field.
- §2.4 Search → Task 4 search input over title+rationale.
- §2.4 Sort → fixed sort by score desc; user-configurable sort deferred to a polish pass.
- §2.4 Export → **deferred** (re-uses Phase 3b export pipeline once that lands).
- §2.4 LLM task → Task 2 + 3, Haiku tier.
- §2.4 Empty state matches sandcastles ref → Task 4.

Plan ready.
