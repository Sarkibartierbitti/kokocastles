# Phase 3a — Hooks + Scripts Aggregator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Phase 1 ComingSoon stubs in `/analyze` Hooks + Scripts tabs with real aggregator sub-pages that surface hooks and full transcripts pulled from already-analyzed videos. Adds a transcript cache so we don't re-fetch.

**Scope split:** This plan covers only the Hooks + Scripts aggregators (the highest-value, lowest-risk slice of spec §2.1.2 / §2.1.3). The Videos sub-page power features (filter/sort/select-mode/Top-X/Bottom-X/extended export with field ticks) are deferred to **Phase 3b** in a follow-up plan — they touch CrossChannel and would balloon this commit.

**Architecture:** Two new pure aggregator helpers iterate `koko.deep.*` and `koko.transcript.*` entries from the storage cache and return typed lists. Two list-style components render them. Both new sub-pages mount inside the existing `Analyze.tsx` toggle, replacing the stubs.

**Tech Stack:** Same as Phases 1–2 — Vite + React + TS + Tailwind + WXT. Vitest. No new deps.

**Source spec:** `docs/superpowers/specs/2026-05-07-full-product-feasibility-and-design.md` §2.1.2, §2.1.3, §3.4 (categories punted to Phase 7).

**Prerequisites:** Phases 1 + 2 complete on `feat/full-product-spec` (HEAD `fce7749` or later).

**Hard constraints (verify each task):**
- `cd extension && npm run compile` clean.
- `cd extension && npm test` all green.
- `cd extension && npm run build 2>&1 | tail -3` clean.
- Multi-platform discipline: aggregators must be platform-agnostic (key shape `<platform>.<videoId>`).
- Theme palette: koko-sky / koko-pink only.

---

## File Structure

**New files:**
- `extension/src/lib/aggregators.ts` — pure functions: `aggregateHooks`, `aggregateScripts`
- `extension/src/lib/__tests__/aggregators.test.ts`
- `extension/src/lib/__tests__/storage.transcript.test.ts`
- `extension/src/app/components/HookCard.tsx`
- `extension/src/app/components/ScriptCard.tsx`
- `extension/src/app/routes/HooksSubPage.tsx`
- `extension/src/app/routes/HooksSubPage.test.tsx`
- `extension/src/app/routes/ScriptsSubPage.tsx`
- `extension/src/app/routes/ScriptsSubPage.test.tsx`

**Modified files:**
- `extension/src/lib/storage.ts` — add `koko.transcript.<platform>.<videoId>` cache, `getTranscript` / `setTranscript`, plus a snapshot helper `getAllDeepEntries()` / `getAllTranscriptEntries()` for aggregators
- `extension/src/app/routes/Analyze.tsx` — swap ComingSoon → HooksSubPage / ScriptsSubPage

---

## Task 1: Storage transcript cache

**Files:**
- Modify: `extension/src/lib/storage.ts`
- Create: `extension/src/lib/__tests__/storage.transcript.test.ts`

- [ ] **Step 1: Write failing test**

Create `extension/src/lib/__tests__/storage.transcript.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

const fakeStore: Record<string, unknown> = {};
const mockBrowser = {
  storage: {
    local: {
      get: vi.fn(async (keys?: string | string[] | null) => {
        if (keys == null) return { ...fakeStore };
        const arr = typeof keys === 'string' ? [keys] : keys;
        const out: Record<string, unknown> = {};
        for (const k of arr) if (k in fakeStore) out[k] = fakeStore[k];
        return out;
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(fakeStore, items);
      }),
      remove: vi.fn(async () => {}),
    },
  },
};
(globalThis as Record<string, unknown>).browser = mockBrowser;

beforeEach(() => {
  for (const k of Object.keys(fakeStore)) delete fakeStore[k];
  vi.clearAllMocks();
  vi.resetModules();
});

describe('storage — transcript cache', () => {
  it('returns null when no transcript stored', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    const t = await storage.getTranscript('youtube', 'v1');
    expect(t).toBeNull();
  });

  it('round-trips transcript', async () => {
    const segs = [{ start: 0, dur: 1.5, text: 'hello' }];
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.setTranscript('youtube', 'v1', segs);
    const t = await storage.getTranscript('youtube', 'v1');
    expect(t).toEqual(segs);
    expect(fakeStore['koko.transcript.youtube.v1']).toEqual(segs);
  });

  it('snapshot helpers expose deep + transcript entries', async () => {
    fakeStore['koko.deep.youtube.a'] = { hook: { type: 'visual' } };
    fakeStore['koko.deep.youtube.b'] = { hook: { type: 'verbal' } };
    fakeStore['koko.transcript.youtube.a'] = [{ start: 0, dur: 1, text: 'hi' }];
    const { storage } = await import('../storage');
    await storage.hydrate();
    const deeps = storage.getAllDeepEntries();
    const transcripts = storage.getAllTranscriptEntries();
    expect(deeps).toHaveLength(2);
    expect(deeps[0].platform).toBe('youtube');
    expect(transcripts).toHaveLength(1);
    expect(transcripts[0].videoId).toBe('a');
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `cd extension && npx vitest run src/lib/__tests__/storage.transcript.test.ts`
Expected: FAIL — `storage.getTranscript is not a function`.

- [ ] **Step 3: Extend `storage.ts`**

In the `KEY` const block, append:

```typescript
  transcriptPrefix: 'koko.transcript.',
```

In the `~/types` import line, ensure `TranscriptSegment` is imported (it already is via existing imports — verify).

Define near the existing `triageKey` / `deepKey` helpers:

```typescript
function transcriptKey(p: PlatformId, id: string) { return `${KEY.transcriptPrefix}${p}.${id}`; }
```

Append to the `storage` object (before the closing brace):

```typescript
  getTranscript: async (platform: PlatformId, videoId: string): Promise<TranscriptSegment[] | null> => {
    const k = transcriptKey(platform, videoId);
    if (cache.has(k)) return (cache.get(k) ?? null) as TranscriptSegment[] | null;
    const r = await browser.storage.local.get(k);
    const v = (r[k] ?? null) as TranscriptSegment[] | null;
    cache.set(k, v);
    return v;
  },
  setTranscript: (platform: PlatformId, videoId: string, segs: TranscriptSegment[]) =>
    writeThrough(transcriptKey(platform, videoId), segs),

  getAllDeepEntries: (): Array<{ platform: PlatformId; videoId: string; deep: DeepAnalysis }> => {
    const out: Array<{ platform: PlatformId; videoId: string; deep: DeepAnalysis }> = [];
    for (const [k, v] of cache.entries()) {
      if (!k.startsWith(KEY.deepPrefix)) continue;
      const rest = k.slice(KEY.deepPrefix.length);
      const dot = rest.indexOf('.');
      if (dot < 0) continue;
      const platform = rest.slice(0, dot) as PlatformId;
      const videoId = rest.slice(dot + 1);
      if (v) out.push({ platform, videoId, deep: v as DeepAnalysis });
    }
    return out;
  },

  getAllTranscriptEntries: (): Array<{ platform: PlatformId; videoId: string; segments: TranscriptSegment[] }> => {
    const out: Array<{ platform: PlatformId; videoId: string; segments: TranscriptSegment[] }> = [];
    for (const [k, v] of cache.entries()) {
      if (!k.startsWith(KEY.transcriptPrefix)) continue;
      const rest = k.slice(KEY.transcriptPrefix.length);
      const dot = rest.indexOf('.');
      if (dot < 0) continue;
      const platform = rest.slice(0, dot) as PlatformId;
      const videoId = rest.slice(dot + 1);
      if (v) out.push({ platform, videoId, segments: v as TranscriptSegment[] });
    }
    return out;
  },
```

- [ ] **Step 4: Run tests — pass**

Run: `cd extension && npx vitest run src/lib/__tests__/storage.transcript.test.ts`
Expected: PASS — 3 cases.

- [ ] **Step 5: Verification gate**

Run:
```
cd extension && npm run compile
cd extension && npm test
```
Expected: tsc clean, all tests green (no regressions).

- [ ] **Step 6: Commit**

```bash
git add extension/src/lib/storage.ts extension/src/lib/__tests__/storage.transcript.test.ts
git commit -m "feat(extension): storage transcript cache + snapshot helpers

Adds koko.transcript.<platform>.<videoId> read/write and two snapshot
helpers (getAllDeepEntries / getAllTranscriptEntries) for the Hooks
and Scripts aggregators. The snapshot helpers iterate the in-memory
cache, so they assume hydrate() has run.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Pure aggregator helpers

**Files:**
- Create: `extension/src/lib/aggregators.ts`
- Create: `extension/src/lib/__tests__/aggregators.test.ts`

- [ ] **Step 1: Write failing test**

Create `extension/src/lib/__tests__/aggregators.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { aggregateHooks, aggregateScripts } from '../aggregators';
import type { DeepAnalysis, PlatformId, TranscriptSegment } from '~/types';

const sampleDeep = (overrides: Partial<DeepAnalysis['hook']> = {}): DeepAnalysis => ({
  hook: {
    type: 'visual',
    spoken: 'You will not believe this',
    onScreen: 'WAIT FOR IT',
    visualFormat: 'jump-cut close-up',
    ...overrides,
  },
  structure: [],
  pacing: { avgCutSec: 1.2, rhythm: 'fast' },
  techniques: ['hook', 'cliffhanger'],
});

describe('aggregateHooks', () => {
  it('returns empty array when no deep entries', () => {
    expect(aggregateHooks([], [])).toEqual([]);
  });

  it('extracts hook fields from each deep entry', () => {
    const deeps = [
      { platform: 'youtube' as PlatformId, videoId: 'v1', deep: sampleDeep({ spoken: 'Hook one' }) },
      { platform: 'youtube' as PlatformId, videoId: 'v2', deep: sampleDeep({ spoken: 'Hook two' }) },
    ];
    const hooks = aggregateHooks(deeps, []);
    expect(hooks).toHaveLength(2);
    expect(hooks[0].spoken).toBe('Hook one');
    expect(hooks[1].videoId).toBe('v2');
  });

  it('joins audio hook from transcript 0–5s window', () => {
    const segs: TranscriptSegment[] = [
      { start: 0, dur: 2, text: 'Hey there' },
      { start: 2, dur: 3, text: 'check this out' },
      { start: 5, dur: 4, text: 'beyond window' },
    ];
    const deeps = [{ platform: 'youtube' as PlatformId, videoId: 'v1', deep: sampleDeep() }];
    const hooks = aggregateHooks(deeps, [{ platform: 'youtube', videoId: 'v1', segments: segs }]);
    expect(hooks[0].audioHook).toContain('Hey there');
    expect(hooks[0].audioHook).toContain('check this out');
    expect(hooks[0].audioHook).not.toContain('beyond window');
  });

  it('audioHook is empty string when no transcript', () => {
    const deeps = [{ platform: 'youtube' as PlatformId, videoId: 'v1', deep: sampleDeep() }];
    const hooks = aggregateHooks(deeps, []);
    expect(hooks[0].audioHook).toBe('');
  });
});

describe('aggregateScripts', () => {
  it('returns empty when no transcripts', () => {
    expect(aggregateScripts([])).toEqual([]);
  });

  it('builds full text from each transcript', () => {
    const t1: TranscriptSegment[] = [
      { start: 0, dur: 1, text: 'first line' },
      { start: 1, dur: 1, text: 'second line' },
    ];
    const t2: TranscriptSegment[] = [{ start: 0, dur: 1, text: 'only line' }];
    const scripts = aggregateScripts([
      { platform: 'youtube', videoId: 'a', segments: t1 },
      { platform: 'youtube', videoId: 'b', segments: t2 },
    ]);
    expect(scripts).toHaveLength(2);
    expect(scripts[0].fullText).toBe('first line second line');
    expect(scripts[1].videoId).toBe('b');
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `cd extension && npx vitest run src/lib/__tests__/aggregators.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `extension/src/lib/aggregators.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests — pass**

Run: `cd extension && npx vitest run src/lib/__tests__/aggregators.test.ts`
Expected: PASS — 6 cases.

- [ ] **Step 5: Commit**

```bash
git add extension/src/lib/aggregators.ts extension/src/lib/__tests__/aggregators.test.ts
git commit -m "feat(extension): pure aggregators for hooks + scripts

aggregateHooks(deeps, transcripts) emits HookEntry rows with the four
hook fields (type/spoken/onScreen/visualFormat) plus the 0–5s slice
of the matching transcript. aggregateScripts(transcripts) emits
ScriptEntry rows with full transcript text. Both are pure and consume
the snapshot helpers added in the previous task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: HookCard component

**Files:**
- Create: `extension/src/app/components/HookCard.tsx`

(No standalone test — covered by HooksSubPage integration test.)

- [ ] **Step 1: Implement**

```typescript
import type { HookEntry } from '~/lib/aggregators';
import { platformVideoUrl } from '~/lib/export';

export default function HookCard({ entry }: { entry: HookEntry }) {
  const url = platformVideoUrl(entry.platform, entry.videoId);
  return (
    <article className="koko-card p-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-wide text-slate-400">visual hook</div>
        <div className="text-sm text-slate-700 italic">{entry.visualFormat || '—'}</div>
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-koko-pink-deep underline">
          watch ↗
        </a>
      </div>
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-wide text-slate-400">written hook</div>
        <div className="text-sm">{entry.spoken || entry.onScreen || '—'}</div>
        {entry.onScreen && entry.spoken && entry.onScreen !== entry.spoken ? (
          <div className="text-xs text-slate-500">on-screen: {entry.onScreen}</div>
        ) : null}
        <div className="text-[10px] uppercase tracking-wide text-slate-400 mt-1">type</div>
        <div className="text-xs">{entry.hookType}</div>
      </div>
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-wide text-slate-400">audio hook (0–5s)</div>
        <div className="text-sm text-slate-700">{entry.audioHook || <span className="text-slate-400 italic">no transcript</span>}</div>
      </div>
    </article>
  );
}
```

- [ ] **Step 2: Verify tsc**

Run: `cd extension && npm run compile`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add extension/src/app/components/HookCard.tsx
git commit -m "feat(extension): HookCard 3-column horizontal layout

Visual / written / audio split per spec §2.1.2. Visual column shows
visualFormat string + watch link (in-video frame extraction is a
Phase 10 punt — using thumbnail-link surrogate for v1). Written shows
spoken hook with on-screen overlay if different. Audio renders the
transcript 0–5s slice.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: ScriptCard component

**Files:**
- Create: `extension/src/app/components/ScriptCard.tsx`

- [ ] **Step 1: Implement**

```typescript
import { useState } from 'react';
import type { ScriptEntry } from '~/lib/aggregators';
import { platformVideoUrl } from '~/lib/export';

const PREVIEW_CHARS = 280;

export default function ScriptCard({ entry }: { entry: ScriptEntry }) {
  const [expanded, setExpanded] = useState(false);
  const long = entry.fullText.length > PREVIEW_CHARS;
  const display = !long || expanded ? entry.fullText : entry.fullText.slice(0, PREVIEW_CHARS) + '…';
  const url = platformVideoUrl(entry.platform, entry.videoId);

  return (
    <article className="koko-card p-4 space-y-2">
      <header className="flex items-center justify-between text-xs text-slate-500">
        <span>{entry.platform} · {entry.videoId}</span>
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-koko-pink-deep underline">watch ↗</a>
      </header>
      <p className="text-sm whitespace-pre-wrap leading-relaxed">{display}</p>
      {long ? (
        <button onClick={() => setExpanded((x) => !x)} className="text-xs text-koko-pink-deep">
          {expanded ? 'collapse' : 'expand'}
        </button>
      ) : null}
    </article>
  );
}
```

- [ ] **Step 2: tsc clean**

Run: `cd extension && npm run compile`

- [ ] **Step 3: Commit**

```bash
git add extension/src/app/components/ScriptCard.tsx
git commit -m "feat(extension): ScriptCard with expand/collapse over 280 chars

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: HooksSubPage

**Files:**
- Create: `extension/src/app/routes/HooksSubPage.tsx`
- Create: `extension/src/app/routes/HooksSubPage.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

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

async function renderSubpage() {
  fakeStore['koko.deep.youtube.v1'] = {
    hook: { type: 'visual', spoken: 'Wait for it', onScreen: 'WAIT FOR IT', visualFormat: 'close-up' },
    structure: [],
    pacing: { avgCutSec: 1, rhythm: 'fast' },
    techniques: [],
  };
  fakeStore['koko.deep.youtube.v2'] = {
    hook: { type: 'verbal', spoken: 'You will not believe this', onScreen: '', visualFormat: 'b-roll' },
    structure: [],
    pacing: { avgCutSec: 1, rhythm: 'fast' },
    techniques: [],
  };
  const { storage } = await import('~/lib/storage');
  await storage.hydrate();
  const HooksSubPage = (await import('./HooksSubPage')).default;
  return render(<HooksSubPage />);
}

describe('HooksSubPage', () => {
  it('renders empty state when no analyzed videos', async () => {
    const { storage } = await import('~/lib/storage');
    await storage.hydrate();
    const HooksSubPage = (await import('./HooksSubPage')).default;
    render(<HooksSubPage />);
    expect(await screen.findByText(/no hooks yet/i)).toBeInTheDocument();
  });

  it('renders one HookCard per analyzed video', async () => {
    await renderSubpage();
    expect(await screen.findByText(/Wait for it/i)).toBeInTheDocument();
    expect(screen.getByText(/You will not believe this/i)).toBeInTheDocument();
  });

  it('shows a count badge', async () => {
    await renderSubpage();
    expect(await screen.findByText(/2 hooks/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `cd extension && npx vitest run src/app/routes/HooksSubPage.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```typescript
import { useMemo } from 'react';
import { storage } from '~/lib/storage';
import { aggregateHooks } from '~/lib/aggregators';
import HookCard from '~/app/components/HookCard';

export default function HooksSubPage() {
  const hooks = useMemo(() => {
    const deeps = storage.getAllDeepEntries();
    const transcripts = storage.getAllTranscriptEntries();
    return aggregateHooks(deeps, transcripts);
  }, []);

  if (hooks.length === 0) {
    return (
      <div className="koko-card p-8 max-w-xl mx-auto text-center text-sm text-slate-500">
        No hooks yet. Analyze videos from the Videos sub-page to populate this view.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{hooks.length} hook{hooks.length === 1 ? '' : 's'} from analyzed videos</p>
      </header>
      <div className="space-y-2">
        {hooks.map((h) => (
          <HookCard key={`${h.platform}::${h.videoId}`} entry={h} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run — passes**

Run: `cd extension && npx vitest run src/app/routes/HooksSubPage.test.tsx`
Expected: PASS — 3 cases.

- [ ] **Step 5: Commit**

```bash
git add extension/src/app/routes/HooksSubPage.tsx extension/src/app/routes/HooksSubPage.test.tsx
git commit -m "feat(extension): HooksSubPage aggregator over analyzed videos

Empty state matches sandcastles reference. List renders one HookCard
per analyzed video. Memoized — recomputes only on mount; future Task
will trigger refresh when underlying caches grow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: ScriptsSubPage

**Files:**
- Create: `extension/src/app/routes/ScriptsSubPage.tsx`
- Create: `extension/src/app/routes/ScriptsSubPage.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

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

describe('ScriptsSubPage', () => {
  it('renders empty state when no transcripts', async () => {
    const { storage } = await import('~/lib/storage');
    await storage.hydrate();
    const ScriptsSubPage = (await import('./ScriptsSubPage')).default;
    render(<ScriptsSubPage />);
    expect(await screen.findByText(/no scripts yet/i)).toBeInTheDocument();
  });

  it('renders ScriptCard per transcript', async () => {
    fakeStore['koko.transcript.youtube.a'] = [
      { start: 0, dur: 1, text: 'opening sentence' },
      { start: 1, dur: 1, text: 'continuation' },
    ];
    const { storage } = await import('~/lib/storage');
    await storage.hydrate();
    const ScriptsSubPage = (await import('./ScriptsSubPage')).default;
    render(<ScriptsSubPage />);
    expect(await screen.findByText(/opening sentence/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — fails**

- [ ] **Step 3: Implement**

```typescript
import { useMemo } from 'react';
import { storage } from '~/lib/storage';
import { aggregateScripts } from '~/lib/aggregators';
import ScriptCard from '~/app/components/ScriptCard';

export default function ScriptsSubPage() {
  const scripts = useMemo(() => aggregateScripts(storage.getAllTranscriptEntries()), []);

  if (scripts.length === 0) {
    return (
      <div className="koko-card p-8 max-w-xl mx-auto text-center text-sm text-slate-500">
        No scripts yet. Transcripts populate as you analyze videos with captions enabled.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <header>
        <p className="text-xs text-slate-500">{scripts.length} script{scripts.length === 1 ? '' : 's'} from analyzed videos</p>
      </header>
      <div className="space-y-2">
        {scripts.map((s) => (
          <ScriptCard key={`${s.platform}::${s.videoId}`} entry={s} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run — passes**

- [ ] **Step 5: Commit**

```bash
git add extension/src/app/routes/ScriptsSubPage.tsx extension/src/app/routes/ScriptsSubPage.test.tsx
git commit -m "feat(extension): ScriptsSubPage aggregator over transcript cache

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Wire HooksSubPage + ScriptsSubPage into Analyze.tsx

**Files:**
- Modify: `extension/src/app/routes/Analyze.tsx`
- Modify: `extension/src/app/routes/Analyze.test.tsx`

- [ ] **Step 1: Update test**

Replace the second/third test cases in Analyze.test.tsx to assert real sub-page content instead of ComingSoon stubs:

```typescript
  it('switches to Hooks sub-page', async () => {
    await renderRoute();
    fireEvent.click(screen.getByRole('tab', { name: /hooks/i }));
    expect(await screen.findByText(/no hooks yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId('cross-channel-stub')).not.toBeInTheDocument();
  });

  it('switches to Scripts sub-page', async () => {
    await renderRoute();
    fireEvent.click(screen.getByRole('tab', { name: /scripts/i }));
    expect(await screen.findByText(/no scripts yet/i)).toBeInTheDocument();
  });
```

(Keep the first case as-is — Videos sub-page renders the CrossChannel stub.)

- [ ] **Step 2: Run — fails (still has ComingSoon assertion or new expectations not met)**

- [ ] **Step 3: Update Analyze.tsx**

Replace the ComingSoon stubs in Analyze.tsx with real sub-pages:

```typescript
import { useState } from 'react';
import CrossChannel from '~/app/routes/CrossChannel';
import HooksSubPage from '~/app/routes/HooksSubPage';
import ScriptsSubPage from '~/app/routes/ScriptsSubPage';

type SubPage = 'videos' | 'hooks' | 'scripts';

export default function Analyze() {
  const [sub, setSub] = useState<SubPage>('videos');
  return (
    <div className="space-y-4">
      <div role="tablist" className="inline-flex rounded-full border border-sky-200 bg-white p-1 text-xs">
        {(['videos', 'hooks', 'scripts'] as SubPage[]).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={sub === s}
            onClick={() => setSub(s)}
            className={`px-3 py-1 rounded-full transition ${
              sub === s ? 'bg-koko-pink-deep text-white' : 'text-slate-600 hover:bg-sky-50'
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      {sub === 'videos' ? <CrossChannel /> : null}
      {sub === 'hooks' ? <HooksSubPage /> : null}
      {sub === 'scripts' ? <ScriptsSubPage /> : null}
    </div>
  );
}
```

- [ ] **Step 4: Run all suites — pass**

```
cd extension && npm run compile
cd extension && npm test
cd extension && npm run build 2>&1 | tail -3
```
Expected: tsc clean, all tests pass, build clean.

- [ ] **Step 5: Commit**

```bash
git add extension/src/app/routes/Analyze.tsx extension/src/app/routes/Analyze.test.tsx
git commit -m "feat(extension): wire HooksSubPage + ScriptsSubPage into Analyze

Replaces the Phase 1 ComingSoon stubs in the Hooks and Scripts tabs.
Videos tab still renders CrossChannel (Phase 3b will add filter/sort
/select-mode/Top-X power features).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Push + iteration log

- [ ] **Step 1: Append iteration log row to remote.md**

```
| 2026-05-08 <HHMM>Z | local | <last-commit-sha> | Phase 3a — Hooks + Scripts aggregator sub-pages shipped |
```

- [ ] **Step 2: Commit + push**

```bash
git add remote.md
git commit -m "chore: log Phase 3a completion in remote.md iteration log

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push origin feat/full-product-spec
```

---

## Self-Review

**1. Spec coverage:**
- §2.1.2 Hooks sub-page (visual / written / audio columns) → Tasks 3, 5. Visual column degrades to thumbnail+watch link per §3.1; spec already documented this punt.
- §2.1.2 "Analyze [N] more" footer action → **deferred** to Phase 3b (requires bulk-analyze pipeline integration). Empty state nudges user to Videos sub-page in the meantime.
- §2.1.2 Category bubbles → deferred to Phase 7 per spec phasing.
- §2.1.3 Scripts sub-page → Tasks 4, 6.
- §2.1.3 `koko.transcript.<platform>.<videoId>` cache → Task 1.
- §2.1.1 Videos toolbar power features (filter/sort/select-mode/Top-X/extended export) → **deferred** to Phase 3b.

**2. Placeholder scan:** No "TBD" / "TODO". All tasks contain complete code.

**3. Type consistency:**
- `HookEntry` / `ScriptEntry` defined in Task 2, consumed in Tasks 3, 4, 5, 6 with matching field names.
- `getAllDeepEntries` / `getAllTranscriptEntries` declared in Task 1 with the same row shape consumed by Task 5/6.
- `platformVideoUrl` is reused from existing `lib/export.ts` — already exports the function (verified in repo). No new export needed.

Plan is internally consistent. Ready for execution.
