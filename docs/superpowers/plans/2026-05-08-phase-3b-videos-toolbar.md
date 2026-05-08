# Phase 3b — Videos Toolbar Power Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add filter/sort/search + count badge + extended export with field ticks + session/permanent video hiding to the Analyze Videos sub-page (CrossChannel grid). Select-mode + Top-X/Bottom-X are scoped tighter to a Phase 3c follow-up — this plan delivers the most-used toolbar features.

**Architecture:** Pure helpers (`filterRows`, `sortRows`, `applyHidden`) operate on `MergedRow[]`. New `VideoToolbar` component owns filter/sort/search state + count badge. `koko.hidden.<platform>.<videoId>` storage stamps a permanent-hide flag; session-hide lives in component state. `ExportFieldPicker` modal extends `lib/export.ts` to filter the column set.

**Tech Stack:** Same as Phases 1–3.

**Source spec:** `docs/superpowers/specs/2026-05-07-full-product-feasibility-and-design.md` §2.1.1.

**Prerequisites:** Phase 3a complete (`2fac9c1` or later).

---

## File Structure

**New files:**
- `extension/src/lib/feedFilter.ts` — pure helpers (filter/sort/search/applyHidden)
- `extension/src/lib/__tests__/feedFilter.test.ts`
- `extension/src/lib/__tests__/storage.hidden.test.ts`
- `extension/src/app/components/VideoToolbar.tsx`
- `extension/src/app/components/ExportFieldPicker.tsx`

**Modified files:**
- `extension/src/lib/storage.ts` — add `koko.hidden.<platform>.<videoId>` accessors + snapshot
- `extension/src/lib/export.ts` — accept `fields: string[]` to filter columns
- `extension/src/app/routes/CrossChannel.tsx` — wire toolbar + filter/sort/search + hidden + extended export

---

## Task 1: Storage hidden + helpers

**Files:**
- Modify: `extension/src/lib/storage.ts`
- Create: `extension/src/lib/__tests__/storage.hidden.test.ts`

- [ ] **Step 1: Test verbatim**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

const fakeStore: Record<string, unknown> = {};
(globalThis as Record<string, unknown>).browser = {
  storage: {
    local: {
      get: vi.fn(async (keys?: string | string[] | null) => {
        if (keys == null) return { ...fakeStore };
        const arr = typeof keys === 'string' ? [keys] : keys;
        const out: Record<string, unknown> = {};
        for (const k of arr) if (k in fakeStore) out[k] = fakeStore[k];
        return out;
      }),
      set: vi.fn(async (items: Record<string, unknown>) => Object.assign(fakeStore, items)),
      remove: vi.fn(async (keys: string | string[]) => {
        const arr = typeof keys === 'string' ? [keys] : keys;
        for (const k of arr) delete fakeStore[k];
      }),
    },
  },
};

beforeEach(() => {
  for (const k of Object.keys(fakeStore)) delete fakeStore[k];
  vi.resetModules();
});

describe('storage — hidden videos', () => {
  it('isHidden defaults false', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    expect(storage.isHiddenVideo('youtube', 'v1')).toBe(false);
  });

  it('hideVideo persists + isHidden reads true', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.hideVideo('youtube', 'v1');
    expect(storage.isHiddenVideo('youtube', 'v1')).toBe(true);
    expect(fakeStore['koko.hidden.youtube.v1']).toBe(true);
  });

  it('unhideVideo removes', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.hideVideo('youtube', 'v1');
    await storage.unhideVideo('youtube', 'v1');
    expect(storage.isHiddenVideo('youtube', 'v1')).toBe(false);
  });

  it('getAllHiddenKeys returns hidden refs', async () => {
    fakeStore['koko.hidden.youtube.a'] = true;
    fakeStore['koko.hidden.youtube.b'] = true;
    const { storage } = await import('../storage');
    await storage.hydrate();
    const keys = storage.getAllHiddenKeys();
    expect(keys.size).toBe(2);
    expect(keys.has('youtube::a')).toBe(true);
  });
});
```

- [ ] **Step 2: Run — fails. Then extend `storage.ts`:**

Add to `KEY` block:
```typescript
  hiddenPrefix: 'koko.hidden.',
```

Add helper:
```typescript
function hiddenKey(p: PlatformId, id: string) { return `${KEY.hiddenPrefix}${p}.${id}`; }
```

Append to storage object:
```typescript
  isHiddenVideo: (platform: PlatformId, videoId: string): boolean => {
    return cache.get(hiddenKey(platform, videoId)) === true;
  },
  hideVideo: (platform: PlatformId, videoId: string) =>
    writeThrough(hiddenKey(platform, videoId), true),
  unhideVideo: async (platform: PlatformId, videoId: string) => {
    const k = hiddenKey(platform, videoId);
    cache.delete(k);
    await browser.storage.local.remove(k);
  },
  getAllHiddenKeys: (): Set<string> => {
    const out = new Set<string>();
    for (const [k, v] of cache.entries()) {
      if (!k.startsWith(KEY.hiddenPrefix) || v !== true) continue;
      const rest = k.slice(KEY.hiddenPrefix.length);
      const dot = rest.indexOf('.');
      if (dot < 0) continue;
      out.add(`${rest.slice(0, dot)}::${rest.slice(dot + 1)}`);
    }
    return out;
  },
```

- [ ] **Step 3: Run vitest — 4/4 pass. Commit:**

```
feat(extension): storage hidden-video flag + accessors

Per-video permanent-hide flag stored as koko.hidden.<platform>.<videoId>.
Adds isHiddenVideo, hideVideo, unhideVideo, getAllHiddenKeys for the
Videos sub-page filter pipeline.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Task 2: feedFilter pure helpers

**Files:**
- Create: `extension/src/lib/feedFilter.ts`
- Create: `extension/src/lib/__tests__/feedFilter.test.ts`

- [ ] **Step 1: Implement helpers**

`extension/src/lib/feedFilter.ts`:
```typescript
export interface FeedRow {
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  viewCount: number;
  likeCount?: number;
  publishedAt?: string;
  outlierRatio?: number;
}

export type SortField = 'views' | 'likes' | 'outlier' | 'date';
export type SortDir = 'asc' | 'desc';

export interface FilterState {
  minViews?: number;
  minLikes?: number;
  minOutlier?: number;
  fromDate?: string; // ISO
  search?: string;
}

export function searchRows<T extends FeedRow>(rows: T[], q: string): T[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((r) =>
    r.title.toLowerCase().includes(needle) ||
    r.channelTitle.toLowerCase().includes(needle)
  );
}

export function filterRows<T extends FeedRow>(rows: T[], f: FilterState): T[] {
  return rows.filter((r) => {
    if (f.minViews != null && (r.viewCount ?? 0) < f.minViews) return false;
    if (f.minLikes != null && (r.likeCount ?? 0) < f.minLikes) return false;
    if (f.minOutlier != null && (r.outlierRatio ?? 0) < f.minOutlier) return false;
    if (f.fromDate && r.publishedAt && r.publishedAt < f.fromDate) return false;
    return true;
  });
}

export function sortRows<T extends FeedRow>(rows: T[], field: SortField, dir: SortDir): T[] {
  const copy = [...rows];
  const cmp = (a: T, b: T): number => {
    let av: number | string | undefined;
    let bv: number | string | undefined;
    switch (field) {
      case 'views':   av = a.viewCount;     bv = b.viewCount;     break;
      case 'likes':   av = a.likeCount ?? 0; bv = b.likeCount ?? 0; break;
      case 'outlier': av = a.outlierRatio ?? 0; bv = b.outlierRatio ?? 0; break;
      case 'date':    av = a.publishedAt ?? ''; bv = b.publishedAt ?? ''; break;
    }
    const aN = typeof av === 'number' ? av : (av ?? '').toString();
    const bN = typeof bv === 'number' ? bv : (bv ?? '').toString();
    if (aN < bN) return dir === 'asc' ? -1 : 1;
    if (aN > bN) return dir === 'asc' ? 1 : -1;
    return 0;
  };
  copy.sort(cmp);
  return copy;
}

export function applyHidden<T extends FeedRow & { platform?: string }>(
  rows: T[],
  hiddenKeys: Set<string>,
  sessionHidden: Set<string>,
  platformFallback = 'youtube',
): T[] {
  return rows.filter((r) => {
    const k = `${r.platform ?? platformFallback}::${r.videoId}`;
    return !hiddenKeys.has(k) && !sessionHidden.has(k);
  });
}
```

- [ ] **Step 2: Test verbatim**

`extension/src/lib/__tests__/feedFilter.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { searchRows, filterRows, sortRows, applyHidden, type FeedRow } from '../feedFilter';

const sample: FeedRow[] = [
  { videoId: 'a', channelId: 'C1', channelTitle: 'Alpha', title: 'cats are funny', viewCount: 100, likeCount: 10, publishedAt: '2026-01-01', outlierRatio: 0.5 },
  { videoId: 'b', channelId: 'C2', channelTitle: 'Beta', title: 'dogs are loud', viewCount: 1000, likeCount: 200, publishedAt: '2026-03-01', outlierRatio: 2.0 },
  { videoId: 'c', channelId: 'C1', channelTitle: 'Alpha', title: 'birds chirp', viewCount: 50, likeCount: 5, publishedAt: '2026-02-15', outlierRatio: 0.2 },
];

describe('searchRows', () => {
  it('matches title and channel', () => {
    expect(searchRows(sample, 'cats')).toHaveLength(1);
    expect(searchRows(sample, 'alpha')).toHaveLength(2);
  });
  it('empty query returns all', () => {
    expect(searchRows(sample, '   ')).toHaveLength(3);
  });
});

describe('filterRows', () => {
  it('minViews drops smaller', () => {
    expect(filterRows(sample, { minViews: 100 })).toHaveLength(2);
  });
  it('minOutlier filters', () => {
    expect(filterRows(sample, { minOutlier: 1.5 })).toHaveLength(1);
  });
  it('fromDate keeps newer', () => {
    expect(filterRows(sample, { fromDate: '2026-02-01' })).toHaveLength(2);
  });
});

describe('sortRows', () => {
  it('views desc', () => {
    expect(sortRows(sample, 'views', 'desc').map((r) => r.videoId)).toEqual(['b', 'a', 'c']);
  });
  it('outlier asc', () => {
    expect(sortRows(sample, 'outlier', 'asc').map((r) => r.videoId)).toEqual(['c', 'a', 'b']);
  });
  it('does not mutate input', () => {
    const before = sample.map((r) => r.videoId);
    sortRows(sample, 'views', 'desc');
    expect(sample.map((r) => r.videoId)).toEqual(before);
  });
});

describe('applyHidden', () => {
  it('drops permanent + session hidden', () => {
    const hidden = new Set(['youtube::a']);
    const session = new Set(['youtube::b']);
    expect(applyHidden(sample, hidden, session)).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run — 9 cases pass. Commit:**

```
feat(extension): pure feedFilter helpers (search/filter/sort/applyHidden)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Task 3: VideoToolbar component

**Files:**
- Create: `extension/src/app/components/VideoToolbar.tsx`

- [ ] **Step 1: Implement**

```typescript
import type { FilterState, SortField, SortDir } from '~/lib/feedFilter';

interface Props {
  total: number;
  shown: number;
  search: string;
  onSearch: (q: string) => void;
  filter: FilterState;
  onFilter: (f: FilterState) => void;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField, dir: SortDir) => void;
  onExport: () => void;
}

export default function VideoToolbar(p: Props) {
  return (
    <div className="koko-card p-3 flex flex-wrap items-center gap-2 text-xs">
      <input
        type="search"
        placeholder="search title or channel"
        value={p.search}
        onChange={(e) => p.onSearch(e.target.value)}
        className="rounded-lg border border-sky-200 px-2 py-1 text-xs w-44"
        aria-label="search videos"
      />
      <input
        type="number"
        placeholder="min views"
        value={p.filter.minViews ?? ''}
        onChange={(e) => p.onFilter({ ...p.filter, minViews: e.target.value ? Number(e.target.value) : undefined })}
        className="rounded-lg border border-sky-200 px-2 py-1 text-xs w-24"
        aria-label="min views"
      />
      <input
        type="number"
        placeholder="min likes"
        value={p.filter.minLikes ?? ''}
        onChange={(e) => p.onFilter({ ...p.filter, minLikes: e.target.value ? Number(e.target.value) : undefined })}
        className="rounded-lg border border-sky-200 px-2 py-1 text-xs w-24"
        aria-label="min likes"
      />
      <input
        type="number"
        step="0.1"
        placeholder="min outlier"
        value={p.filter.minOutlier ?? ''}
        onChange={(e) => p.onFilter({ ...p.filter, minOutlier: e.target.value ? Number(e.target.value) : undefined })}
        className="rounded-lg border border-sky-200 px-2 py-1 text-xs w-28"
        aria-label="min outlier"
      />
      <input
        type="date"
        value={p.filter.fromDate ?? ''}
        onChange={(e) => p.onFilter({ ...p.filter, fromDate: e.target.value || undefined })}
        className="rounded-lg border border-sky-200 px-2 py-1 text-xs"
        aria-label="from date"
      />
      <select
        value={`${p.sortField}:${p.sortDir}`}
        onChange={(e) => {
          const [f, d] = e.target.value.split(':') as [SortField, SortDir];
          p.onSort(f, d);
        }}
        className="rounded-lg border border-sky-200 px-2 py-1 text-xs"
        aria-label="sort by"
      >
        <option value="views:desc">views ↓</option>
        <option value="views:asc">views ↑</option>
        <option value="likes:desc">likes ↓</option>
        <option value="outlier:desc">outlier ↓</option>
        <option value="date:desc">date ↓</option>
        <option value="date:asc">date ↑</option>
      </select>
      <button
        type="button"
        onClick={p.onExport}
        className="rounded-lg bg-koko-sky/40 hover:bg-koko-sky/70 text-slate-700 px-3 py-1"
      >
        export…
      </button>
      <span className="ml-auto text-slate-500">
        Showing {p.shown} of {p.total}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: tsc clean. Commit:**

```
feat(extension): VideoToolbar — search/filter/sort/export/count-badge

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Task 4: ExportFieldPicker modal + extend export.ts

**Files:**
- Modify: `extension/src/lib/export.ts` — accept `fields?: string[]` selecting which columns to include
- Create: `extension/src/app/components/ExportFieldPicker.tsx`

- [ ] **Step 1: Read current export.ts and add field-set support**

Add at top:
```typescript
export const EXPORT_FIELDS = [
  'channelTitle',
  'videoUrl',
  'title',
  'date',
  'viewCount',
  'likeCount',
  'outlierRatio',
  'hookSpoken',
  'hookOnScreen',
  'visualFormat',
] as const;
export type ExportField = (typeof EXPORT_FIELDS)[number];
```

Modify the existing export entry-point (find `exportRows` or equivalent — read the file). Add an optional `fields?: ExportField[]` parameter that filters which columns are emitted; default to all fields. Keep behavior identical when `fields` omitted.

If file structure makes it hard to add the param without breaking callers, add a sibling function `exportRowsWithFields(rows, fields, format)` that delegates to the existing one. Document the pick.

Preserve all existing tests.

- [ ] **Step 2: Implement modal**

`extension/src/app/components/ExportFieldPicker.tsx`:
```typescript
import { useState } from 'react';
import { EXPORT_FIELDS, type ExportField } from '~/lib/export';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (fields: ExportField[], format: 'csv' | 'xlsx') => void;
}

export default function ExportFieldPicker({ open, onClose, onConfirm }: Props) {
  const [fields, setFields] = useState<Set<ExportField>>(new Set(EXPORT_FIELDS));
  const [format, setFormat] = useState<'csv' | 'xlsx'>('csv');
  if (!open) return null;
  function toggle(f: ExportField) {
    const n = new Set(fields);
    if (n.has(f)) n.delete(f); else n.add(f);
    setFields(n);
  }
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="koko-card p-6 w-full max-w-md space-y-3">
        <header className="flex items-center justify-between">
          <h3 className="font-display font-semibold">Export fields</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">×</button>
        </header>
        <ul className="space-y-1 max-h-72 overflow-y-auto">
          {EXPORT_FIELDS.map((f) => (
            <li key={f}>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={fields.has(f)} onChange={() => toggle(f)} />
                {f}
              </label>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-600">format</label>
          <select value={format} onChange={(e) => setFormat(e.target.value as 'csv' | 'xlsx')} className="rounded-lg border border-sky-200 px-2 py-1 text-xs">
            <option value="csv">csv</option>
            <option value="xlsx">xlsx</option>
          </select>
          <button
            onClick={() => onConfirm(Array.from(fields), format)}
            className="koko-btn ml-auto"
            disabled={fields.size === 0}
          >
            download
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: tsc + tests clean. Commit:**

```
feat(extension): ExportFieldPicker modal + export.ts field-set support

Field ticks default all-on per spec §2.1.1. Format select (csv/xlsx)
and a confirm button trigger export.ts with the selected subset.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Task 5: Wire toolbar + filters + hidden + export into CrossChannel

**Files:**
- Modify: `extension/src/app/routes/CrossChannel.tsx`

- [ ] **Step 1: Refactor merged pipeline**

Replace the existing `useMemo` for `merged` with a pipeline that applies search → filter → sort → applyHidden over the merged rows. Add component state:

```typescript
const [search, setSearch] = useState('');
const [filterState, setFilterState] = useState<FilterState>({});
const [sortField, setSortField] = useState<SortField>('views');
const [sortDir, setSortDir] = useState<SortDir>('desc');
const [sessionHidden, setSessionHidden] = useState<Set<string>>(new Set());
const [showExport, setShowExport] = useState(false);
```

Pipeline:
```typescript
const totalRows = useMemo<MergedRow[]>(() => {
  const rows: MergedRow[] = [];
  for (const r of results) {
    if (!r.ok) continue;
    for (const v of r.value.videos) {
      rows.push({ ...v, channelId: r.value.channelId, channelTitle: r.value.channelTitle });
    }
  }
  return rows;
}, [results]);

const visibleRows = useMemo<MergedRow[]>(() => {
  const hidden = storage.getAllHiddenKeys();
  // Map MergedRow → minimal FeedRow shape for helpers
  const rowsAsFeed = totalRows.map((r) => ({
    videoId: r.videoId,
    channelId: r.channelId,
    channelTitle: r.channelTitle,
    title: r.title,
    viewCount: r.viewCount ?? 0,
    likeCount: undefined,
    publishedAt: r.publishedAt,
    platform: 'youtube',
  }));
  let working = searchRows(rowsAsFeed, search);
  working = filterRows(working, filterState);
  working = sortRows(working, sortField, sortDir);
  working = applyHidden(working, hidden, sessionHidden);
  // Project back to MergedRow for render. Build by index map.
  const allowed = new Set(working.map((r) => `youtube::${r.videoId}`));
  const out = totalRows.filter((r) => allowed.has(`youtube::${r.videoId}`));
  // Re-sort `out` to match `working` order.
  const order = new Map(working.map((r, i) => [`youtube::${r.videoId}`, i]));
  out.sort((a, b) => (order.get(`youtube::${a.videoId}`) ?? 0) - (order.get(`youtube::${b.videoId}`) ?? 0));
  return out.slice(0, 50);
}, [totalRows, search, filterState, sortField, sortDir, sessionHidden]);
```

(Imports: add `searchRows, filterRows, sortRows, applyHidden, type FilterState, type SortField, type SortDir` from `~/lib/feedFilter`; add `storage` from `~/lib/storage`; add `VideoToolbar`, `ExportFieldPicker`.)

- [ ] **Step 2: Render toolbar + per-row hide buttons**

Above the existing list:
```tsx
<VideoToolbar
  total={totalRows.length}
  shown={visibleRows.length}
  search={search}
  onSearch={setSearch}
  filter={filterState}
  onFilter={setFilterState}
  sortField={sortField}
  sortDir={sortDir}
  onSort={(f, d) => { setSortField(f); setSortDir(d); }}
  onExport={() => setShowExport(true)}
/>
```

Modify `<li>` to include two new buttons:
```tsx
<button onClick={() => setSessionHidden(s => new Set([...s, `youtube::${v.videoId}`]))} className="text-[10px] text-slate-400 hover:text-slate-600 px-1" aria-label={`hide ${v.title} this session`}>hide</button>
<button onClick={async () => { await storage.hideVideo('youtube', v.videoId); setSessionHidden(s => new Set([...s, `youtube::${v.videoId}`])); }} className="text-[10px] text-rose-500 hover:text-rose-700 px-1" aria-label={`hide ${v.title} permanently`}>hide∞</button>
```

(Place them in the row's right column.)

- [ ] **Step 3: Wire export**

Add at end of component:
```tsx
<ExportFieldPicker
  open={showExport}
  onClose={() => setShowExport(false)}
  onConfirm={(fields, format) => {
    // Adapt visibleRows → existing exporter's expected (Video, DeepAnalysis|null)[] shape.
    // Since we lack DeepAnalysis here, pass null analysis per row.
    const records = visibleRows.map((v) => ({
      video: {
        platform: 'youtube' as const,
        videoId: v.videoId,
        channelId: v.channelId,
        channelTitle: v.channelTitle,
        title: v.title,
        publishedAt: v.publishedAt ?? '',
        viewCount: v.viewCount ?? 0,
        thumbnailUrl: v.thumbnailUrl,
      },
      analysis: null,
    }));
    // Import dynamically to keep bundle small.
    import('~/lib/export').then(({ exportToFile }) => exportToFile(records, fields, format));
    setShowExport(false);
  }}
/>
```

If `exportToFile` is not the actual exported name, grep `extension/src/lib/export.ts` for the entry point function and adapt — the exporter must accept the records, fields, and format. If only one exporter exists and it doesn't take `fields`, add a thin wrapper in this same task that filters the column set before delegating.

- [ ] **Step 4: Verification gate**

```
cd extension && npm run compile
cd extension && npm test
cd extension && npm run build 2>&1 | tail -3
```

- [ ] **Step 5: Commit**

```
feat(extension): CrossChannel — search/filter/sort/hide/export power features

Wires VideoToolbar + ExportFieldPicker + per-row hide buttons. Pipeline:
search → filter → sort → applyHidden, then top 50. Permanent hide
persists via storage.hideVideo; session hide is component state.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Task 6: Push + iteration log

```
| 2026-05-08 <HHMM>Z | local | <sha> | Phase 3b — Videos toolbar (search/filter/sort/hide/export) shipped |
```

Commit + `git push origin feat/full-product-spec`.

---

## Self-Review

- §2.1.1 Add video URL → **deferred** (Phase 3c — needs URL parser + adapter dispatch + append-to-feed surface; out of scope for this commit).
- §2.1.1 Bulk analyze 10–30 → **deferred** (Phase 3c — needs analysis-job pipeline integration).
- §2.1.1 Filter / Sort / Search / Count badge / Export with field ticks / Hide → all covered.
- §2.1.1 Select mode + Top X / Bottom X → **deferred** (Phase 3c — state machine + multi-select UI).
- Outlier setting from Phase 1 — used by `outlierRatio` filter; row outlier computation lives in Phase 3c when bulk-analyze populates it.

Type consistency: `FeedRow` shape used throughout; `MergedRow` adapted to FeedRow at pipeline edges.

Plan ready.
