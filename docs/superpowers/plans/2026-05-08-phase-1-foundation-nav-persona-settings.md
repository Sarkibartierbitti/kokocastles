# Phase 1 — Foundation, Nav, Persona, Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the foundation for the full kokocastles product: a `/persona` route, extended Settings (outlier threshold + own-channel + refresh-interval + throttle defaults + LRU eviction cap), full sidebar reorder with stub routes, and an `/analyze` placeholder that takes over the homepage and embeds the existing CrossChannel grid as the default Videos sub-page.

**Architecture:** All state lives in `browser.storage.local` through `extension/src/lib/storage.ts`. New routes are React-Router pages under `extension/src/app/routes/`. Stubs render a single `<ComingSoon kind="..." />` component. Settings groups expand the existing `Settings.tsx` with new `<section>` cards. `/analyze` is a route shell with a segmented `[Videos | Hooks | Scripts]` toggle; only the Videos sub-page is wired in this phase (re-uses `CrossChannel`); Hooks + Scripts render `<ComingSoon kind="hooks" />` / `<ComingSoon kind="scripts" />` until Phase 3.

**Tech Stack:** Vite + React 18 + TypeScript + Tailwind + WXT. Vitest for unit tests. Existing storage layer + tailwind palette (`koko-sky`, `koko-pink`).

**Source spec:** `docs/superpowers/specs/2026-05-07-full-product-feasibility-and-design.md` §2.1 (Analyze shell), §2.7 (Persona), §2.8 (Settings).

**Hard constraints (verify each task):**
- `cd extension && npm run compile` passes (tsc --noEmit clean).
- `cd extension && npm test` all tests green.
- `cd extension && npm run build 2>&1 | tail -3` clean.
- Never default to Opus inside generated code (this phase touches no LLM call sites — N/A).
- Multi-platform discipline: nothing in this phase introduces YouTube-only assumptions.
- Theme palette: `koko-sky #BAE6FD`, `koko-pink #FBCFE8`. Use existing tailwind tokens.

---

## File Structure

**New files:**
- `extension/src/app/components/ComingSoon.tsx` — generic stub-page component
- `extension/src/app/components/ComingSoon.test.tsx` — render test
- `extension/src/app/routes/Persona.tsx` — three-textarea persona route
- `extension/src/app/routes/Persona.test.tsx` — char-limit + persistence test
- `extension/src/app/routes/Analyze.tsx` — sub-page toggle shell
- `extension/src/app/routes/Analyze.test.tsx` — toggle behavior test
- `extension/src/app/routes/Databanks.tsx` — stub
- `extension/src/app/routes/Ideas.tsx` — stub
- `extension/src/app/routes/MyChannel.tsx` — stub
- `extension/src/app/routes/Writer.tsx` — stub
- `extension/src/app/components/Sidebar.tsx` — extracted nav (reordered)
- `extension/src/lib/__tests__/storage.persona.test.ts` — persona getters/setters
- `extension/src/lib/__tests__/storage.settings.test.ts` — outlier threshold + ownChannel + intervals + lruCap

**Modified files:**
- `extension/src/lib/storage.ts` — add `persona`, `outlierThreshold`, `ownChannel`, `refreshIntervalHours`, `throttleConcurrency`, `throttleJitterMs`, `cacheLruCap` getters/setters
- `extension/src/types.ts` — add `Persona` type
- `extension/src/app/App.tsx` — replace inline nav with `<Sidebar />`, add new route entries, set `/` to `<Analyze />`
- `extension/src/app/routes/Settings.tsx` — add three new section cards (analysis defaults, own channel, throttling + cache)

**Files NOT touched in Phase 1 (deferred):**
- All `extension/src/lib/llm/*` — no model-routing changes
- All `extension/src/entrypoints/*` — no content-script work
- `extension/src/lib/outlier.ts` — threshold becomes a stored setting but the consumer wiring is Phase 3 (Analyze Videos sub-page filter UI)

---

## Task 1: Add storage keys + getters/setters for new settings

**Files:**
- Modify: `extension/src/lib/storage.ts`
- Modify: `extension/src/types.ts:1-10` (add `Persona` interface near top)
- Test: `extension/src/lib/__tests__/storage.settings.test.ts` (new)

- [ ] **Step 1: Write failing test for new storage fields**

Create `extension/src/lib/__tests__/storage.settings.test.ts`:

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
      remove: vi.fn(async (keys: string | string[]) => {
        const arr = typeof keys === 'string' ? [keys] : keys;
        for (const k of arr) delete fakeStore[k];
      }),
    },
  },
};
(globalThis as Record<string, unknown>).browser = mockBrowser;

beforeEach(() => {
  for (const k of Object.keys(fakeStore)) delete fakeStore[k];
  vi.clearAllMocks();
  vi.resetModules();
});

describe('storage — analysis settings', () => {
  it('outlier threshold defaults to 1.5', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    expect(storage.getOutlierThreshold()).toBe(1.5);
  });

  it('outlier threshold persists', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.setOutlierThreshold(2.3);
    expect(storage.getOutlierThreshold()).toBe(2.3);
    expect(fakeStore['koko.outlierThreshold']).toBe(2.3);
  });

  it('own channel defaults to null', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    expect(storage.getOwnChannel()).toBeNull();
  });

  it('own channel persists', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.setOwnChannel({
      platform: 'youtube',
      channelId: 'UCown',
      title: 'Me',
    });
    expect(storage.getOwnChannel()?.channelId).toBe('UCown');
  });

  it('refresh interval defaults to 6 hours', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    expect(storage.getRefreshIntervalHours()).toBe(6);
  });

  it('throttle concurrency defaults to 2', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    expect(storage.getThrottleConcurrency()).toBe(2);
  });

  it('throttle jitterMs defaults to 2500', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    expect(storage.getThrottleJitterMs()).toBe(2500);
  });

  it('cache LRU cap defaults to 10000', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    expect(storage.getCacheLruCap()).toBe(10000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npx vitest run src/lib/__tests__/storage.settings.test.ts`
Expected: FAIL — `storage.getOutlierThreshold is not a function`.

- [ ] **Step 3: Add `Persona` type to `types.ts`**

Insert after line 9 (after `Channel` interface):

```typescript
export interface Persona {
  niche: string;        // ≤5000 chars
  context: string;      // ≤5000 chars
  styleSample: string;  // ≤3000 chars
  attachedDatabankIds: string[];
}
```

- [ ] **Step 4: Extend storage.ts with new keys + accessors**

In `extension/src/lib/storage.ts`:

Replace the `KEY` const block (lines 13–21) with:

```typescript
const KEY = {
  llmKey: 'koko.llmKey',
  llmProvider: 'koko.llmProvider',
  llmModel: 'koko.llmModel',
  youtubeKey: 'koko.youtubeKey',
  watchlist: 'koko.watchlist',
  triagePrefix: 'koko.triage.',
  deepPrefix: 'koko.deep.',
  persona: 'koko.persona',
  outlierThreshold: 'koko.outlierThreshold',
  ownChannel: 'koko.ownChannel',
  refreshIntervalHours: 'koko.refreshIntervalHours',
  throttleConcurrency: 'koko.throttleConcurrency',
  throttleJitterMs: 'koko.throttleJitterMs',
  cacheLruCap: 'koko.cacheLruCap',
} as const;
```

Add this at the top of the file, after the `import` line:

```typescript
import type { Channel, DeepAnalysis, LLMModelId, LLMProvider, Persona, PlatformId, TriageResult } from '~/types';
```

(Replaces the existing import — adds `Persona`.)

Inside the `export const storage = { ... }` block, append (immediately before the closing brace, after the existing `setDeep` line):

```typescript
  getPersona: () => getCached<Persona>(KEY.persona, { niche: '', context: '', styleSample: '', attachedDatabankIds: [] }),
  setPersona: (v: Persona) => writeThrough(KEY.persona, v),

  getOutlierThreshold: () => getCached<number>(KEY.outlierThreshold, 1.5),
  setOutlierThreshold: (v: number) => writeThrough(KEY.outlierThreshold, v),

  getOwnChannel: () => getCached<Channel | null>(KEY.ownChannel, null),
  setOwnChannel: (v: Channel | null) => writeThrough(KEY.ownChannel, v),

  getRefreshIntervalHours: () => getCached<number>(KEY.refreshIntervalHours, 6),
  setRefreshIntervalHours: (v: number) => writeThrough(KEY.refreshIntervalHours, v),

  getThrottleConcurrency: () => getCached<number>(KEY.throttleConcurrency, 2),
  setThrottleConcurrency: (v: number) => writeThrough(KEY.throttleConcurrency, v),

  getThrottleJitterMs: () => getCached<number>(KEY.throttleJitterMs, 2500),
  setThrottleJitterMs: (v: number) => writeThrough(KEY.throttleJitterMs, v),

  getCacheLruCap: () => getCached<number>(KEY.cacheLruCap, 10000),
  setCacheLruCap: (v: number) => writeThrough(KEY.cacheLruCap, v),
```

- [ ] **Step 5: Run new test — passes**

Run: `cd extension && npx vitest run src/lib/__tests__/storage.settings.test.ts`
Expected: PASS — all 8 cases.

- [ ] **Step 6: Run full storage test file too — no regressions**

Run: `cd extension && npx vitest run src/lib/__tests__/storage.test.ts`
Expected: PASS — original 5 cases still pass.

- [ ] **Step 7: tsc + full test suite + build**

Run:
```
cd extension && npm run compile
cd extension && npm test
cd extension && npm run build 2>&1 | tail -3
```
Expected: tsc clean; all tests pass; build "Done in …".

- [ ] **Step 8: Commit**

```bash
git add extension/src/types.ts extension/src/lib/storage.ts extension/src/lib/__tests__/storage.settings.test.ts
git commit -m "feat(extension): storage keys for persona, outlier threshold, own channel, throttle, LRU cap

Adds typed getters/setters with sensible defaults (outlier 1.5, refresh
6h, concurrency 2, jitter 2500ms, LRU 10000). Persona scaffolding in
types.ts. No consumer wiring yet — Phase 1 plans bind these to UI in
later tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Add persona-only storage test

**Files:**
- Test: `extension/src/lib/__tests__/storage.persona.test.ts` (new)

This task is small but isolates persona invariants the future Persona route relies on (immutable copy on write, char-limit enforcement deferred to UI but type-shape stable).

- [ ] **Step 1: Write the test**

Create `extension/src/lib/__tests__/storage.persona.test.ts`:

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

describe('storage — persona', () => {
  it('returns empty persona when none stored', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    const p = storage.getPersona();
    expect(p).toEqual({ niche: '', context: '', styleSample: '', attachedDatabankIds: [] });
  });

  it('round-trips persona through storage', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.setPersona({
      niche: 'AI tools for creators',
      context: 'I build kokocastles, an open clone of sandcastles.',
      styleSample: 'Hey friends! Today we are going to build…',
      attachedDatabankIds: ['db1', 'db2'],
    });
    const p = storage.getPersona();
    expect(p.niche).toBe('AI tools for creators');
    expect(p.attachedDatabankIds).toEqual(['db1', 'db2']);
    expect(fakeStore['koko.persona']).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run — passes (storage already extended in Task 1)**

Run: `cd extension && npx vitest run src/lib/__tests__/storage.persona.test.ts`
Expected: PASS — both cases.

- [ ] **Step 3: Commit**

```bash
git add extension/src/lib/__tests__/storage.persona.test.ts
git commit -m "test(extension): persona storage round-trip

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: ComingSoon component

**Files:**
- Create: `extension/src/app/components/ComingSoon.tsx`
- Create: `extension/src/app/components/ComingSoon.test.tsx`

- [ ] **Step 1: Write failing test**

Create `extension/src/app/components/ComingSoon.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ComingSoon from './ComingSoon';

describe('ComingSoon', () => {
  it('renders the kind in the heading', () => {
    render(<ComingSoon kind="databanks" />);
    expect(screen.getByRole('heading', { name: /databanks/i })).toBeInTheDocument();
  });

  it('shows the planned-phase badge', () => {
    render(<ComingSoon kind="ideas" phase={4} />);
    expect(screen.getByText(/phase 4/i)).toBeInTheDocument();
  });

  it('falls back gracefully when phase is omitted', () => {
    render(<ComingSoon kind="writer" />);
    expect(screen.queryByText(/phase/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `cd extension && npx vitest run src/app/components/ComingSoon.test.tsx`
Expected: FAIL — `Cannot find module './ComingSoon'`.

If `@testing-library/react` is not yet installed (check `extension/package.json`), install it:
```bash
cd extension && npm i -D @testing-library/react @testing-library/jest-dom jsdom
```
Then add to `extension/vitest.config.ts` `test.environment: 'jsdom'` if missing. If present, skip.

- [ ] **Step 3: Create the component**

`extension/src/app/components/ComingSoon.tsx`:

```typescript
interface ComingSoonProps {
  kind: string;
  phase?: number;
  description?: string;
}

export default function ComingSoon({ kind, phase, description }: ComingSoonProps) {
  return (
    <div className="koko-card p-8 max-w-2xl mx-auto text-center space-y-3">
      <h1 className="text-xl font-display font-semibold capitalize">{kind}</h1>
      {phase !== undefined ? (
        <span className="inline-block px-3 py-1 rounded-full bg-koko-pink/40 text-slate-700 text-xs font-medium">
          Coming in phase {phase}
        </span>
      ) : null}
      <p className="text-sm text-slate-500">
        {description ?? `The ${kind} surface is scaffolded but not yet wired. Track progress in docs/superpowers/plans/.`}
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run — passes**

Run: `cd extension && npx vitest run src/app/components/ComingSoon.test.tsx`
Expected: PASS — three cases.

- [ ] **Step 5: Commit**

```bash
git add extension/src/app/components/ComingSoon.tsx extension/src/app/components/ComingSoon.test.tsx
git commit -m "feat(extension): ComingSoon stub component for not-yet-wired routes

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

If you needed to add @testing-library/react in Step 2, the `package.json` and `package-lock.json` changes go in this same commit.

---

## Task 4: Stub routes (Databanks, Ideas, MyChannel, Writer)

**Files:**
- Create: `extension/src/app/routes/Databanks.tsx`
- Create: `extension/src/app/routes/Ideas.tsx`
- Create: `extension/src/app/routes/MyChannel.tsx`
- Create: `extension/src/app/routes/Writer.tsx`

- [ ] **Step 1: Create all four stub files**

`extension/src/app/routes/Databanks.tsx`:

```typescript
import ComingSoon from '~/app/components/ComingSoon';

export default function Databanks() {
  return <ComingSoon kind="databanks" phase={2} description="Named folders of saved videos. Reuses the Videos sub-page in filtered mode once Phase 2 lands." />;
}
```

`extension/src/app/routes/Ideas.tsx`:

```typescript
import ComingSoon from '~/app/components/ComingSoon';

export default function Ideas() {
  return <ComingSoon kind="ideas" phase={4} description="Inbox / Shortlist buckets generated from analyzed videos or selected databanks." />;
}
```

`extension/src/app/routes/MyChannel.tsx`:

```typescript
import ComingSoon from '~/app/components/ComingSoon';

export default function MyChannel() {
  return <ComingSoon kind="my channel" phase={6} description="Analytics over your own uploads, with hypothesis tagging and 6-hour polling refresh." />;
}
```

`extension/src/app/routes/Writer.tsx`:

```typescript
import ComingSoon from '~/app/components/ComingSoon';

export default function Writer() {
  return <ComingSoon kind="writer" phase={5} description="Multi-step script generation pulling persona, databanks, and freeform topic context." />;
}
```

- [ ] **Step 2: tsc check**

Run: `cd extension && npm run compile`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add extension/src/app/routes/Databanks.tsx extension/src/app/routes/Ideas.tsx extension/src/app/routes/MyChannel.tsx extension/src/app/routes/Writer.tsx
git commit -m "feat(extension): stub routes for Databanks, Ideas, MyChannel, Writer

Each route renders ComingSoon with the planned phase number. Wiring
to App router happens in the sidebar/nav task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Persona route

**Files:**
- Create: `extension/src/app/routes/Persona.tsx`
- Create: `extension/src/app/routes/Persona.test.tsx`

- [ ] **Step 1: Write failing test**

Create `extension/src/app/routes/Persona.test.tsx`:

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

beforeEach(() => {
  for (const k of Object.keys(fakeStore)) delete fakeStore[k];
  vi.resetModules();
});

async function renderRoute() {
  const { storage } = await import('~/lib/storage');
  await storage.hydrate();
  const Persona = (await import('./Persona')).default;
  return render(
    <MemoryRouter>
      <Persona />
    </MemoryRouter>
  );
}

describe('Persona route', () => {
  it('renders three textareas with correct char limits', async () => {
    await renderRoute();
    const niche = await screen.findByLabelText(/content niche/i) as HTMLTextAreaElement;
    const context = screen.getByLabelText(/brand context/i) as HTMLTextAreaElement;
    const style = screen.getByLabelText(/writing style/i) as HTMLTextAreaElement;
    expect(niche.maxLength).toBe(5000);
    expect(context.maxLength).toBe(5000);
    expect(style.maxLength).toBe(3000);
  });

  it('persists values to storage on save', async () => {
    await renderRoute();
    const niche = await screen.findByLabelText(/content niche/i);
    fireEvent.change(niche, { target: { value: 'Generative AI demos' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      const persona = fakeStore['koko.persona'] as { niche: string };
      expect(persona?.niche).toBe('Generative AI demos');
    });
  });

  it('shows char counter that updates as you type', async () => {
    await renderRoute();
    const context = await screen.findByLabelText(/brand context/i);
    fireEvent.change(context, { target: { value: 'hi' } });
    expect(screen.getByText(/2 \/ 5000/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `cd extension && npx vitest run src/app/routes/Persona.test.tsx`
Expected: FAIL — `Cannot find module './Persona'`.

- [ ] **Step 3: Implement Persona route**

`extension/src/app/routes/Persona.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { storage } from '~/lib/storage';
import type { Persona } from '~/types';

const NICHE_MAX = 5000;
const CONTEXT_MAX = 5000;
const STYLE_MAX = 3000;

export default function PersonaRoute() {
  const [niche, setNiche] = useState('');
  const [context, setContext] = useState('');
  const [styleSample, setStyleSample] = useState('');
  const [attachedDatabankIds, setAttachedDatabankIds] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const p = storage.getPersona();
    setNiche(p.niche);
    setContext(p.context);
    setStyleSample(p.styleSample);
    setAttachedDatabankIds(p.attachedDatabankIds);
  }, []);

  async function save() {
    const p: Persona = { niche, context, styleSample, attachedDatabankIds };
    await storage.setPersona(p);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-xl font-display font-semibold">Persona</h1>
        <p className="text-sm text-slate-500">Share information about your brand to personalize analysis and script generation.</p>
      </header>

      <Card
        title="Content niche"
        badge="Research"
        badgeTone="sky"
        helpText="Describe your content niche. Used to personalize channel discovery and idea analysis."
        value={niche}
        onChange={setNiche}
        max={NICHE_MAX}
        labelId="persona-niche"
        ariaLabel="Content niche"
        placeholder="e.g. 'Generative AI product releases'"
      />

      <Card
        title="Brand context"
        badge="Scripting"
        badgeTone="pink"
        helpText="Describe your business or brand. The system injects this in all future scripts."
        value={context}
        onChange={setContext}
        max={CONTEXT_MAX}
        labelId="persona-context"
        ariaLabel="Brand context"
        placeholder="e.g. 'I'm a content creator for a startup called Kokocastles'"
      />

      <Card
        title="Writing style"
        badge="Scripting"
        badgeTone="pink"
        helpText="Provide a writing sample for the system to emulate. Don't include instructions — only a script you want to sound like."
        value={styleSample}
        onChange={setStyleSample}
        max={STYLE_MAX}
        labelId="persona-style"
        ariaLabel="Writing style"
        placeholder=""
      />

      <div className="flex items-center gap-3">
        <button onClick={save} className="koko-btn">Save</button>
        {saved ? <span className="text-sm text-koko-pink-deep font-medium">saved ✓</span> : null}
      </div>
    </div>
  );
}

interface CardProps {
  title: string;
  badge: string;
  badgeTone: 'sky' | 'pink';
  helpText: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  labelId: string;
  ariaLabel: string;
  placeholder: string;
}

function Card(props: CardProps) {
  const toneClass = props.badgeTone === 'sky'
    ? 'bg-koko-sky/40 text-slate-700'
    : 'bg-koko-pink/40 text-slate-700';
  return (
    <section className="koko-card p-5 space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-base font-display font-semibold">{props.title}</h2>
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${toneClass}`}>{props.badge}</span>
      </header>
      <p className="text-xs text-slate-500">{props.helpText}</p>
      <textarea
        id={props.labelId}
        aria-label={props.ariaLabel}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        maxLength={props.max}
        placeholder={props.placeholder}
        className="w-full min-h-[140px] rounded-lg border border-sky-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-koko-sky-deep"
      />
      <div className="text-right text-xs text-slate-400">{props.value.length} / {props.max}</div>
    </section>
  );
}
```

If `koko-card` / `koko-btn` classes are not defined (verify by grepping `extension/src/styles.css`), add them:

```css
@layer components {
  .koko-card { @apply bg-white rounded-xl ring-1 ring-sky-100 shadow-sm; }
  .koko-btn { @apply px-4 py-2 rounded-lg bg-koko-pink-deep text-white text-sm font-medium hover:opacity-90; }
}
```

(Skip this addition if the classes already exist.)

- [ ] **Step 4: Run — passes**

Run: `cd extension && npx vitest run src/app/routes/Persona.test.tsx`
Expected: PASS — three cases.

- [ ] **Step 5: tsc + full test suite**

Run:
```
cd extension && npm run compile
cd extension && npm test
```
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add extension/src/app/routes/Persona.tsx extension/src/app/routes/Persona.test.tsx
# Only add styles.css if you modified it:
# git add extension/src/styles.css
git commit -m "feat(extension): Persona route with three textareas + char counters

Niche/Context/StyleSample fields with the documented char limits
(5000/5000/3000). Persists via storage.setPersona. Color-coded
Research/Scripting badges per sandcastles-reference.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Sidebar component (extracted nav, reordered)

**Files:**
- Create: `extension/src/app/components/Sidebar.tsx`
- Modify: `extension/src/app/App.tsx` (replace inline nav)

- [ ] **Step 1: Create Sidebar component**

`extension/src/app/components/Sidebar.tsx`:

```typescript
import { Link, NavLink } from 'react-router-dom';

interface NavEntry {
  to: string;
  label: string;
  end?: boolean;
}

const ENTRIES: NavEntry[] = [
  { to: '/', label: 'analyze', end: true },
  { to: '/channels', label: 'channels' },
  { to: '/databanks', label: 'databanks' },
  { to: '/ideas', label: 'ideas' },
  { to: '/my-channel', label: 'my channel' },
  { to: '/writer', label: 'writer' },
  { to: '/persona', label: 'persona' },
  { to: '/niche', label: 'niche' },
  { to: '/compare', label: 'compare' },
  { to: '/settings', label: 'settings' },
  { to: '/help', label: 'help' },
];

export default function Sidebar() {
  return (
    <>
      <header className="px-4 py-3 border-b border-sky-100 flex items-center gap-3">
        <Link to="/" className="koko-wordmark text-lg">kokocastles</Link>
      </header>
      <nav className="px-4 py-2 flex flex-wrap gap-3 text-xs border-b border-sky-100">
        {ENTRIES.map((e) => (
          <NavLink
            key={e.to}
            to={e.to}
            end={e.end}
            className={({ isActive }) =>
              isActive ? 'text-koko-pink-deep font-semibold' : 'text-slate-600'
            }
          >
            {e.label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
```

- [ ] **Step 2: Replace inline nav in `App.tsx` (DO NOT add new routes yet — that's Task 8)**

`extension/src/app/App.tsx`:

Replace the current `<header>` + `<nav>` blocks (lines roughly 19–34) with `<Sidebar />` and import it. The Routes block stays unchanged for now — we add new route entries in Task 8 once Analyze is wired.

Final file:

```typescript
import { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import Sidebar from '~/app/components/Sidebar';
import Watchlist from '~/app/routes/Watchlist';
import Settings from '~/app/routes/Settings';
import Help from '~/app/routes/Help';
import Channel from '~/app/routes/Channel';
import VideoAnalysis from '~/app/routes/VideoAnalysis';
import NicheScan from '~/app/routes/NicheScan';
import CrossChannel from '~/app/routes/CrossChannel';
import ActivityPanel from '~/app/components/ActivityPanel';
import { storage } from '~/lib/storage';
import { activity } from '~/lib/activity';

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([storage.hydrate(), activity.hydrate()]).then(() => setReady(true));
  }, []);

  if (!ready) {
    return <div className="p-6 text-sm text-slate-500">loading…</div>;
  }

  return (
    <div className="min-h-screen text-slate-900 pb-12">
      <Sidebar />
      <main className="p-4">
        <Routes>
          <Route path="/" element={<Watchlist />} />
          <Route path="/channel/:platform/:channelId" element={<Channel />} />
          <Route path="/video/:platform/:videoId" element={<VideoAnalysis />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/help" element={<Help />} />
          <Route path="/niche" element={<NicheScan />} />
          <Route path="/compare" element={<CrossChannel />} />
        </Routes>
      </main>
      <ActivityPanel />
    </div>
  );
}
```

Note that the sidebar will render links to `/channels`, `/databanks`, `/ideas`, `/my-channel`, `/writer`, `/persona` even though the routes don't exist yet. Those will 404 (render the React-Router default empty match) until Task 8. This is intentional — keeps the diff small and reviewable.

- [ ] **Step 3: tsc check**

Run: `cd extension && npm run compile`
Expected: clean.

- [ ] **Step 4: Visual smoke**

Run: `cd extension && npm run build 2>&1 | tail -3`
Expected: build clean. Optional: `npx web-ext run --source-dir=.output/firefox-mv2` to eyeball the new sidebar.

- [ ] **Step 5: Commit**

```bash
git add extension/src/app/components/Sidebar.tsx extension/src/app/App.tsx
git commit -m "feat(extension): extract Sidebar component with reordered nav

Order: analyze | channels | databanks | ideas | my channel | writer |
persona | niche | compare | settings | help. Routes for not-yet-wired
items will be added in the Analyze task; navigating to them now hits
the empty-match catch-all.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Analyze route (sub-page toggle + Videos default)

**Files:**
- Create: `extension/src/app/routes/Analyze.tsx`
- Create: `extension/src/app/routes/Analyze.test.tsx`

- [ ] **Step 1: Write failing test**

Create `extension/src/app/routes/Analyze.test.tsx`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Stub the heavy CrossChannel route so the test stays fast and isolated.
vi.mock('~/app/routes/CrossChannel', () => ({
  default: () => <div data-testid="cross-channel-stub">cross-channel</div>,
}));

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

async function renderRoute() {
  const Analyze = (await import('./Analyze')).default;
  return render(
    <MemoryRouter>
      <Analyze />
    </MemoryRouter>
  );
}

describe('Analyze route', () => {
  it('renders Videos sub-page by default (CrossChannel grid)', async () => {
    await renderRoute();
    expect(await screen.findByTestId('cross-channel-stub')).toBeInTheDocument();
  });

  it('switches to Hooks sub-page (ComingSoon)', async () => {
    await renderRoute();
    fireEvent.click(screen.getByRole('tab', { name: /hooks/i }));
    expect(screen.getByRole('heading', { name: /hooks/i })).toBeInTheDocument();
    expect(screen.queryByTestId('cross-channel-stub')).not.toBeInTheDocument();
  });

  it('switches to Scripts sub-page (ComingSoon)', async () => {
    await renderRoute();
    fireEvent.click(screen.getByRole('tab', { name: /scripts/i }));
    expect(screen.getByRole('heading', { name: /scripts/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `cd extension && npx vitest run src/app/routes/Analyze.test.tsx`
Expected: FAIL — `Cannot find module './Analyze'`.

- [ ] **Step 3: Implement Analyze**

`extension/src/app/routes/Analyze.tsx`:

```typescript
import { useState } from 'react';
import CrossChannel from '~/app/routes/CrossChannel';
import ComingSoon from '~/app/components/ComingSoon';

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
      {sub === 'hooks' ? <ComingSoon kind="hooks" phase={3} description="Aggregated hooks from analyzed videos. Lands in Phase 3." /> : null}
      {sub === 'scripts' ? <ComingSoon kind="scripts" phase={3} description="Full transcripts from analyzed videos. Lands in Phase 3." /> : null}
    </div>
  );
}
```

- [ ] **Step 4: Run test — passes**

Run: `cd extension && npx vitest run src/app/routes/Analyze.test.tsx`
Expected: PASS — three cases.

- [ ] **Step 5: Commit**

```bash
git add extension/src/app/routes/Analyze.tsx extension/src/app/routes/Analyze.test.tsx
git commit -m "feat(extension): Analyze route with [Videos|Hooks|Scripts] toggle

Videos sub-page renders existing CrossChannel grid; Hooks + Scripts
render ComingSoon stubs scheduled for Phase 3. Tabs use aria-selected
roles for accessibility + clean test selectors.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Wire all new routes in App; move homepage to Analyze

**Files:**
- Modify: `extension/src/app/App.tsx` (Routes block)

- [ ] **Step 1: Update Routes block**

Replace the `<Routes>` block in `App.tsx` with:

```typescript
<Routes>
  <Route path="/" element={<Analyze />} />
  <Route path="/channels" element={<Watchlist />} />
  <Route path="/channel/:platform/:channelId" element={<Channel />} />
  <Route path="/video/:platform/:videoId" element={<VideoAnalysis />} />
  <Route path="/databanks" element={<Databanks />} />
  <Route path="/ideas" element={<Ideas />} />
  <Route path="/my-channel" element={<MyChannel />} />
  <Route path="/writer" element={<Writer />} />
  <Route path="/persona" element={<Persona />} />
  <Route path="/settings" element={<Settings />} />
  <Route path="/help" element={<Help />} />
  <Route path="/niche" element={<NicheScan />} />
  <Route path="/compare" element={<CrossChannel />} />
</Routes>
```

Add the corresponding imports near the top of `App.tsx`:

```typescript
import Analyze from '~/app/routes/Analyze';
import Persona from '~/app/routes/Persona';
import Databanks from '~/app/routes/Databanks';
import Ideas from '~/app/routes/Ideas';
import MyChannel from '~/app/routes/MyChannel';
import Writer from '~/app/routes/Writer';
```

The old Watchlist-at-`/` mapping moves to `/channels` so the URL matches the sidebar label.

- [ ] **Step 2: tsc + full test suite + build**

Run:
```
cd extension && npm run compile
cd extension && npm test
cd extension && npm run build 2>&1 | tail -3
```
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add extension/src/app/App.tsx
git commit -m "feat(extension): wire Analyze + Persona + stub routes; / now shows Analyze

Watchlist moves from / to /channels (matches sidebar label). Stub
routes (Databanks/Ideas/MyChannel/Writer) render ComingSoon. Persona
fully wired.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Settings — Analysis Defaults card (outlier threshold)

**Files:**
- Modify: `extension/src/app/routes/Settings.tsx`
- Create: `extension/src/app/routes/Settings.test.tsx` (new — tests new sections only; existing Settings has no tests)

- [ ] **Step 1: Write failing test**

Create `extension/src/app/routes/Settings.test.tsx`:

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

beforeEach(() => {
  for (const k of Object.keys(fakeStore)) delete fakeStore[k];
  vi.resetModules();
});

async function renderSettings() {
  const { storage } = await import('~/lib/storage');
  await storage.hydrate();
  const Settings = (await import('./Settings')).default;
  return render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>
  );
}

describe('Settings — analysis defaults', () => {
  it('renders outlier threshold input with default 1.5', async () => {
    await renderSettings();
    const input = await screen.findByLabelText(/outlier threshold/i) as HTMLInputElement;
    expect(input.value).toBe('1.5');
  });

  it('persists outlier threshold on save', async () => {
    await renderSettings();
    const input = await screen.findByLabelText(/outlier threshold/i);
    fireEvent.change(input, { target: { value: '2.5' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(fakeStore['koko.outlierThreshold']).toBe(2.5);
    });
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `cd extension && npx vitest run src/app/routes/Settings.test.tsx`
Expected: FAIL — outlier threshold input not in DOM.

- [ ] **Step 3: Add Analysis Defaults section to Settings.tsx**

In `extension/src/app/routes/Settings.tsx`:

Add to the imports at the top:

```typescript
import type { Channel } from '~/types';
```

Add new useState entries inside the component, after the existing state hooks:

```typescript
const [outlierThreshold, setOutlierThreshold] = useState(1.5);
const [refreshIntervalHours, setRefreshIntervalHours] = useState(6);
const [throttleConcurrency, setThrottleConcurrency] = useState(2);
const [throttleJitterMs, setThrottleJitterMs] = useState(2500);
const [cacheLruCap, setCacheLruCap] = useState(10000);
const [ownChannel, setOwnChannel] = useState<Channel | null>(null);
```

In the existing `useEffect(() => { ... }, [])` hook (the one that hydrates state), add at the end:

```typescript
setOutlierThreshold(storage.getOutlierThreshold());
setRefreshIntervalHours(storage.getRefreshIntervalHours());
setThrottleConcurrency(storage.getThrottleConcurrency());
setThrottleJitterMs(storage.getThrottleJitterMs());
setCacheLruCap(storage.getCacheLruCap());
setOwnChannel(storage.getOwnChannel());
```

In the existing `save()` function, append (before the `setSaved(true)` line):

```typescript
await storage.setOutlierThreshold(outlierThreshold);
await storage.setRefreshIntervalHours(refreshIntervalHours);
await storage.setThrottleConcurrency(throttleConcurrency);
await storage.setThrottleJitterMs(throttleJitterMs);
await storage.setCacheLruCap(cacheLruCap);
await storage.setOwnChannel(ownChannel);
```

Add this `<section>` immediately after the existing `API keys` section (before the Save button div):

```tsx
<section className="koko-card p-6 space-y-4">
  <h2 className="text-lg font-display font-semibold">Analysis defaults</h2>

  <div className="space-y-1">
    <label htmlFor="outlier-threshold" className="text-sm font-medium text-slate-700">
      Outlier threshold (views ÷ channel mean)
    </label>
    <input
      id="outlier-threshold"
      type="number"
      step="0.1"
      min="1"
      max="10"
      value={outlierThreshold}
      onChange={(e) => setOutlierThreshold(Number(e.target.value))}
      className="w-32 rounded-lg border border-sky-200 px-3 py-2 text-sm"
    />
    <p className="text-xs text-slate-500">A video counts as an outlier when its views ÷ channel mean ≥ this number. Default 1.5.</p>
  </div>

  <div className="space-y-1">
    <label htmlFor="cache-lru-cap" className="text-sm font-medium text-slate-700">
      Analysis cache cap
    </label>
    <input
      id="cache-lru-cap"
      type="number"
      step="1000"
      min="1000"
      max="100000"
      value={cacheLruCap}
      onChange={(e) => setCacheLruCap(Number(e.target.value))}
      className="w-32 rounded-lg border border-sky-200 px-3 py-2 text-sm"
    />
    <p className="text-xs text-slate-500">Max number of cached analyses + transcripts before LRU eviction. Default 10000.</p>
  </div>
</section>
```

- [ ] **Step 4: Run test — outlier-threshold cases pass**

Run: `cd extension && npx vitest run src/app/routes/Settings.test.tsx`
Expected: PASS — both cases.

- [ ] **Step 5: Commit**

```bash
git add extension/src/app/routes/Settings.tsx extension/src/app/routes/Settings.test.tsx
git commit -m "feat(extension): Settings — Analysis Defaults section (outlier threshold + LRU cap)

Two numeric inputs persisted via storage. Defaults preserved when fields
empty. UI hooks for refresh interval / throttle / own channel are added
in next tasks against the same Settings.tsx.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Settings — Throttling section + refresh interval

**Files:**
- Modify: `extension/src/app/routes/Settings.tsx` (state already present from Task 9)
- Modify: `extension/src/app/routes/Settings.test.tsx` (add cases)

- [ ] **Step 1: Add tests**

Append to `Settings.test.tsx`:

```typescript
describe('Settings — throttling + refresh', () => {
  it('renders concurrency input with default 2', async () => {
    await renderSettings();
    const input = await screen.findByLabelText(/scrape concurrency/i) as HTMLInputElement;
    expect(input.value).toBe('2');
  });

  it('renders jitter input with default 2500', async () => {
    await renderSettings();
    const input = await screen.findByLabelText(/jitter/i) as HTMLInputElement;
    expect(input.value).toBe('2500');
  });

  it('renders refresh interval with default 6', async () => {
    await renderSettings();
    const input = await screen.findByLabelText(/refresh interval/i) as HTMLInputElement;
    expect(input.value).toBe('6');
  });

  it('persists all three on save', async () => {
    await renderSettings();
    fireEvent.change(await screen.findByLabelText(/scrape concurrency/i), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/jitter/i), { target: { value: '4000' } });
    fireEvent.change(screen.getByLabelText(/refresh interval/i), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(fakeStore['koko.throttleConcurrency']).toBe(3);
      expect(fakeStore['koko.throttleJitterMs']).toBe(4000);
      expect(fakeStore['koko.refreshIntervalHours']).toBe(12);
    });
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `cd extension && npx vitest run src/app/routes/Settings.test.tsx`
Expected: FAIL — labels not found.

- [ ] **Step 3: Add Throttling section to Settings.tsx**

Append this `<section>` right after the Analysis Defaults section:

```tsx
<section className="koko-card p-6 space-y-4">
  <h2 className="text-lg font-display font-semibold">Throttling &amp; refresh</h2>

  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
    <div className="space-y-1">
      <label htmlFor="throttle-concurrency" className="text-sm font-medium text-slate-700">Scrape concurrency</label>
      <input
        id="throttle-concurrency"
        type="number"
        min="1"
        max="5"
        value={throttleConcurrency}
        onChange={(e) => setThrottleConcurrency(Number(e.target.value))}
        className="w-full rounded-lg border border-sky-200 px-3 py-2 text-sm"
      />
      <p className="text-xs text-slate-500">Max parallel hidden-tab scrapes. Default 2.</p>
    </div>

    <div className="space-y-1">
      <label htmlFor="throttle-jitter" className="text-sm font-medium text-slate-700">Jitter (ms)</label>
      <input
        id="throttle-jitter"
        type="number"
        min="0"
        max="10000"
        step="100"
        value={throttleJitterMs}
        onChange={(e) => setThrottleJitterMs(Number(e.target.value))}
        className="w-full rounded-lg border border-sky-200 px-3 py-2 text-sm"
      />
      <p className="text-xs text-slate-500">Random delay between scrapes. Higher = less CAPTCHA risk.</p>
    </div>

    <div className="space-y-1">
      <label htmlFor="refresh-interval" className="text-sm font-medium text-slate-700">Refresh interval (hours)</label>
      <input
        id="refresh-interval"
        type="number"
        min="1"
        max="48"
        value={refreshIntervalHours}
        onChange={(e) => setRefreshIntervalHours(Number(e.target.value))}
        className="w-full rounded-lg border border-sky-200 px-3 py-2 text-sm"
      />
      <p className="text-xs text-slate-500">How often own-channel polling runs. Default 6h.</p>
    </div>
  </div>
</section>
```

- [ ] **Step 4: Run tests — pass**

Run: `cd extension && npx vitest run src/app/routes/Settings.test.tsx`
Expected: PASS — all 6 cases now.

- [ ] **Step 5: Commit**

```bash
git add extension/src/app/routes/Settings.tsx extension/src/app/routes/Settings.test.tsx
git commit -m "feat(extension): Settings — throttling + refresh interval section

Three numeric inputs (concurrency, jitterMs, refreshIntervalHours)
exposed in the UI. Persisted via storage. Defaults match remote.md
post-Phase-C recommendations (concurrency 2, jitter 2500ms).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Settings — Own channel input

**Files:**
- Modify: `extension/src/app/routes/Settings.tsx` (state already present from Task 9)
- Modify: `extension/src/app/routes/Settings.test.tsx` (add case)

The own-channel input takes a URL or handle and resolves it via the existing `youtube` adapter. To keep this phase scope-clean, we resolve only on Save (synchronous from user's perspective, async under the hood); stub the adapter in tests.

- [ ] **Step 1: Add test**

Append to `Settings.test.tsx`:

```typescript
describe('Settings — own channel', () => {
  it('renders own-channel URL input empty by default', async () => {
    await renderSettings();
    const input = await screen.findByLabelText(/own channel url/i) as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('persists own channel after resolve on save', async () => {
    // Pre-seed storage so the input round-trips a previously-saved channel.
    fakeStore['koko.ownChannel'] = {
      platform: 'youtube',
      channelId: 'UCown',
      title: 'Me',
    };
    await renderSettings();
    const input = await screen.findByLabelText(/own channel url/i) as HTMLInputElement;
    expect(input.value).toContain('UCown');
  });
});
```

- [ ] **Step 2: Run — fails (label missing)**

Run: `cd extension && npx vitest run src/app/routes/Settings.test.tsx`
Expected: FAIL on the new cases.

- [ ] **Step 3: Add own-channel UI**

Inside `Settings.tsx`, add another local state to hold the raw input:

```typescript
const [ownChannelInput, setOwnChannelInput] = useState('');
```

Inside the same hydration `useEffect`, after `setOwnChannel(storage.getOwnChannel())`:

```typescript
const oc = storage.getOwnChannel();
if (oc) setOwnChannelInput(`https://www.youtube.com/channel/${oc.channelId}`);
```

In `save()`, before the `setSaved(true)` line and AFTER the existing `setOwnChannel` call you added in Task 9, replace the `await storage.setOwnChannel(ownChannel)` line with:

```typescript
const trimmed = ownChannelInput.trim();
if (!trimmed) {
  setOwnChannel(null);
  await storage.setOwnChannel(null);
} else {
  // Lazy import so test doesn't have to mock the YouTube adapter.
  const { youtube } = await import('~/lib/platforms/youtube');
  try {
    const resolved = await youtube.resolveChannel(trimmed);
    setOwnChannel(resolved);
    await storage.setOwnChannel(resolved);
  } catch (err) {
    console.warn('own-channel resolve failed', err);
    // Keep previous value on resolve failure.
  }
}
```

Add this new section after the Throttling section:

```tsx
<section className="koko-card p-6 space-y-4">
  <h2 className="text-lg font-display font-semibold">My channel</h2>
  <div className="space-y-1">
    <label htmlFor="own-channel-url" className="text-sm font-medium text-slate-700">
      Own channel URL
    </label>
    <input
      id="own-channel-url"
      type="text"
      placeholder="https://www.youtube.com/@yourhandle  ·  https://www.youtube.com/channel/UC…"
      value={ownChannelInput}
      onChange={(e) => setOwnChannelInput(e.target.value)}
      className="w-full max-w-xl rounded-lg border border-sky-200 px-3 py-2 text-sm"
    />
    <p className="text-xs text-slate-500">
      Resolved on save via YouTube Data API. Used by the My Channel page (Phase 6) for
      analytics + hypothesis tagging.
    </p>
    {ownChannel ? (
      <div className="text-xs text-slate-500">
        Currently linked: <strong>{ownChannel.title}</strong> ({ownChannel.channelId})
      </div>
    ) : null}
  </div>
</section>
```

If `youtube.resolveChannel(input: string)` doesn't exist on the adapter, check `extension/src/lib/platforms/youtube.ts` — the `PlatformAdapter` interface declares `resolveChannel(urlOrHandle: string)`. If the YouTube adapter's exported object isn't named `youtube`, use whatever its actual export is (search with `grep -n "export" extension/src/lib/platforms/youtube.ts`).

- [ ] **Step 4: Run tests — pass**

Run: `cd extension && npx vitest run src/app/routes/Settings.test.tsx`
Expected: PASS — all 8 cases (the resolve path is not invoked because tests don't trigger save with non-empty input; if it does in a future test, the lazy `import('~/lib/platforms/youtube')` will need to be mocked).

- [ ] **Step 5: tsc + full test suite + build**

Run:
```
cd extension && npm run compile
cd extension && npm test
cd extension && npm run build 2>&1 | tail -3
```
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add extension/src/app/routes/Settings.tsx extension/src/app/routes/Settings.test.tsx
git commit -m "feat(extension): Settings — own channel input with lazy YT resolve

Resolution happens on save via the existing YouTube adapter. Empty
input clears the link. Errors during resolve preserve the previous
linked channel rather than wiping it. The Phase 6 My Channel route
will read storage.getOwnChannel().

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: unlimitedStorage permission + final verification

**Files:**
- Modify: `extension/wxt.config.ts`

The spec §3.3 calls for `unlimitedStorage` so cached analyses don't bump the 10 MB ceiling.

- [ ] **Step 1: Add permission**

In `extension/wxt.config.ts`, change:

```typescript
permissions: ['storage', 'tabs', 'activeTab'],
```

to:

```typescript
permissions: ['storage', 'tabs', 'activeTab', 'unlimitedStorage'],
```

- [ ] **Step 2: Verify the build still passes**

Run:
```
cd extension && npm run compile
cd extension && npm test
cd extension && npm run build 2>&1 | tail -3
```
Expected: all green; manifest in `.output/firefox-mv2/manifest.json` lists `"unlimitedStorage"` (verify with `grep unlimited extension/.output/firefox-mv2/manifest.json`).

- [ ] **Step 3: Commit**

```bash
git add extension/wxt.config.ts
git commit -m "feat(extension): request unlimitedStorage permission

Spec §3.3 — analyses + transcripts will exceed the 10 MB default once
hooks/scripts aggregator and writer thread storage land. Granting
unlimitedStorage now removes a future surprise quota error.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Push + iteration log

**Files:**
- Modify: `remote.md` (Iteration Log section only)

- [ ] **Step 1: Append to remote.md Iteration Log**

In `remote.md`, append a row to the Iteration Log table:

```
| 2026-05-08 <HHMM>Z | local | <last-commit-sha> | Phase 1 — foundation/nav/persona/settings shipped end-to-end |
```

Replace `<HHMM>Z` and `<last-commit-sha>` with real values. Keep the log to last 30 entries — trim from top if needed.

- [ ] **Step 2: Push**

```bash
git push origin feat/full-product-spec
```

- [ ] **Step 3: Done**

Phase 1 is shipped. Phase 2 plan (databanks subsystem) is the next consumer of `superpowers:executing-plans`.

---

## Self-Review

**1. Spec coverage:**
- §2.1 Analyze sub-page toggle → Task 7. ✅
- §2.7 Persona → Tasks 1, 2, 5. ✅
- §2.8 Settings: outlier threshold → Task 9; own channel → Task 11; refresh interval → Task 10; throttle → Task 10; LRU cap → Task 9. ✅
- §3.3 storage quota → Task 12 (`unlimitedStorage`). ✅
- Sidebar reorder → Task 6. ✅
- Stub routes (Databanks/Ideas/MyChannel/Writer) → Tasks 3, 4, 8. ✅
- Homepage moves to Analyze → Task 8. ✅
- LRU eviction *enforcement* (the actual eviction logic) → **deferred** to Phase 3 (when caches start growing); Phase 1 surfaces only the cap config. Acceptable scope discipline; called out in spec §6 as a Phase-1-or-later open question.

**2. Placeholder scan:** No "TBD" / "TODO". Every task has full code. The one conditional ("if `youtube.resolveChannel` isn't named that…") is a fallback instruction, not a placeholder.

**3. Type consistency:**
- `Persona` interface defined in Task 1, consumed in Task 5 — matches.
- Storage methods named `getOutlierThreshold` / `setOutlierThreshold` (etc.) — used identically in Tasks 9, 10, 11.
- `Channel` type imported from `~/types` in both `storage.ts` and `Settings.tsx`.
- `Analyze` route filename + import path match across Tasks 7 and 8.

Plan is internally consistent. Ready for execution.
