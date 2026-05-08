# Phase 2 — Databanks Subsystem Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Databanks subsystem: a CRUD layer for named folders of saved videos, a `/databanks` list page, and a `/databanks/:id` view that renders the existing video grid filtered to the databank's video set. Each video card gains an "Add to databank" action that opens a small picker modal.

**Architecture:** Databanks live in a single `koko.databanks` storage key as a `Databank[]`. A derived `databankIndex: Map<videoKey, Set<databankId>>` is computed on hydrate for O(1) membership checks. Inside-databank views reuse `<CrossChannel videoFilter={...}>` — the existing component is parameterized rather than duplicated. No new card component.

**Tech Stack:** Same as Phase 1 — Vite + React + TS + Tailwind + WXT. Vitest. UUIDs via `crypto.randomUUID()` (browser-native, no dep).

**Source spec:** `docs/superpowers/specs/2026-05-07-full-product-feasibility-and-design.md` §2.3.

**Prerequisites:** Phase 1 must be complete and merged on `feat/full-product-spec`. Phase 2 depends on:
- `~/lib/storage.ts` extension surface (Phase 1 adds the persona/settings keys; this phase adds databanks).
- `Databanks` stub route created in Phase 1 (will be replaced).
- `koko-card`, `koko-btn` styles available.

**Hard constraints (verify each task):**
- `cd extension && npm run compile` clean.
- `cd extension && npm test` all green.
- `cd extension && npm run build 2>&1 | tail -3` clean.
- Multi-platform discipline: Databank video refs are `{ platform, videoId }` — never `videoId` alone.

---

## File Structure

**New files:**
- `extension/src/lib/databanks.ts` — pure helpers (validate name, dedupe refs, find by id)
- `extension/src/lib/__tests__/databanks.test.ts`
- `extension/src/lib/__tests__/storage.databanks.test.ts`
- `extension/src/app/routes/DatabanksList.tsx` — replaces the Phase 1 stub
- `extension/src/app/routes/DatabanksList.test.tsx`
- `extension/src/app/routes/DatabankDetail.tsx`
- `extension/src/app/routes/DatabankDetail.test.tsx`
- `extension/src/app/components/DatabankPicker.tsx` — modal: pick existing or create-new
- `extension/src/app/components/DatabankPicker.test.tsx`
- `extension/src/app/components/AddToDatabankButton.tsx` — wraps the picker, calls `storage.addToDatabank`

**Modified files:**
- `extension/src/types.ts` — add `Databank`, `DatabankVideoRef`
- `extension/src/lib/storage.ts` — add `getDatabanks`, `setDatabanks`, `addToDatabank`, `removeFromDatabank`, `createDatabank`, `deleteDatabank`, `renameDatabank`, plus the derived `databankIndex` rebuild on hydrate
- `extension/src/app/components/VideoCard.tsx` — render `<AddToDatabankButton videoRef={...} />`
- `extension/src/app/App.tsx` — replace `Databanks` stub import with `DatabanksList`; add `/databanks/:id` route to `DatabankDetail`
- `extension/src/app/routes/Databanks.tsx` — **delete** (replaced by `DatabanksList`)

---

## Task 1: Databank types + pure helpers

**Files:**
- Modify: `extension/src/types.ts`
- Create: `extension/src/lib/databanks.ts`
- Create: `extension/src/lib/__tests__/databanks.test.ts`

- [ ] **Step 1: Add types**

Append to `extension/src/types.ts`:

```typescript
export interface DatabankVideoRef {
  platform: PlatformId;
  videoId: string;
  addedAt: string; // ISO date
}

export interface Databank {
  id: string;          // crypto.randomUUID
  name: string;
  createdAt: string;   // ISO
  videoRefs: DatabankVideoRef[];
}
```

- [ ] **Step 2: Write failing test**

Create `extension/src/lib/__tests__/databanks.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  validateName,
  refKey,
  dedupeRefs,
  findById,
  buildIndex,
} from '../databanks';
import type { Databank } from '~/types';

describe('databanks helpers', () => {
  describe('validateName', () => {
    it('rejects empty', () => {
      expect(validateName('')).toBe('Name is required');
      expect(validateName('   ')).toBe('Name is required');
    });

    it('rejects > 80 chars', () => {
      expect(validateName('x'.repeat(81))).toBe('Name must be 80 characters or fewer');
    });

    it('accepts valid', () => {
      expect(validateName('Hooks I love')).toBeNull();
    });

    it('accepts unicode', () => {
      expect(validateName('カワイイ hooks')).toBeNull();
    });
  });

  describe('refKey', () => {
    it('joins platform + videoId', () => {
      expect(refKey({ platform: 'youtube', videoId: 'abc', addedAt: '' })).toBe('youtube::abc');
    });
  });

  describe('dedupeRefs', () => {
    it('keeps first occurrence', () => {
      const refs = [
        { platform: 'youtube' as const, videoId: 'a', addedAt: '2026-01-01' },
        { platform: 'youtube' as const, videoId: 'a', addedAt: '2026-01-02' },
        { platform: 'youtube' as const, videoId: 'b', addedAt: '2026-01-03' },
      ];
      const out = dedupeRefs(refs);
      expect(out).toHaveLength(2);
      expect(out[0].addedAt).toBe('2026-01-01');
    });
  });

  describe('findById', () => {
    it('returns null when missing', () => {
      expect(findById([], 'x')).toBeNull();
    });

    it('returns the matching databank', () => {
      const dbs: Databank[] = [{ id: 'a', name: 'A', createdAt: '', videoRefs: [] }];
      expect(findById(dbs, 'a')?.name).toBe('A');
    });
  });

  describe('buildIndex', () => {
    it('builds a videoKey -> Set<databankId> map', () => {
      const dbs: Databank[] = [
        {
          id: 'd1', name: 'd1', createdAt: '', videoRefs: [
            { platform: 'youtube', videoId: 'a', addedAt: '' },
            { platform: 'youtube', videoId: 'b', addedAt: '' },
          ],
        },
        {
          id: 'd2', name: 'd2', createdAt: '', videoRefs: [
            { platform: 'youtube', videoId: 'a', addedAt: '' },
          ],
        },
      ];
      const idx = buildIndex(dbs);
      expect(idx.get('youtube::a')).toEqual(new Set(['d1', 'd2']));
      expect(idx.get('youtube::b')).toEqual(new Set(['d1']));
      expect(idx.get('youtube::c')).toBeUndefined();
    });
  });
});
```

- [ ] **Step 3: Run — fails (no `databanks.ts`)**

Run: `cd extension && npx vitest run src/lib/__tests__/databanks.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement helpers**

Create `extension/src/lib/databanks.ts`:

```typescript
import type { Databank, DatabankVideoRef, PlatformId } from '~/types';

export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'Name is required';
  if (trimmed.length > 80) return 'Name must be 80 characters or fewer';
  return null;
}

export function refKey(ref: DatabankVideoRef | { platform: PlatformId; videoId: string }): string {
  return `${ref.platform}::${ref.videoId}`;
}

export function dedupeRefs(refs: DatabankVideoRef[]): DatabankVideoRef[] {
  const seen = new Set<string>();
  const out: DatabankVideoRef[] = [];
  for (const r of refs) {
    const k = refKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

export function findById(dbs: Databank[], id: string): Databank | null {
  return dbs.find((d) => d.id === id) ?? null;
}

export function buildIndex(dbs: Databank[]): Map<string, Set<string>> {
  const idx = new Map<string, Set<string>>();
  for (const db of dbs) {
    for (const r of db.videoRefs) {
      const k = refKey(r);
      const s = idx.get(k) ?? new Set<string>();
      s.add(db.id);
      idx.set(k, s);
    }
  }
  return idx;
}

export function newDatabank(name: string): Databank {
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    createdAt: new Date().toISOString(),
    videoRefs: [],
  };
}
```

- [ ] **Step 5: Run tests — pass**

Run: `cd extension && npx vitest run src/lib/__tests__/databanks.test.ts`
Expected: PASS — 9 cases.

- [ ] **Step 6: Commit**

```bash
git add extension/src/types.ts extension/src/lib/databanks.ts extension/src/lib/__tests__/databanks.test.ts
git commit -m "feat(extension): databank types + pure helpers (validate / dedupe / index)

No storage wiring yet — that lands in the next task. Tests cover
validation edges, ref-key generation, dedupe stability, and the
buildIndex contract used by membership checks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Storage layer for databanks

**Files:**
- Modify: `extension/src/lib/storage.ts`
- Create: `extension/src/lib/__tests__/storage.databanks.test.ts`

- [ ] **Step 1: Write failing test**

Create `extension/src/lib/__tests__/storage.databanks.test.ts`:

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

describe('storage — databanks', () => {
  it('returns empty list by default', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    expect(storage.getDatabanks()).toEqual([]);
  });

  it('createDatabank assigns id, persists, returns it', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    const db = await storage.createDatabank('Hooks I love');
    expect(db.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(db.name).toBe('Hooks I love');
    const all = storage.getDatabanks();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(db.id);
  });

  it('createDatabank rejects invalid names', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await expect(storage.createDatabank('')).rejects.toThrow(/required/i);
    await expect(storage.createDatabank('x'.repeat(81))).rejects.toThrow(/80/);
  });

  it('addToDatabank appends + dedupes', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    const db = await storage.createDatabank('A');
    await storage.addToDatabank(db.id, { platform: 'youtube', videoId: 'v1' });
    await storage.addToDatabank(db.id, { platform: 'youtube', videoId: 'v1' });
    await storage.addToDatabank(db.id, { platform: 'youtube', videoId: 'v2' });
    const all = storage.getDatabanks();
    expect(all[0].videoRefs).toHaveLength(2);
  });

  it('removeFromDatabank drops the matching ref', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    const db = await storage.createDatabank('A');
    await storage.addToDatabank(db.id, { platform: 'youtube', videoId: 'v1' });
    await storage.removeFromDatabank(db.id, { platform: 'youtube', videoId: 'v1' });
    expect(storage.getDatabanks()[0].videoRefs).toHaveLength(0);
  });

  it('renameDatabank updates the name', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    const db = await storage.createDatabank('A');
    await storage.renameDatabank(db.id, 'B');
    expect(storage.getDatabanks()[0].name).toBe('B');
  });

  it('deleteDatabank removes the entry', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    const db = await storage.createDatabank('A');
    await storage.deleteDatabank(db.id);
    expect(storage.getDatabanks()).toEqual([]);
  });

  it('getDatabankIndex returns an up-to-date Map', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    const a = await storage.createDatabank('A');
    const b = await storage.createDatabank('B');
    await storage.addToDatabank(a.id, { platform: 'youtube', videoId: 'v1' });
    await storage.addToDatabank(b.id, { platform: 'youtube', videoId: 'v1' });
    const idx = storage.getDatabankIndex();
    expect(idx.get('youtube::v1')).toEqual(new Set([a.id, b.id]));
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `cd extension && npx vitest run src/lib/__tests__/storage.databanks.test.ts`
Expected: FAIL — `getDatabanks is not a function`.

- [ ] **Step 3: Extend `storage.ts`**

In `extension/src/lib/storage.ts`:

Add to the import line at the top:

```typescript
import type { Channel, Databank, DatabankVideoRef, DeepAnalysis, LLMModelId, LLMProvider, Persona, PlatformId, TriageResult } from '~/types';
import { buildIndex, dedupeRefs, newDatabank, refKey, validateName } from './databanks';
```

Add to the `KEY` const block:

```typescript
  databanks: 'koko.databanks',
```

Above the `export const storage = {`, add a module-scoped index that gets rebuilt on each write:

```typescript
let databankIndex: Map<string, Set<string>> = new Map();

function rebuildDatabankIndex() {
  const list = getCached<Databank[]>(KEY.databanks, []);
  databankIndex = buildIndex(list);
}
```

Modify `hydrate()` so the index is built after hydration:

```typescript
async function hydrate(): Promise<void> {
  if (hydrated) return;
  const all = await browser.storage.local.get(null);
  for (const [k, v] of Object.entries(all)) cache.set(k, v);
  hydrated = true;
  rebuildDatabankIndex();
}
```

Append to the `storage` object (before the closing brace):

```typescript
  getDatabanks: () => getCached<Databank[]>(KEY.databanks, []),

  getDatabankIndex: () => databankIndex,

  createDatabank: async (name: string): Promise<Databank> => {
    const err = validateName(name);
    if (err) throw new Error(err);
    const list = storage.getDatabanks();
    const db = newDatabank(name);
    list.push(db);
    await writeThrough(KEY.databanks, list);
    rebuildDatabankIndex();
    return db;
  },

  renameDatabank: async (id: string, name: string): Promise<void> => {
    const err = validateName(name);
    if (err) throw new Error(err);
    const list = storage.getDatabanks().map((d) => (d.id === id ? { ...d, name: name.trim() } : d));
    await writeThrough(KEY.databanks, list);
  },

  deleteDatabank: async (id: string): Promise<void> => {
    const list = storage.getDatabanks().filter((d) => d.id !== id);
    await writeThrough(KEY.databanks, list);
    rebuildDatabankIndex();
  },

  addToDatabank: async (id: string, ref: { platform: PlatformId; videoId: string }): Promise<void> => {
    const newRef: DatabankVideoRef = { ...ref, addedAt: new Date().toISOString() };
    const list = storage.getDatabanks().map((d) =>
      d.id === id ? { ...d, videoRefs: dedupeRefs([...d.videoRefs, newRef]) } : d
    );
    await writeThrough(KEY.databanks, list);
    rebuildDatabankIndex();
  },

  removeFromDatabank: async (id: string, ref: { platform: PlatformId; videoId: string }): Promise<void> => {
    const k = refKey(ref);
    const list = storage.getDatabanks().map((d) =>
      d.id === id ? { ...d, videoRefs: d.videoRefs.filter((r) => refKey(r) !== k) } : d
    );
    await writeThrough(KEY.databanks, list);
    rebuildDatabankIndex();
  },
```

- [ ] **Step 4: Run tests — pass**

Run: `cd extension && npx vitest run src/lib/__tests__/storage.databanks.test.ts`
Expected: PASS — 8 cases.

- [ ] **Step 5: Commit**

```bash
git add extension/src/lib/storage.ts extension/src/lib/__tests__/storage.databanks.test.ts
git commit -m "feat(extension): storage CRUD for databanks + derived index

Eight new methods: getDatabanks, getDatabankIndex, createDatabank,
renameDatabank, deleteDatabank, addToDatabank, removeFromDatabank,
plus index rebuild on hydrate / mutate. Validation reuses
databanks.ts helpers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: DatabankPicker component (modal)

**Files:**
- Create: `extension/src/app/components/DatabankPicker.tsx`
- Create: `extension/src/app/components/DatabankPicker.test.tsx`

- [ ] **Step 1: Write failing test**

Create `extension/src/app/components/DatabankPicker.test.tsx`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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

async function renderPicker(props: Partial<{ onClose: () => void; onPicked: (id: string) => void }> = {}) {
  const { storage } = await import('~/lib/storage');
  await storage.hydrate();
  const Picker = (await import('./DatabankPicker')).default;
  return render(
    <Picker
      open
      videoRef={{ platform: 'youtube', videoId: 'v1' }}
      onClose={props.onClose ?? (() => {})}
      onPicked={props.onPicked ?? (() => {})}
    />
  );
}

describe('DatabankPicker', () => {
  it('lists existing databanks', async () => {
    fakeStore['koko.databanks'] = [
      { id: 'a', name: 'Alpha', createdAt: '', videoRefs: [] },
      { id: 'b', name: 'Beta', createdAt: '', videoRefs: [] },
    ];
    await renderPicker();
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('clicking an existing databank adds the video and calls onPicked', async () => {
    fakeStore['koko.databanks'] = [{ id: 'a', name: 'Alpha', createdAt: '', videoRefs: [] }];
    const onPicked = vi.fn();
    await renderPicker({ onPicked });
    fireEvent.click(await screen.findByRole('button', { name: /alpha/i }));
    await waitFor(() => {
      expect(onPicked).toHaveBeenCalledWith('a');
      const dbs = fakeStore['koko.databanks'] as Array<{ videoRefs: unknown[] }>;
      expect(dbs[0].videoRefs).toHaveLength(1);
    });
  });

  it('create-new path validates the name', async () => {
    await renderPicker();
    fireEvent.click(await screen.findByRole('button', { name: /new databank/i }));
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
    expect(await screen.findByText(/required/i)).toBeInTheDocument();
  });

  it('create-new path adds the video to the new databank', async () => {
    const onPicked = vi.fn();
    await renderPicker({ onPicked });
    fireEvent.click(await screen.findByRole('button', { name: /new databank/i }));
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Fresh' } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
    await waitFor(() => {
      expect(onPicked).toHaveBeenCalledTimes(1);
      const dbs = fakeStore['koko.databanks'] as Array<{ name: string; videoRefs: unknown[] }>;
      expect(dbs).toHaveLength(1);
      expect(dbs[0].name).toBe('Fresh');
      expect(dbs[0].videoRefs).toHaveLength(1);
    });
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `cd extension && npx vitest run src/app/components/DatabankPicker.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `extension/src/app/components/DatabankPicker.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { storage } from '~/lib/storage';
import type { Databank, PlatformId } from '~/types';
import { validateName } from '~/lib/databanks';

interface Props {
  open: boolean;
  videoRef: { platform: PlatformId; videoId: string };
  onClose: () => void;
  onPicked: (databankId: string) => void;
}

export default function DatabankPicker({ open, videoRef, onClose, onPicked }: Props) {
  const [list, setList] = useState<Databank[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setList(storage.getDatabanks());
    setCreating(false);
    setName('');
    setError(null);
  }, [open]);

  if (!open) return null;

  async function pickExisting(id: string) {
    await storage.addToDatabank(id, videoRef);
    onPicked(id);
    onClose();
  }

  async function createAndPick() {
    const err = validateName(name);
    if (err) { setError(err); return; }
    const db = await storage.createDatabank(name);
    await storage.addToDatabank(db.id, videoRef);
    onPicked(db.id);
    onClose();
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="koko-card p-6 w-full max-w-md space-y-3">
        <header className="flex items-center justify-between">
          <h3 className="font-display font-semibold">Add to databank</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">×</button>
        </header>

        {!creating ? (
          <>
            {list.length === 0 ? (
              <p className="text-xs text-slate-500">No databanks yet. Create one.</p>
            ) : (
              <ul className="space-y-1 max-h-60 overflow-y-auto">
                {list.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => pickExisting(d.id)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-koko-sky/30 text-sm"
                    >
                      <strong>{d.name}</strong>
                      <span className="text-xs text-slate-400 ml-2">{d.videoRefs.length} videos</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="koko-btn w-full"
            >
              + new databank
            </button>
          </>
        ) : (
          <div className="space-y-2">
            <label htmlFor="dbn" className="text-xs text-slate-600 block">Name</label>
            <input
              id="dbn"
              autoFocus
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              className="w-full rounded-lg border border-sky-200 px-3 py-2 text-sm"
            />
            {error ? <p className="text-xs text-rose-600">{error}</p> : null}
            <div className="flex gap-2">
              <button onClick={createAndPick} className="koko-btn">Create</button>
              <button onClick={() => setCreating(false)} className="text-sm text-slate-500 px-3">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests — pass**

Run: `cd extension && npx vitest run src/app/components/DatabankPicker.test.tsx`
Expected: PASS — four cases.

- [ ] **Step 5: Commit**

```bash
git add extension/src/app/components/DatabankPicker.tsx extension/src/app/components/DatabankPicker.test.tsx
git commit -m "feat(extension): DatabankPicker modal — pick existing or create-new

Modal dialog with two paths: list of existing databanks (click to add
the video) or new-databank form with name validation. Calls
onPicked(databankId) on success and onClose on dismiss.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: AddToDatabankButton + VideoCard wiring

**Files:**
- Create: `extension/src/app/components/AddToDatabankButton.tsx`
- Modify: `extension/src/app/components/VideoCard.tsx`

- [ ] **Step 1: Implement button**

Create `extension/src/app/components/AddToDatabankButton.tsx`:

```typescript
import { useState } from 'react';
import DatabankPicker from './DatabankPicker';
import type { PlatformId } from '~/types';

interface Props {
  videoRef: { platform: PlatformId; videoId: string };
}

export default function AddToDatabankButton({ videoRef }: Props) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs px-2 py-1 rounded-full bg-koko-sky/40 hover:bg-koko-sky/70 text-slate-700"
        title="Add to databank"
      >
        {done ? '✓ saved' : '+ databank'}
      </button>
      <DatabankPicker
        open={open}
        videoRef={videoRef}
        onClose={() => setOpen(false)}
        onPicked={() => { setDone(true); setTimeout(() => setDone(false), 1500); }}
      />
    </>
  );
}
```

- [ ] **Step 2: Wire into VideoCard**

Read `extension/src/app/components/VideoCard.tsx` to find the action row (likely a flex container near the bottom of the card with buttons). Add the import:

```typescript
import AddToDatabankButton from './AddToDatabankButton';
```

Append `<AddToDatabankButton videoRef={{ platform: video.platform, videoId: video.videoId }} />` to that action row. If no action row exists, add a `<div className="flex flex-wrap gap-2 mt-2"> ... </div>` near the bottom of the card.

If `VideoCard.tsx` accepts the video as a prop with a different shape, adapt the prop access (the contract is just `{ platform: PlatformId; videoId: string }`).

- [ ] **Step 3: tsc + tests + build**

Run:
```
cd extension && npm run compile
cd extension && npm test
cd extension && npm run build 2>&1 | tail -3
```
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add extension/src/app/components/AddToDatabankButton.tsx extension/src/app/components/VideoCard.tsx
git commit -m "feat(extension): VideoCard — Add to databank action via picker modal

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: DatabanksList route

**Files:**
- Delete: `extension/src/app/routes/Databanks.tsx`
- Create: `extension/src/app/routes/DatabanksList.tsx`
- Create: `extension/src/app/routes/DatabanksList.test.tsx`

- [ ] **Step 1: Write failing test**

Create `extension/src/app/routes/DatabanksList.test.tsx`:

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

async function renderList() {
  const { storage } = await import('~/lib/storage');
  await storage.hydrate();
  const DatabanksList = (await import('./DatabanksList')).default;
  return render(<MemoryRouter><DatabanksList /></MemoryRouter>);
}

describe('DatabanksList', () => {
  it('shows empty state when no databanks', async () => {
    await renderList();
    expect(await screen.findByText(/no databanks yet/i)).toBeInTheDocument();
  });

  it('lists databanks with video counts', async () => {
    fakeStore['koko.databanks'] = [
      { id: 'a', name: 'Alpha', createdAt: '', videoRefs: [{ platform: 'youtube', videoId: 'v1', addedAt: '' }] },
    ];
    await renderList();
    expect(await screen.findByText(/alpha/i)).toBeInTheDocument();
    expect(screen.getByText(/1 video/i)).toBeInTheDocument();
  });

  it('creates a new databank inline', async () => {
    await renderList();
    fireEvent.click(await screen.findByRole('button', { name: /create databank/i }));
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
    await waitFor(() => {
      expect(screen.getByText(/hello/i)).toBeInTheDocument();
    });
  });

  it('deletes a databank', async () => {
    fakeStore['koko.databanks'] = [{ id: 'a', name: 'Alpha', createdAt: '', videoRefs: [] }];
    await renderList();
    fireEvent.click(await screen.findByRole('button', { name: /delete alpha/i }));
    await waitFor(() => {
      expect(screen.queryByText(/alpha/i)).not.toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `cd extension && npx vitest run src/app/routes/DatabanksList.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement and replace stub**

Delete `extension/src/app/routes/Databanks.tsx`.

Create `extension/src/app/routes/DatabanksList.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { storage } from '~/lib/storage';
import type { Databank } from '~/types';
import { validateName } from '~/lib/databanks';

export default function DatabanksList() {
  const [list, setList] = useState<Databank[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    setList(storage.getDatabanks());
  }

  useEffect(() => { refresh(); }, []);

  async function create() {
    const err = validateName(name);
    if (err) { setError(err); return; }
    await storage.createDatabank(name);
    setCreating(false);
    setName('');
    setError(null);
    refresh();
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this databank? Videos in it are not deleted, only the bank itself.')) return;
    await storage.deleteDatabank(id);
    refresh();
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-semibold">Databanks</h1>
          <p className="text-sm text-slate-500">Saved video collections. Click to view; add videos from any feed.</p>
        </div>
        <button onClick={() => setCreating(true)} className="koko-btn">create databank</button>
      </header>

      {creating ? (
        <section className="koko-card p-4 space-y-2">
          <label htmlFor="dbn-list" className="text-xs text-slate-600 block">Name</label>
          <input
            id="dbn-list"
            autoFocus
            value={name}
            onChange={(e) => { setName(e.target.value); setError(null); }}
            className="w-full rounded-lg border border-sky-200 px-3 py-2 text-sm"
          />
          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
          <div className="flex gap-2">
            <button onClick={create} className="koko-btn">Create</button>
            <button onClick={() => { setCreating(false); setName(''); setError(null); }} className="text-sm text-slate-500 px-3">Cancel</button>
          </div>
        </section>
      ) : null}

      {list.length === 0 ? (
        <div className="koko-card p-8 text-center text-sm text-slate-500">
          No databanks yet. Create one above to start saving videos.
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((db) => (
            <li key={db.id} className="koko-card p-4 flex items-center justify-between">
              <Link to={`/databanks/${db.id}`} className="flex-1">
                <div className="font-medium">{db.name}</div>
                <div className="text-xs text-slate-500">{db.videoRefs.length} video{db.videoRefs.length === 1 ? '' : 's'}</div>
              </Link>
              <button
                onClick={() => remove(db.id)}
                aria-label={`delete ${db.name}`}
                className="text-xs text-rose-500 hover:text-rose-700 px-2"
              >
                delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

In `App.tsx`, replace:

```typescript
import Databanks from '~/app/routes/Databanks';
// ...
<Route path="/databanks" element={<Databanks />} />
```

with:

```typescript
import DatabanksList from '~/app/routes/DatabanksList';
// ...
<Route path="/databanks" element={<DatabanksList />} />
```

(`DatabankDetail` route is added in Task 6; keep `<Route path="/databanks/:id" .../>` out of this task.)

For the test's `confirm` call, add this stub at the top of the test file inside `beforeEach`:

```typescript
vi.stubGlobal('confirm', () => true);
```

- [ ] **Step 4: Run — passes**

Run: `cd extension && npx vitest run src/app/routes/DatabanksList.test.tsx`
Expected: PASS — four cases.

- [ ] **Step 5: Commit**

```bash
git add -u  # picks up the deleted Databanks.tsx
git add extension/src/app/routes/DatabanksList.tsx extension/src/app/routes/DatabanksList.test.tsx extension/src/app/App.tsx
git commit -m "feat(extension): DatabanksList route — create/delete + list with counts

Replaces the Phase 1 stub. Deletion gated by window.confirm; creation
inline (no modal needed at the list level — modal is reserved for the
add-to-databank flow on video cards).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: DatabankDetail route

**Files:**
- Create: `extension/src/app/routes/DatabankDetail.tsx`
- Create: `extension/src/app/routes/DatabankDetail.test.tsx`
- Modify: `extension/src/app/App.tsx`

The detail page reuses the existing video grid by passing a `videoFilter` predicate. We avoid duplicating CrossChannel; instead expose its grid logic through a tiny prop.

If CrossChannel does not currently accept a filter prop, add one:

- [ ] **Step 1: Inspect CrossChannel**

Run: `grep -n "export default" extension/src/app/routes/CrossChannel.tsx`. Read the file.

If it has no filter prop, add one:

```typescript
interface Props {
  videoFilter?: (v: { platform: string; videoId: string }) => boolean;
}

export default function CrossChannel({ videoFilter }: Props = {}) {
  // existing logic, then:
  // before render, do: const filtered = videoFilter ? videos.filter(videoFilter) : videos;
}
```

If the change to CrossChannel is non-trivial (more than ~10 lines), instead extract the grid into `extension/src/app/components/VideoGrid.tsx` with the `videos: Video[]` prop, leaving CrossChannel as a thin wrapper.

Whichever path you take, keep the change in this task — don't mix it with later commits.

- [ ] **Step 2: Write failing test**

Create `extension/src/app/routes/DatabankDetail.test.tsx`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('~/app/routes/CrossChannel', () => ({
  default: ({ videoFilter }: { videoFilter?: (v: unknown) => boolean }) => (
    <div data-testid="cc">{videoFilter ? 'filtered' : 'all'}</div>
  ),
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

async function renderAt(id: string) {
  fakeStore['koko.databanks'] = [
    { id: 'd1', name: 'Alpha', createdAt: '', videoRefs: [{ platform: 'youtube', videoId: 'v1', addedAt: '' }] },
  ];
  const { storage } = await import('~/lib/storage');
  await storage.hydrate();
  const DatabankDetail = (await import('./DatabankDetail')).default;
  return render(
    <MemoryRouter initialEntries={[`/databanks/${id}`]}>
      <Routes>
        <Route path="/databanks/:id" element={<DatabankDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('DatabankDetail', () => {
  it('shows the databank name and renders CrossChannel with a filter', async () => {
    await renderAt('d1');
    expect(await screen.findByRole('heading', { name: /alpha/i })).toBeInTheDocument();
    expect(screen.getByTestId('cc')).toHaveTextContent('filtered');
  });

  it('shows a not-found state for missing databank', async () => {
    await renderAt('does-not-exist');
    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run — fails**

Run: `cd extension && npx vitest run src/app/routes/DatabankDetail.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 4: Implement**

Create `extension/src/app/routes/DatabankDetail.tsx`:

```typescript
import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { storage } from '~/lib/storage';
import { findById, refKey } from '~/lib/databanks';
import CrossChannel from '~/app/routes/CrossChannel';
import type { PlatformId } from '~/types';

export default function DatabankDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const db = useMemo(() => findById(storage.getDatabanks(), id), [id]);

  if (!db) {
    return (
      <div className="koko-card p-8 max-w-xl text-center space-y-3">
        <p className="text-sm text-slate-500">Databank not found.</p>
        <Link to="/databanks" className="text-sm text-koko-pink-deep underline">back to list</Link>
      </div>
    );
  }

  const allowed = new Set(db.videoRefs.map((r) => refKey(r)));
  const videoFilter = (v: { platform: PlatformId; videoId: string }) =>
    allowed.has(refKey({ platform: v.platform, videoId: v.videoId, addedAt: '' }));

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-semibold">{db.name}</h1>
          <p className="text-sm text-slate-500">{db.videoRefs.length} video{db.videoRefs.length === 1 ? '' : 's'} in this bank</p>
        </div>
        <Link to="/databanks" className="text-sm text-slate-500 hover:text-slate-700">← all databanks</Link>
      </header>
      <CrossChannel videoFilter={videoFilter} />
    </div>
  );
}
```

In `App.tsx`, add the route:

```typescript
import DatabankDetail from '~/app/routes/DatabankDetail';
// ...
<Route path="/databanks/:id" element={<DatabankDetail />} />
```

- [ ] **Step 5: Run — passes**

Run: `cd extension && npx vitest run src/app/routes/DatabankDetail.test.tsx`
Expected: PASS — both cases.

- [ ] **Step 6: Full verification gate**

Run:
```
cd extension && npm run compile
cd extension && npm test
cd extension && npm run build 2>&1 | tail -3
```
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add extension/src/app/routes/DatabankDetail.tsx extension/src/app/routes/DatabankDetail.test.tsx extension/src/app/App.tsx extension/src/app/routes/CrossChannel.tsx
git commit -m "feat(extension): DatabankDetail route reusing CrossChannel grid filter

Filters the existing cross-channel grid down to video refs in the
named bank. Adds a videoFilter prop to CrossChannel (or VideoGrid
extraction, see commit details). Empty state when bank id missing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Push + iteration log

**Files:**
- Modify: `remote.md`

- [ ] **Step 1: Append iteration log row**

Add to remote.md Iteration Log table:

```
| 2026-05-08 <HHMM>Z | local | <last-commit-sha> | Phase 2 — databanks subsystem (CRUD + UI + reuse of grid) shipped |
```

- [ ] **Step 2: Push**

```bash
git push origin feat/full-product-spec
```

---

## Self-Review

**1. Spec coverage:**
- §2.3 storage shape `{ id, name, createdAt, videoRefs }` → Task 1, 2. ✅
- Derived index for membership checks → Task 1 (`buildIndex`), Task 2 (`getDatabankIndex`). ✅
- List page (create/remove/count) → Task 5. ✅
- Inside-databank view reuses Videos sub-page → Task 6 via CrossChannel `videoFilter` prop. ✅
- "Add to databank" on every video card → Tasks 3, 4. ✅
- Per the spec, databanks become attachable to Persona/Writer in later phases — this plan deliberately doesn't add that wiring (YAGNI for now).

**2. Placeholder scan:** No "TBD" / "TODO". Task 6 Step 1 is conditional ("If CrossChannel has no filter prop…") — that's a real branch in execution, not a placeholder. The branch contains complete code in both arms.

**3. Type consistency:**
- `DatabankVideoRef` declared in Task 1, consumed in Tasks 2/3/4/6 — same shape (`{ platform, videoId, addedAt }`).
- Picker's `videoRef` prop excludes `addedAt` (gets stamped at write time inside `addToDatabank`) — consistent with storage layer.
- `findById`, `refKey`, `dedupeRefs`, `buildIndex` declared in Task 1, imported with same names in Task 2/6.
- `CrossChannel` filter prop signature `(v: { platform; videoId }) => boolean` matches the call sites in Task 6.

Plan is internally consistent. Ready for execution after Phase 1 ships.
