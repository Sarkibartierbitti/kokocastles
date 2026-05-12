# Phase 6 — My Channel + Hypotheses + Alarms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Phase 1 `/my-channel` ComingSoon stub with a real analytics surface over the user's own uploads. Link a YouTube channel in Settings, fetch its recent 50 uploads, cache them locally, surface them in a sortable / filterable grid that reuses Phase 3b primitives, and let the user attach **hypotheses** (named experiments) to existing videos and to the next N future uploads. A `chrome.alarms` job refreshes uploads every `refreshIntervalHours` (default 6). Auto-tag the first N new uploads detected after a hypothesis with `applyToNext > 0` is created.

**Architecture:**
- New `Hypothesis` + `OwnChannelSnapshot` types. `Hypothesis` stores `manualVideoIds`, `applyToNext`, `appliedAuto`, `seedSnapshotIds`. The seed snapshot is the set of own-channel videoIds visible at hypothesis-creation time; any videoId observed later that is not in the seed becomes a candidate for auto-tagging until `appliedAuto.length === applyToNext`.
- New storage keys `koko.hypotheses: Hypothesis[]` and `koko.ownChannelVideos: Video[]` (single key, full overwrite each refresh).
- New `lib/ownChannel.ts` with `refreshOwnChannel()` — adapter-driven (`recentUploads(channelId, 50)`), persists snapshot, runs auto-tagging pass against pending hypotheses, returns `{ added: string[], totalNow: number }`. Pure logic split out as `applyHypothesisTagging(prevSnapshot, nextSnapshot, hypotheses) → { hypotheses: Hypothesis[]; tagged: Record<hypId, string[]> }` so it can be unit tested without storage.
- New `lib/alarms.ts` with `setupOwnChannelAlarm()` — registers a `browser.alarms` entry on background-script init; alarm handler dispatches `refreshOwnChannel()`. Re-arms when `refreshIntervalHours` setting changes (Settings already has the slider; we add a `storage.onChange`-like hook **only if** WXT exposes it cheaply; otherwise the alarm cadence becomes effective on next extension reload — acceptable).
- New `/my-channel` route `MyChannelRoute.tsx`:
  - Header: linked channel info (title, subs) + "Refresh now" button + last-refresh timestamp.
  - Hypotheses panel (collapsible): list + "+ New hypothesis" → modal.
  - Videos grid: reuses the same toolbar + filter/sort primitives Phase 3b built (filter by views / outlier / likes / hypothesis; sort same). Outlier ratio computed locally against the snapshot's median views.
  - When a hypothesis is selected in the filter, hide all videos not in `manualVideoIds ∪ appliedAuto`.
- Hypothesis modal (`HypothesisModal.tsx`): name (required), description, **applyToNext** numeric input (0..20), and a tick-list of existing ownChannel videos for `manualVideoIds`. Save → `storage.upsertHypothesis(h)` (sets `seedSnapshotIds = currentOwnChannelVideos.map(v => v.videoId)` and `appliedAuto = []`).
- `Video` already exists; we just persist the array under `koko.ownChannelVideos`. No need for a new `Video` cache pattern.
- No feature flag. Auto-tag uses "first N new uploads since hypothesis creation" rule.

**Tech Stack:** Same as Phases 1–5 (Vite + React + TS + Tailwind + wxt).

**Source spec:** `docs/superpowers/specs/2026-05-07-full-product-feasibility-and-design.md` §2.5 and §4 Phase 6.

**Prerequisites:** Phases 1–5 complete. Phase 1 already wired `ownChannel` + `refreshIntervalHours` in Settings; this phase consumes them. Outlier helper `lib/outlier.ts` reused.

---

## File Structure

**New files:**
- `extension/src/lib/ownChannel.ts` — `refreshOwnChannel()` + pure `applyHypothesisTagging()`
- `extension/src/lib/__tests__/ownChannel.test.ts`
- `extension/src/lib/__tests__/storage.hypotheses.test.ts`
- `extension/src/lib/alarms.ts` — wxt/browser alarms wrapper
- `extension/src/lib/__tests__/alarms.test.ts`
- `extension/src/app/routes/MyChannelRoute.tsx`
- `extension/src/app/routes/MyChannelRoute.test.tsx`
- `extension/src/app/components/HypothesisModal.tsx`
- `extension/src/app/components/HypothesisModal.test.tsx`

**Modified files:**
- `extension/src/types.ts` — add `Hypothesis`, `OwnChannelSnapshot` (alias of `Video[]` plus updatedAt — but simpler to keep just `Video[]` + a sibling timestamp key)
- `extension/src/lib/storage.ts` — add `hypotheses` accessors (CRUD) + `ownChannelVideos` + `ownChannelRefreshedAt`
- `extension/src/entrypoints/background.ts` — call `setupOwnChannelAlarm()` on init
- `extension/src/app/routes/MyChannel.tsx` — replace stub body with `<MyChannelRoute />` (same forwarding trick used in `Ideas.tsx` and `Writer.tsx`)

---

## Task 1: Types

**Files:**
- Modify: `extension/src/types.ts`

- [ ] **Step 1: Append types**

```typescript
export interface Hypothesis {
  id: string;                  // crypto.randomUUID
  name: string;
  description: string;
  manualVideoIds: string[];    // user-ticked existing ownChannel videos
  applyToNext: number;         // 0..20
  appliedAuto: string[];       // videoIds the alarm/refresh tagged
  seedSnapshotIds: string[];   // ownChannelVideos[].videoId at creation time
  createdAt: string;           // ISO
}
```

- [ ] **Step 2: tsc clean** — `cd extension && npm run compile`

---

## Task 2: Storage helpers + tests

**Files:**
- Modify: `extension/src/lib/storage.ts`
- Create: `extension/src/lib/__tests__/storage.hypotheses.test.ts`

- [ ] **Step 1: Keys + accessors**

Add to `KEY`:
```
hypotheses: 'koko.hypotheses',
ownChannelVideos: 'koko.ownChannelVideos',
ownChannelRefreshedAt: 'koko.ownChannelRefreshedAt',
```

Append:
```typescript
getHypotheses: () => getCached<Hypothesis[]>(KEY.hypotheses, []),

upsertHypothesis: async (h: Hypothesis): Promise<void> => {
  const list = storage.getHypotheses();
  const i = list.findIndex((x) => x.id === h.id);
  const next = i >= 0 ? list.map((x, idx) => (idx === i ? h : x)) : [h, ...list];
  await writeThrough(KEY.hypotheses, next);
},

deleteHypothesis: async (id: string): Promise<void> => {
  const list = storage.getHypotheses().filter((h) => h.id !== id);
  await writeThrough(KEY.hypotheses, list);
},

getOwnChannelVideos: () => getCached<Video[]>(KEY.ownChannelVideos, []),
setOwnChannelVideos: (v: Video[]) => writeThrough(KEY.ownChannelVideos, v),

getOwnChannelRefreshedAt: () => getCached<string>(KEY.ownChannelRefreshedAt, ''),
setOwnChannelRefreshedAt: (v: string) => writeThrough(KEY.ownChannelRefreshedAt, v),
```

Add `Hypothesis, Video` to the `types` import.

- [ ] **Step 2: Tests**

Cover: default empty, upsert create/replace, delete, ownChannelVideos round-trip. ~5 cases.

- [ ] **Step 3: Run tests** — `npx vitest run src/lib/__tests__/storage.hypotheses.test.ts`

---

## Task 3: Pure tagging logic + tests

**Files:**
- Create: `extension/src/lib/ownChannel.ts`
- Create: `extension/src/lib/__tests__/ownChannel.test.ts`

- [ ] **Step 1: Pure function**

```typescript
import type { Hypothesis, Video } from '../types';

export function applyHypothesisTagging(
  prevSnapshotIds: string[],
  nextSnapshot: Video[],
  hypotheses: Hypothesis[]
): { hypotheses: Hypothesis[]; tagged: Record<string, string[]> } {
  const prev = new Set(prevSnapshotIds);
  const newlyAddedInOrder = nextSnapshot
    .map((v) => v.videoId)
    .filter((id) => !prev.has(id));
  const tagged: Record<string, string[]> = {};
  const out: Hypothesis[] = hypotheses.map((h) => {
    const remaining = Math.max(0, h.applyToNext - h.appliedAuto.length);
    if (remaining === 0) return h;
    const candidates = newlyAddedInOrder
      .filter((id) => !h.seedSnapshotIds.includes(id))
      .filter((id) => !h.appliedAuto.includes(id))
      .filter((id) => !h.manualVideoIds.includes(id))
      .slice(0, remaining);
    if (candidates.length === 0) return h;
    tagged[h.id] = candidates;
    return { ...h, appliedAuto: [...h.appliedAuto, ...candidates] };
  });
  return { hypotheses: out, tagged };
}
```

- [ ] **Step 2: Tests**

Cover at minimum:
- No hypotheses → no tagging.
- One hypothesis, applyToNext=0 → no tagging.
- One hypothesis, applyToNext=2, two new videos → both tagged.
- One hypothesis, applyToNext=2, four new videos → first two tagged in order.
- New video already in `seedSnapshotIds` → skipped (existed at creation time, not actually "new").
- Already-tagged video skipped on next pass.
- `manualVideoIds` overlap → skipped from auto.

~7 cases.

- [ ] **Step 3: Run** — `npx vitest run src/lib/__tests__/ownChannel.test.ts`

---

## Task 4: refreshOwnChannel() orchestration

**Files:**
- Modify: `extension/src/lib/ownChannel.ts`

- [ ] **Step 1: Wrapper**

```typescript
import { storage } from './storage';
import type { PlatformId } from '../types';

interface RefreshResult { added: string[]; totalNow: number; }

export async function refreshOwnChannel(): Promise<RefreshResult> {
  const own = storage.getOwnChannel();
  if (!own) throw new Error('No own channel linked.');
  const adapterMod = await import('./platforms/youtube');
  const adapter = adapterMod.youtubeAdapter; // existing named export — verify before commit
  const prev = storage.getOwnChannelVideos();
  const prevIds = prev.map((v) => v.videoId);
  const next = await adapter.recentUploads(own.channelId, 50);
  const { hypotheses, tagged } = applyHypothesisTagging(prevIds, next, storage.getHypotheses());
  // Persist hypotheses if anything actually changed.
  if (Object.keys(tagged).length > 0) {
    for (const h of hypotheses) {
      // Only upsert ones whose appliedAuto changed
      const before = storage.getHypotheses().find((x) => x.id === h.id);
      if (!before || JSON.stringify(before.appliedAuto) !== JSON.stringify(h.appliedAuto)) {
        await storage.upsertHypothesis(h);
      }
    }
  }
  await storage.setOwnChannelVideos(next);
  await storage.setOwnChannelRefreshedAt(new Date().toISOString());
  const added = next.map((v) => v.videoId).filter((id) => !prevIds.includes(id));
  return { added, totalNow: next.length };
}
```

> **Note:** Verify the actual name + shape of the YouTube adapter export in `src/lib/platforms/youtube.ts` and `src/lib/platforms/index.ts`. The plan assumes a named export — if it's a default or a factory function, adjust the import.

- [ ] **Step 2: tsc clean**

---

## Task 5: Alarms wrapper + tests

**Files:**
- Create: `extension/src/lib/alarms.ts`
- Create: `extension/src/lib/__tests__/alarms.test.ts`

- [ ] **Step 1: Wrapper**

```typescript
import { storage } from './storage';
import { refreshOwnChannel } from './ownChannel';

const ALARM_NAME = 'koko.ownChannelRefresh';

declare const browser: {
  alarms: {
    create: (name: string, opts: { periodInMinutes: number }) => void;
    clear: (name: string) => Promise<boolean>;
    onAlarm: { addListener: (cb: (a: { name: string }) => void) => void };
  };
};

export async function setupOwnChannelAlarm(): Promise<void> {
  await browser.alarms.clear(ALARM_NAME);
  const hours = storage.getRefreshIntervalHours();
  if (!storage.getOwnChannel()) return;
  browser.alarms.create(ALARM_NAME, { periodInMinutes: Math.max(15, hours * 60) });
  browser.alarms.onAlarm.addListener((a) => {
    if (a.name !== ALARM_NAME) return;
    refreshOwnChannel().catch(() => {/* swallow — surfaced next manual refresh */});
  });
}
```

(Floor of 15 min protects against runaway test settings; Chrome rejects < 1 min in MV3 anyway.)

- [ ] **Step 2: Tests**

Stub `browser.alarms` and assert:
- `setupOwnChannelAlarm()` no-ops when `ownChannel` not set.
- Calls `clear()` then `create()` with the correct period when `ownChannel` is set.
- Registers an `onAlarm` listener once.

~3 cases.

- [ ] **Step 3: Run** — `npx vitest run src/lib/__tests__/alarms.test.ts`

---

## Task 6: Background-script wire-up

**Files:**
- Modify: `extension/src/entrypoints/background.ts`

- [ ] **Step 1: Call on init**

At the end of the existing init block (or wherever `storage.hydrate()` resolves), add:
```typescript
import { setupOwnChannelAlarm } from '~/lib/alarms';
// ...
await storage.hydrate();
await setupOwnChannelAlarm();
```

If the file is using top-level await + a named init function, slot the call into the same place existing setup runs. Locate insertion point by inspecting current background.ts — do not blindly append.

- [ ] **Step 2: tsc clean + full build**

```
npm run compile && npm run build 2>&1 | tail -3
```

---

## Task 7: HypothesisModal component + tests

**Files:**
- Create: `extension/src/app/components/HypothesisModal.tsx`
- Create: `extension/src/app/components/HypothesisModal.test.tsx`

- [ ] **Step 1: Component**

Props: `{ ownVideos: Video[]; initial?: Hypothesis; onClose(): void; onSave(h: Hypothesis): Promise<void> }`.

Layout (centered dialog over translucent backdrop):
- Name input (required).
- Description textarea.
- "Apply to next N uploads" number input (0..20).
- Tick list of `ownVideos` (title + thumbnail + checkbox).
- "Cancel" + "Save".

Save constructs:
```typescript
const h: Hypothesis = {
  id: initial?.id ?? crypto.randomUUID(),
  name: name.trim(),
  description,
  manualVideoIds: tickedIds,
  applyToNext,
  appliedAuto: initial?.appliedAuto ?? [],
  seedSnapshotIds: initial?.seedSnapshotIds ?? ownVideos.map((v) => v.videoId),
  createdAt: initial?.createdAt ?? new Date().toISOString(),
};
```

- [ ] **Step 2: Tests**

Cover: renders fields, save blocked when name empty, save calls `onSave` with correct shape, ticking videos populates `manualVideoIds`, editing existing hypothesis preserves `appliedAuto` and `seedSnapshotIds`.

~5 cases.

---

## Task 8: MyChannelRoute + tests

**Files:**
- Create: `extension/src/app/routes/MyChannelRoute.tsx`
- Create: `extension/src/app/routes/MyChannelRoute.test.tsx`
- Modify: `extension/src/app/routes/MyChannel.tsx`

- [ ] **Step 1: Component**

State:
- `videos: Video[]` — from `storage.getOwnChannelVideos()`
- `hypotheses: Hypothesis[]`
- `refreshedAt: string`
- `busy: boolean` for "Refresh now"
- `hypFilter: string | null` — selected hypothesis id, or null = all
- Filter / sort UI reuses Phase 3b primitives (`lib/feedFilter.ts`). Add hypothesis filter as an extra clause: if `hypFilter` set, video must be in `manual ∪ auto` of that hypothesis.
- Outlier ratio: compute against `median(videos.map(v.viewCount))`; reuse `lib/outlier.ts` helpers.

Layout:
- Header: own channel title + "Refresh now" (calls `refreshOwnChannel()` + `refresh()`).
- Hypotheses panel with "+ New" button → `<HypothesisModal>`.
- Filter row including hypothesis dropdown.
- Video grid (reuse existing card component or, if Phase 3b's grid is a route-local component, lift it to `components/VideoGrid.tsx` in a follow-up — out of scope here; for v1, render a minimal card row to ship the feature).

Empty state when no `ownChannel`: link to `/settings`.
Empty state when ownChannel set but no videos cached: prompt to click "Refresh now".

- [ ] **Step 2: Tests**

Mock `refreshOwnChannel` via `vi.mock('~/lib/ownChannel', ...)`. Cover:
- Empty state when no ownChannel.
- Refresh button populates videos.
- Hypotheses panel renders rows.
- Hypothesis filter hides non-tagged videos.
- Delete hypothesis removes row.
- Create hypothesis via modal calls upsert.

~6 cases.

- [ ] **Step 3: Forward stub**

`MyChannel.tsx`:
```tsx
import MyChannelRoute from './MyChannelRoute';
export default function MyChannel() { return <MyChannelRoute />; }
```

---

## Task 9: Verification + commit

- [ ] **Step 1: Full verify**

```
cd extension
npm run compile
npx vitest run
npm run build 2>&1 | tail -3
```

Targets:
- tsc clean
- ~199 tests green (173 prior + 5 storage + 7 ownChannel + 3 alarms + 5 modal + 6 route = 199)
- Build clean

- [ ] **Step 2: Manual smoke** (per `docs/testing-playbook.md`)

1. Settings → link own channel by URL.
2. Open My Channel → click "Refresh now". Expect ~50 videos.
3. Sort by views; outlier flag rendered on top of channel-median videos.
4. Click "+ New hypothesis", name it "shorts test", applyToNext=2, tick one existing video, save.
5. Hypothesis appears in panel; filter dropdown shows it.
6. (Cannot easily trigger alarm during smoke — fake by editing `koko.ownChannelVideos` in DevTools storage to insert a new fake videoId at position 0, then call `refreshOwnChannel()` from the console; verify `appliedAuto` grows.)
7. Reload sidebar → hypothesis + videos persist.

- [ ] **Step 3: Commit**

```
git add extension/src/types.ts \
        extension/src/lib/storage.ts \
        extension/src/lib/__tests__/storage.hypotheses.test.ts \
        extension/src/lib/ownChannel.ts \
        extension/src/lib/__tests__/ownChannel.test.ts \
        extension/src/lib/alarms.ts \
        extension/src/lib/__tests__/alarms.test.ts \
        extension/src/entrypoints/background.ts \
        extension/src/app/components/HypothesisModal.tsx \
        extension/src/app/components/HypothesisModal.test.tsx \
        extension/src/app/routes/MyChannelRoute.tsx \
        extension/src/app/routes/MyChannelRoute.test.tsx \
        extension/src/app/routes/MyChannel.tsx \
        docs/superpowers/plans/2026-05-12-phase-6-mychannel-hypotheses.md

git commit -m "feat(extension): Phase 6 MyChannel + Hypotheses + 6h alarm

- /my-channel route: own-channel snapshot, refresh button, hypothesis CRUD + filter
- chrome.alarms registered in background (period = refreshIntervalHours, floor 15min)
- applyHypothesisTagging() pure function tags first-N new uploads since hypothesis creation
- koko.hypotheses + koko.ownChannelVideos storage; 26 new tests; tsc + build clean

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Out of scope (later phases or follow-ups)

- Refresh-interval slider live-rearms the alarm. v1 picks up new cadence on extension reload only.
- Hypothesis filter as a multi-select (currently single).
- Hypothesis archive vs. delete (delete only).
- Auto-deep-analyze new uploads on alarm.
- Lifting Phase 3b's video grid into a shared `<VideoGrid>` component (do in a Settings polish phase).
- Cross-platform own-channel (IG/TT) — Phase 9 enables platform=youtube|tiktok|instagram for ownChannel.

## Open follow-ups (file as TODOs only if hit in smoke)

- If `browser.alarms` is unavailable in Firefox MV2 (it should be — `alarms` is in manifest perms), fall back to a `setInterval` in the background script.
- If `refreshOwnChannel` exceeds the YouTube quota meter, surface the warning in the My Channel header.
