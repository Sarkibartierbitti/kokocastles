# Phase A + B: Active-Tab Scrape + Request Activity Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add (A) sidebar UI that scrapes the user's currently-open YouTube tab — channel pages, search results — so the watchlist + niche scans don't burn YouTube Data API quota and work offline of an API key, and (B) a persistent activity panel at the sidebar bottom that surfaces every in-flight LLM call (provider, model, task, latency, status, retry) with a running cost tally.

**Architecture:** Three new pieces. (1) New content scripts on `youtube.com/@*`, `/c/*`, `/channel/*`, `/results` — they scrape page DOM / `ytInitialData` and message the background. (2) Background gains a `getActiveTab` query plus a `scrape-active-tab` message handler that injects a fresh script into the current tab. (3) Sidebar gains an "Import from this tab" surface (Watchlist + Channel routes) and an `<ActivityPanel>` drawer fixed at sidebar bottom, fed by a `~/lib/activity.ts` event store that `callLLM` writes to. Sidebar-position-on-right is documented as a Firefox user setting (one-click via right-click sidebar → "Move Sidebar to Right"); extension cannot programmatically force it. An optional fallback detached-popup-window trigger lives behind a toggle in Settings.

**Tech Stack:** wxt + React 19 + TS, no new runtime deps. Activity store is a plain in-memory event emitter + `browser.storage.local` ring buffer (latest 50). Pricing-per-token estimator is a static lookup table; missing models shown as `~?$` (unknown).

---

## Repository Structure (delta vs current)

```
extension/src/
  app/
    components/
      ActivityPanel.tsx              NEW — fixed-bottom drawer
      ActiveTabCard.tsx              NEW — "Import from this tab" surface
    routes/
      Watchlist.tsx                  MOD — embeds <ActiveTabCard /> above the watchlist grid
      Channel.tsx                    MOD — adds "Refresh from active tab" button when current tab matches the channel
  entrypoints/
    youtube-channel.content.ts       NEW — runs on /@*, /channel/*, /c/*, /user/*
    youtube-search.content.ts        NEW — runs on /results
    background.ts                    MOD — adds active-tab handlers + activity-bus rebroadcast
  lib/
    activity.ts                      NEW — event store, pricing estimator
    active-tab-bridge.ts             NEW — sidebar-side helpers to query + scrape active tab
    messaging.ts                     MOD — adds new message variants
    llm/
      index.ts                       MOD — callLLM emits activity events
```

Plan does NOT touch routes / components beyond the two listed above. The activity panel mounts once at `App.tsx` root, sibling to `<main>`.

---

## Architectural Notes

**Activity bus.** `~/lib/activity.ts` exposes `activity.subscribe(cb)`, `activity.start({task, provider, model})` returning a token, `activity.done(token, {tokensIn, tokensOut})`, `activity.error(token, message)`. Subscribers are React components. `callLLM` calls these around its `adapter.call`. Recent 50 events flushed to `browser.storage.local` so reload preserves history. Costs estimated from a static `MODEL_PRICING` map (USD per 1M input/output tokens for the dozen most-used models; rest = unknown).

**Active-tab detection.** Background listens for `browser.tabs.onUpdated` + `onActivated`. On change, it inspects the active tab URL. If it matches a recognized YT pattern (channel handle / channel ID / search), it caches `{kind, identifier, title, tabId}` in storage under `koko.activeTab` (volatile — no persistence intended; just fast read). Sidebar subscribes to `browser.storage.onChanged` for `koko.activeTab` to re-render the active-tab card live.

**Active-tab scrape.** When user clicks "Import from this tab", sidebar messages background `{type: 'scrape-active-tab', kind}`. Background sends `chrome.tabs.sendMessage(tabId, {type: 'scrape', kind})` to the content script already running there. Content script does the DOM read (channel uploads grid via `ytInitialData.contents.twoColumnBrowseResultsRenderer....` or fallback DOM walk), returns parsed data. Background relays to sidebar.

**Sidebar position.** Firefox sidebar position is global (user pref `sidebar.position_start`). Extension cannot force right-side. Plan: explicit Help section telling user "right-click the sidebar header → Move Sidebar to Right" (Firefox 106+). Adds a Settings toggle "Open in detached panel on right (alternative to sidebar)" that, when on, replaces the toolbar popup behavior with a `windows.create({type: 'popup', left: screen.width-460, ...})` — no sidebar at all. Default off.

**No new deps.** Pricing table inlined. Event bus = ~30 lines of plain TS. Activity panel uses existing Tailwind utilities.

---

## Task List

### Task 0: Pre-flight

**Files:** none.

- [ ] **Step 1: Confirm pivot is shipped**

```bash
cd /home/jj_d/Documents/everything/work/claude_projects/kokocastles
git log --oneline -3
git status --short
cd extension
npm test 2>&1 | tail -3
npm run compile 2>&1 | tail -3
npm run build 2>&1 | tail -3
```

Expected: extension pivot commits at HEAD (`1602fb8` or descendant), 48/48 tests, tsc clean, build clean.

- [ ] **Step 2: Tag pre-Phase-AB checkpoint**

```bash
cd /home/jj_d/Documents/everything/work/claude_projects/kokocastles
git tag pre-phase-AB
git push origin pre-phase-AB
```

---

### Task 1: Activity store core (`~/lib/activity.ts`)

**Files:**
- Create: `extension/src/lib/activity.ts`
- Create: `extension/src/lib/__tests__/activity.test.ts`

The store is provider-agnostic, framework-agnostic, no React imports.

- [ ] **Step 1: Write failing tests**

`extension/src/lib/__tests__/activity.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const fakeStore: Record<string, unknown> = {};
(globalThis as Record<string, unknown>).browser = {
  storage: {
    local: {
      get: vi.fn(async (k?: string | string[] | null) => {
        if (k == null) return { ...fakeStore };
        const arr = typeof k === 'string' ? [k] : k;
        const out: Record<string, unknown> = {};
        for (const key of arr) if (key in fakeStore) out[key] = fakeStore[key];
        return out;
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(fakeStore, items);
      }),
      remove: vi.fn(async () => {}),
    },
  },
};

beforeEach(() => {
  for (const k of Object.keys(fakeStore)) delete fakeStore[k];
  vi.clearAllMocks();
  vi.resetModules();
});

describe('activity', () => {
  it('start returns a token; done updates entry; events broadcast to subscribers', async () => {
    const { activity } = await import('../activity');
    const events: string[] = [];
    activity.subscribe((evt) => events.push(evt.kind));
    const token = activity.start({ task: 'triage', provider: 'anthropic', model: 'claude-haiku-4-5' });
    activity.done(token, { tokensIn: 100, tokensOut: 50 });
    const list = activity.list();
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe('done');
    expect(list[0].tokensIn).toBe(100);
    expect(events).toEqual(['start', 'done']);
  });

  it('error marks entry failed with message', async () => {
    const { activity } = await import('../activity');
    const token = activity.start({ task: 'deep', provider: 'openai', model: 'gpt-5.4' });
    activity.error(token, 'rate limited');
    expect(activity.list()[0]).toMatchObject({ status: 'error', error: 'rate limited' });
  });

  it('keeps at most 50 entries (ring buffer)', async () => {
    const { activity } = await import('../activity');
    for (let i = 0; i < 60; i++) {
      const t = activity.start({ task: 'triage', provider: 'anthropic', model: 'claude-haiku-4-5' });
      activity.done(t, {});
    }
    expect(activity.list().length).toBeLessThanOrEqual(50);
  });

  it('estimates USD cost when model+tokens known', async () => {
    const { activity, estimateCost } = await import('../activity');
    expect(estimateCost('claude-haiku-4-5', 1_000_000, 0)).toBeCloseTo(1.0, 1);
    expect(estimateCost('claude-haiku-4-5', 0, 1_000_000)).toBeCloseTo(5.0, 1);
    expect(estimateCost('unknown-model', 100, 100)).toBeNull();
    void activity;
  });

  it('hydrate restores recent entries from storage', async () => {
    fakeStore['koko.activity'] = [
      { id: 'x', task: 'triage', provider: 'anthropic', model: 'claude-haiku-4-5',
        status: 'done', startedAt: 0, finishedAt: 1 },
    ];
    const { activity } = await import('../activity');
    await activity.hydrate();
    expect(activity.list()).toHaveLength(1);
    expect(activity.list()[0].id).toBe('x');
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
cd extension
npm test -- activity
```

Expected: import error (no `../activity` yet).

- [ ] **Step 3: Implement `extension/src/lib/activity.ts`**

```ts
import type { LLMTask } from '~/types';

export type ActivityStatus = 'in-flight' | 'done' | 'error';

export interface ActivityEntry {
  id: string;
  task: LLMTask;
  provider: string;
  model: string;
  status: ActivityStatus;
  startedAt: number;
  finishedAt?: number;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number | null;
  error?: string;
}

export type ActivityEvent =
  | { kind: 'start'; entry: ActivityEntry }
  | { kind: 'done'; entry: ActivityEntry }
  | { kind: 'error'; entry: ActivityEntry };

type Listener = (e: ActivityEvent) => void;

declare const browser: {
  storage: { local: { get: (k?: string | string[] | null) => Promise<Record<string, unknown>>; set: (i: Record<string, unknown>) => Promise<void> } };
};

const PRICING_USD_PER_1M: Record<string, { in: number; out: number }> = {
  'claude-haiku-4-5': { in: 1.0, out: 5.0 },
  'claude-sonnet-4-6': { in: 3.0, out: 15.0 },
  'claude-opus-4-7': { in: 15.0, out: 75.0 },
  'gpt-5.4-mini': { in: 0.15, out: 0.6 },
  'gpt-5.4': { in: 2.5, out: 10.0 },
  'gpt-4.1': { in: 2.0, out: 8.0 },
  'gemini-2.5-flash': { in: 0.3, out: 2.5 },
  'gemini-2.5-pro': { in: 1.25, out: 10.0 },
  'gemini-3-pro': { in: 2.0, out: 12.0 },
  'deepseek-v4-pro': { in: 0.435, out: 0.87 },
  'kimi-k2': { in: 0.6, out: 2.5 },
  'glm-4.6': { in: 0.6, out: 2.2 },
};

export function estimateCost(model: string, tokensIn: number, tokensOut: number): number | null {
  const p = PRICING_USD_PER_1M[model];
  if (!p) return null;
  return (tokensIn * p.in + tokensOut * p.out) / 1_000_000;
}

const KEY = 'koko.activity';
const MAX = 50;

const entries = new Map<string, ActivityEntry>();
const order: string[] = [];
const listeners = new Set<Listener>();

function emit(e: ActivityEvent) {
  for (const l of listeners) l(e);
}

function persist(): void {
  const arr = order.map((id) => entries.get(id)).filter(Boolean);
  void browser.storage.local.set({ [KEY]: arr });
}

function newId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const activity = {
  async hydrate(): Promise<void> {
    const r = await browser.storage.local.get(KEY);
    const arr = (r[KEY] as ActivityEntry[] | undefined) ?? [];
    for (const e of arr.slice(-MAX)) {
      entries.set(e.id, e);
      order.push(e.id);
    }
  },

  start(args: { task: LLMTask; provider: string; model: string }): string {
    const id = newId();
    const entry: ActivityEntry = {
      id,
      task: args.task,
      provider: args.provider,
      model: args.model,
      status: 'in-flight',
      startedAt: Date.now(),
    };
    entries.set(id, entry);
    order.push(id);
    while (order.length > MAX) {
      const old = order.shift();
      if (old) entries.delete(old);
    }
    emit({ kind: 'start', entry });
    persist();
    return id;
  },

  done(id: string, args: { tokensIn?: number; tokensOut?: number }): void {
    const entry = entries.get(id);
    if (!entry) return;
    entry.status = 'done';
    entry.finishedAt = Date.now();
    entry.tokensIn = args.tokensIn;
    entry.tokensOut = args.tokensOut;
    if (args.tokensIn != null && args.tokensOut != null) {
      entry.costUsd = estimateCost(entry.model, args.tokensIn, args.tokensOut);
    }
    emit({ kind: 'done', entry });
    persist();
  },

  error(id: string, message: string): void {
    const entry = entries.get(id);
    if (!entry) return;
    entry.status = 'error';
    entry.finishedAt = Date.now();
    entry.error = message;
    emit({ kind: 'error', entry });
    persist();
  },

  list(): ActivityEntry[] {
    return order.map((id) => entries.get(id)!).filter(Boolean);
  },

  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },

  clear(): void {
    entries.clear();
    order.length = 0;
    persist();
  },
};
```

- [ ] **Step 4: Run tests, expect PASS**

```bash
cd extension
npm test -- activity
```

Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add extension/src/lib/activity.ts extension/src/lib/__tests__/activity.test.ts
git commit -m "feat(extension): activity event store with pricing estimator + ring buffer"
```

---

### Task 2: Wire `callLLM` to emit activity events

**Files:**
- Modify: `extension/src/lib/llm/index.ts`

`callLLM` currently builds the adapter and calls `adapter.call<T>(opts)`. Wrap in start/done/error.

- [ ] **Step 1: Read current `index.ts`**

(Implementer: read the file, confirm structure matches plan delta below.)

- [ ] **Step 2: Apply diff to `callLLM`**

Replace the body of `callLLM` after the model resolution. Currently:

```ts
const adapter = adapterFor(provider, apiKey);
const opts: CallOptions<T> = { ... };
return adapter.call<T>(opts);
```

Change to:

```ts
const adapter = adapterFor(provider, apiKey);
const opts: CallOptions<T> = { ... };  // unchanged construction
const token = activity.start({ task: args.task, provider, model });
try {
  const result = await adapter.call<T>(opts);
  // tokens unknown for now — adapters don't yet bubble usage. Pass undefined.
  activity.done(token, {});
  return result;
} catch (e) {
  activity.error(token, e instanceof Error ? e.message : String(e));
  throw e;
}
```

Add import at top of file:

```ts
import { activity } from '../activity';
```

- [ ] **Step 3: tsc + tests**

```bash
cd extension
npm run compile
npm test
```

Expected: clean, 53 tests (48 prior + 5 activity).

- [ ] **Step 4: Commit**

```bash
git add extension/src/lib/llm/index.ts
git commit -m "feat(extension): callLLM emits activity start/done/error"
```

---

### Task 3: ActivityPanel React component

**Files:**
- Create: `extension/src/app/components/ActivityPanel.tsx`
- Modify: `extension/src/app/App.tsx` (mount panel + hydrate activity on boot)

- [ ] **Step 1: Create `ActivityPanel.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { activity, type ActivityEntry } from '~/lib/activity';

export default function ActivityPanel() {
  const [entries, setEntries] = useState<ActivityEntry[]>(activity.list());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const unsub = activity.subscribe(() => setEntries(activity.list()));
    return () => unsub();
  }, []);

  const inFlight = entries.filter((e) => e.status === 'in-flight').length;
  const totalCost = entries.reduce((acc, e) => acc + (e.costUsd ?? 0), 0);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-sky-200 bg-white/90 backdrop-blur shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-3 py-2 text-xs flex items-center justify-between"
      >
        <span className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${inFlight > 0 ? 'bg-sky-500 animate-pulse' : entries.some((e) => e.status === 'error') ? 'bg-rose-500' : 'bg-slate-300'}`} />
          activity {inFlight > 0 ? `· ${inFlight} in flight` : `· ${entries.length}`}
          {totalCost > 0 ? <span className="text-slate-500">· ~${totalCost.toFixed(3)}</span> : null}
        </span>
        <span className="text-slate-400">{open ? '▾' : '▸'}</span>
      </button>
      {open ? (
        <div className="max-h-64 overflow-auto px-3 py-2 space-y-1 text-xs">
          {entries.length === 0 ? (
            <div className="text-slate-400 text-center py-2">no LLM calls yet</div>
          ) : (
            [...entries].reverse().map((e) => (
              <div key={e.id} className={`flex items-center gap-2 rounded px-2 py-1 ${
                e.status === 'in-flight' ? 'bg-sky-50' : e.status === 'error' ? 'bg-rose-50' : 'bg-slate-50'
              }`}>
                <span className="font-mono text-slate-500">{e.task}</span>
                <span className="text-slate-700">{e.provider}/{e.model}</span>
                <span className="ml-auto text-slate-400">
                  {e.status === 'in-flight' && '⋯'}
                  {e.status === 'done' && (
                    e.costUsd != null ? `$${e.costUsd.toFixed(4)}` : 'done'
                  )}
                  {e.status === 'error' && <span title={e.error}>✗</span>}
                </span>
              </div>
            ))
          )}
          {entries.length > 0 ? (
            <button
              type="button"
              onClick={() => activity.clear()}
              className="koko-btn-ghost text-xs w-full mt-1"
            >
              clear history
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Mount panel + hydrate in `App.tsx`**

In `extension/src/app/App.tsx`, add imports:

```tsx
import ActivityPanel from '~/app/components/ActivityPanel';
import { activity } from '~/lib/activity';
```

Adjust hydrate effect to also hydrate activity:

```tsx
useEffect(() => {
  Promise.all([storage.hydrate(), activity.hydrate()]).then(() => setReady(true));
}, []);
```

Add `<ActivityPanel />` inside the root `<div className="min-h-screen ...">`, AFTER `<main>`. Also add `pb-12` to the same root div to leave room for the fixed-bottom panel header (panel header is ~36px).

- [ ] **Step 3: Build + smoke**

```bash
cd extension
npm run compile
npm test
npm run build
```

Expected: clean. Manually load in Firefox: open sidebar, see activity bar at bottom showing "activity · 0". Trigger a Triage hooks scan from Channel page (after pasting valid keys) — bar shows "activity · N in flight" with sky-blue pulsing dot, then settles to total + cost.

- [ ] **Step 4: Commit**

```bash
git add extension/src/app/components/ActivityPanel.tsx extension/src/app/App.tsx
git commit -m "feat(extension): bottom-fixed activity panel with cost tally"
```

---

### Task 4: Active-tab detector in background

**Files:**
- Modify: `extension/src/lib/messaging.ts`
- Modify: `extension/src/entrypoints/background.ts`

Background already routes transcript messages. Add: track active tab + expose query.

- [ ] **Step 1: Extend message contract**

Edit `extension/src/lib/messaging.ts`. Append:

```ts
export type ActiveTabKind = 'channel' | 'search' | 'video' | 'unknown';

export interface ActiveTabInfo {
  kind: ActiveTabKind;
  url: string;
  title: string;
  /** For channel: handle or channel ID. For search: query. For video: videoId. */
  identifier: string;
  tabId: number;
}

// Extend SidebarToBg union:
//   | { type: 'get-active-tab' }
//   | { type: 'scrape-active-tab' }
// Extend BgToSidebar union:
//   | { type: 'active-tab'; info: ActiveTabInfo | null }
//   | { type: 'scrape-result'; payload: ScrapeResult }
//   | { type: 'scrape-error'; message: string }

export type ScrapeResult =
  | { kind: 'channel'; videos: ScrapedVideo[]; channelTitle: string; channelId: string }
  | { kind: 'search'; results: ScrapedSearchResult[]; query: string };

export interface ScrapedVideo {
  videoId: string;
  title: string;
  viewCount: number | null;
  publishedAtRelative: string;
  thumbnailUrl: string;
  durationSec: number | null;
}

export interface ScrapedSearchResult {
  videoId: string;
  channelId: string | null;
  channelTitle: string;
  title: string;
  thumbnailUrl: string;
}

// Extend ContentToBg union:
//   | { type: 'scraped-channel'; channelId: string; channelTitle: string; videos: ScrapedVideo[] }
//   | { type: 'scraped-search'; query: string; results: ScrapedSearchResult[] }
//   | { type: 'scrape-failed'; message: string }
```

Update the existing union type definitions to include the new variants. Concretely the file becomes:

```ts
import type { TranscriptSegment } from '~/types';

export type ActiveTabKind = 'channel' | 'search' | 'video' | 'unknown';

export interface ActiveTabInfo {
  kind: ActiveTabKind;
  url: string;
  title: string;
  identifier: string;
  tabId: number;
}

export interface ScrapedVideo {
  videoId: string;
  title: string;
  viewCount: number | null;
  publishedAtRelative: string;
  thumbnailUrl: string;
  durationSec: number | null;
}

export interface ScrapedSearchResult {
  videoId: string;
  channelId: string | null;
  channelTitle: string;
  title: string;
  thumbnailUrl: string;
}

export type ScrapeResult =
  | { kind: 'channel'; videos: ScrapedVideo[]; channelTitle: string; channelId: string }
  | { kind: 'search'; results: ScrapedSearchResult[]; query: string };

export type SidebarToBg =
  | { type: 'fetch-transcript'; videoId: string }
  | { type: 'get-active-tab' }
  | { type: 'scrape-active-tab' }
  | { type: 'ping' };

export type BgToSidebar =
  | { type: 'transcript-ok'; segments: TranscriptSegment[] }
  | { type: 'transcript-err'; message: string }
  | { type: 'active-tab'; info: ActiveTabInfo | null }
  | { type: 'scrape-result'; payload: ScrapeResult }
  | { type: 'scrape-error'; message: string }
  | { type: 'pong' };

export type ContentToBg =
  | { type: 'transcript-payload'; videoId: string; segments: TranscriptSegment[] }
  | { type: 'transcript-error'; videoId: string; message: string }
  | { type: 'scraped-channel'; channelId: string; channelTitle: string; videos: ScrapedVideo[] }
  | { type: 'scraped-search'; query: string; results: ScrapedSearchResult[] }
  | { type: 'scrape-failed'; message: string };

export type AnyMessage = SidebarToBg | BgToSidebar | ContentToBg;
```

- [ ] **Step 2: Implement active-tab tracker in `background.ts`**

Add at top of `background.ts` body (inside `defineBackground(() => { ... })`):

```ts
const ACTIVE_TAB_KEY = 'koko.activeTab';

function classifyUrl(url: string, title: string, tabId: number): ActiveTabInfo | null {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return null; }
  if (!parsed.hostname.endsWith('youtube.com')) return null;
  const path = parsed.pathname;
  // /@handle, /@handle/videos, /@handle/featured
  const handleMatch = path.match(/^\/@([^/]+)/);
  if (handleMatch) return { kind: 'channel', identifier: '@' + handleMatch[1], url, title, tabId };
  // /channel/UCxxx
  const channelMatch = path.match(/^\/channel\/([^/]+)/);
  if (channelMatch) return { kind: 'channel', identifier: channelMatch[1], url, title, tabId };
  // /c/Name or /user/Name
  const altMatch = path.match(/^\/(?:c|user)\/([^/]+)/);
  if (altMatch) return { kind: 'channel', identifier: altMatch[1], url, title, tabId };
  // /results?search_query=...
  if (path === '/results') {
    const q = parsed.searchParams.get('search_query') ?? '';
    if (q) return { kind: 'search', identifier: q, url, title, tabId };
  }
  // /watch?v=...
  if (path === '/watch') {
    const v = parsed.searchParams.get('v');
    if (v) return { kind: 'video', identifier: v, url, title, tabId };
  }
  return null;
}

async function refreshActiveTab(): Promise<void> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null || !tab.url) {
    await browser.storage.local.set({ [ACTIVE_TAB_KEY]: null });
    return;
  }
  const info = classifyUrl(tab.url, tab.title ?? '', tab.id);
  await browser.storage.local.set({ [ACTIVE_TAB_KEY]: info });
}

browser.tabs.onActivated.addListener(() => { void refreshActiveTab(); });
browser.tabs.onUpdated.addListener((_id, change) => {
  if (change.url || change.title) void refreshActiveTab();
});
void refreshActiveTab();
```

Add corresponding handlers in the existing `onMessage` listener:

```ts
if (msg.type === 'get-active-tab') {
  refreshActiveTab().then(() =>
    browser.storage.local.get(ACTIVE_TAB_KEY).then((r) =>
      sendResponse({ type: 'active-tab', info: (r[ACTIVE_TAB_KEY] as ActiveTabInfo | null) ?? null })
    )
  );
  return true;
}

if (msg.type === 'scrape-active-tab') {
  handleScrapeActiveTab().then(
    (payload) => sendResponse({ type: 'scrape-result', payload }),
    (err: string) => sendResponse({ type: 'scrape-error', message: err }),
  );
  return true;
}

if (msg.type === 'scraped-channel') {
  resolveActiveScrape({ kind: 'channel', videos: msg.videos, channelTitle: msg.channelTitle, channelId: msg.channelId });
  return false;
}

if (msg.type === 'scraped-search') {
  resolveActiveScrape({ kind: 'search', results: msg.results, query: msg.query });
  return false;
}

if (msg.type === 'scrape-failed') {
  rejectActiveScrape(msg.message);
  return false;
}
```

Add `handleScrapeActiveTab` + helpers below the existing `handleFetchTranscript`:

```ts
let activeScrapeResolve: ((p: ScrapeResult) => void) | null = null;
let activeScrapeReject: ((e: string) => void) | null = null;
let activeScrapeTimer: ReturnType<typeof setTimeout> | null = null;

function resolveActiveScrape(p: ScrapeResult) {
  if (activeScrapeTimer) clearTimeout(activeScrapeTimer);
  activeScrapeResolve?.(p);
  activeScrapeResolve = null;
  activeScrapeReject = null;
}

function rejectActiveScrape(msg: string) {
  if (activeScrapeTimer) clearTimeout(activeScrapeTimer);
  activeScrapeReject?.(msg);
  activeScrapeResolve = null;
  activeScrapeReject = null;
}

async function handleScrapeActiveTab(): Promise<ScrapeResult> {
  const r = await browser.storage.local.get(ACTIVE_TAB_KEY);
  const info = (r[ACTIVE_TAB_KEY] as ActiveTabInfo | null) ?? null;
  if (!info || info.kind === 'unknown' || info.kind === 'video') {
    throw new Error('active tab is not a YouTube channel or search page');
  }
  await browser.tabs.sendMessage(info.tabId, { type: 'scrape', kind: info.kind });
  return new Promise<ScrapeResult>((resolve, reject) => {
    activeScrapeResolve = resolve;
    activeScrapeReject = reject;
    activeScrapeTimer = setTimeout(() => {
      activeScrapeResolve = null;
      activeScrapeReject = null;
      reject('scrape timeout (10s) — content script did not respond');
    }, 10_000);
  });
}
```

Update import of `ActiveTabInfo`, `ScrapeResult` from `~/lib/messaging` at the top.

- [ ] **Step 3: Build + tsc**

```bash
cd extension
npm run compile
npm run build
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add extension/src/lib/messaging.ts extension/src/entrypoints/background.ts
git commit -m "feat(extension): background tracks active YT tab + handles scrape requests"
```

---

### Task 5: Channel content script — scrape uploads from `youtube.com/@*`

**Files:**
- Create: `extension/src/entrypoints/youtube-channel.content.ts`

- [ ] **Step 1: Implement**

```ts
import { defineContentScript } from 'wxt/utils/define-content-script';
import type { ContentToBg, ScrapedVideo } from '~/lib/messaging';

export default defineContentScript({
  matches: [
    'https://www.youtube.com/@*',
    'https://www.youtube.com/channel/*',
    'https://www.youtube.com/c/*',
    'https://www.youtube.com/user/*',
  ],
  runAt: 'document_idle',
  main() {
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const msg = message as { type: string; kind?: string };
      if (msg.type !== 'scrape' || msg.kind !== 'channel') return false;
      scrapeChannel().then(
        (data) => {
          const reply: ContentToBg = {
            type: 'scraped-channel',
            channelId: data.channelId,
            channelTitle: data.channelTitle,
            videos: data.videos,
          };
          browser.runtime.sendMessage(reply).catch(() => {});
        },
        (err: Error) => {
          const reply: ContentToBg = { type: 'scrape-failed', message: err.message };
          browser.runtime.sendMessage(reply).catch(() => {});
        },
      );
      sendResponse({ type: 'scrape-ack' });
      return false;
    });
  },
});

interface ChannelData { channelId: string; channelTitle: string; videos: ScrapedVideo[] }

async function scrapeChannel(): Promise<ChannelData> {
  const data = await readYtInitialData();
  if (!data) throw new Error('ytInitialData missing on this page');

  const channelId = data?.metadata?.channelMetadataRenderer?.externalId
    ?? data?.header?.c4TabbedHeaderRenderer?.channelId
    ?? '';
  const channelTitle = data?.metadata?.channelMetadataRenderer?.title
    ?? data?.header?.c4TabbedHeaderRenderer?.title
    ?? '';
  if (!channelId) throw new Error('could not extract channelId');

  const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs ?? [];
  let videoTab: unknown = null;
  for (const t of tabs) {
    const ttl = (t as Record<string, unknown>)?.tabRenderer as Record<string, unknown> | undefined;
    if (ttl && (ttl as { title?: string }).title === 'Videos') {
      videoTab = ttl;
      break;
    }
  }
  // Fallback: first tab with content if "Videos" wasn't matched
  if (!videoTab) {
    for (const t of tabs) {
      const ttl = (t as Record<string, unknown>)?.tabRenderer as Record<string, unknown> | undefined;
      if (ttl?.content) { videoTab = ttl; break; }
    }
  }
  if (!videoTab) throw new Error('no videos tab found in channel page');

  const items = extractVideoItems(videoTab);
  const videos: ScrapedVideo[] = items.map(parseVideoRenderer).filter((v): v is ScrapedVideo => v !== null);
  return { channelId, channelTitle, videos };
}

function readYtInitialData(): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const eventName = `koko-yt-initial-${Math.random().toString(36).slice(2)}`;
    const onEvent = (ev: Event) => {
      window.removeEventListener(eventName, onEvent);
      resolve(((ev as CustomEvent).detail as Record<string, unknown> | null) ?? null);
    };
    window.addEventListener(eventName, onEvent);
    const script = document.createElement('script');
    script.textContent = `(function(){try{window.dispatchEvent(new CustomEvent(${JSON.stringify(eventName)},{detail:window.ytInitialData||null}));}catch(e){window.dispatchEvent(new CustomEvent(${JSON.stringify(eventName)},{detail:null}));}})();`;
    document.documentElement.appendChild(script);
    script.remove();
    setTimeout(() => { window.removeEventListener(eventName, onEvent); resolve(null); }, 3000);
  });
}

function extractVideoItems(videoTab: unknown): unknown[] {
  // Walk the heavily-nested ytInitialData structure looking for richItemRenderer entries
  const collected: unknown[] = [];
  function walk(node: unknown) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const obj = node as Record<string, unknown>;
    if (obj.richItemRenderer || obj.gridVideoRenderer || obj.videoRenderer) {
      collected.push(obj);
    }
    for (const v of Object.values(obj)) walk(v);
  }
  walk(videoTab);
  return collected;
}

function parseVideoRenderer(item: unknown): ScrapedVideo | null {
  const obj = item as Record<string, unknown>;
  const r =
    (obj.videoRenderer as Record<string, unknown>) ??
    (obj.gridVideoRenderer as Record<string, unknown>) ??
    ((obj.richItemRenderer as { content?: { videoRenderer?: Record<string, unknown> } })?.content?.videoRenderer as Record<string, unknown> | undefined);
  if (!r) return null;
  const videoId = r.videoId as string | undefined;
  if (!videoId) return null;
  const title = (((r.title as { runs?: { text: string }[] })?.runs ?? [])[0]?.text)
    ?? ((r.title as { simpleText?: string })?.simpleText)
    ?? '';
  const viewCountStr =
    ((r.viewCountText as { simpleText?: string })?.simpleText) ??
    (((r.viewCountText as { runs?: { text: string }[] })?.runs ?? []).map((x) => x.text).join('')) ??
    '';
  const publishedAtRelative = ((r.publishedTimeText as { simpleText?: string })?.simpleText) ?? '';
  const thumbnailUrl = ((r.thumbnail as { thumbnails?: { url: string }[] })?.thumbnails ?? []).at(-1)?.url ?? '';
  const durationStr = ((r.lengthText as { simpleText?: string })?.simpleText) ?? '';
  return {
    videoId,
    title,
    viewCount: parseViewCount(viewCountStr),
    publishedAtRelative,
    thumbnailUrl,
    durationSec: parseDuration(durationStr),
  };
}

function parseViewCount(s: string): number | null {
  const m = s.replace(/,/g, '').match(/([\d.]+)\s*([KMB]?)/i);
  if (!m) return null;
  const n = Number(m[1]);
  const mult = m[2].toUpperCase() === 'B' ? 1e9 : m[2].toUpperCase() === 'M' ? 1e6 : m[2].toUpperCase() === 'K' ? 1e3 : 1;
  return Math.round(n * mult);
}

function parseDuration(s: string): number | null {
  const parts = s.split(':').map((p) => Number(p));
  if (parts.some(Number.isNaN)) return null;
  let total = 0;
  for (const p of parts) total = total * 60 + p;
  return total > 0 ? total : null;
}
```

- [ ] **Step 2: Build + verify content script registered in manifest**

```bash
cd extension
npm run build 2>&1 | tail -10
cat .output/firefox-mv2/manifest.json | grep -A 20 content_scripts
```

Expected: manifest now lists two content scripts (`youtube.js` for /watch, `youtube-channel.js` for channels). Both compiled to `.output/firefox-mv2/content-scripts/`.

- [ ] **Step 3: Commit**

```bash
git add extension/src/entrypoints/youtube-channel.content.ts
git commit -m "feat(extension): channel-page content script — scrape uploads from ytInitialData"
```

---

### Task 6: Search content script — scrape `youtube.com/results`

**Files:**
- Create: `extension/src/entrypoints/youtube-search.content.ts`

- [ ] **Step 1: Implement**

Same pattern as Task 5, scoped to `https://www.youtube.com/results*`. Reads `ytInitialData.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents[*].itemSectionRenderer.contents[*]` looking for `videoRenderer` and `channelRenderer` nodes. Returns up to 50 items.

```ts
import { defineContentScript } from 'wxt/utils/define-content-script';
import type { ContentToBg, ScrapedSearchResult } from '~/lib/messaging';

export default defineContentScript({
  matches: ['https://www.youtube.com/results*'],
  runAt: 'document_idle',
  main() {
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const msg = message as { type: string; kind?: string };
      if (msg.type !== 'scrape' || msg.kind !== 'search') return false;
      scrapeSearch().then(
        (data) => {
          const reply: ContentToBg = { type: 'scraped-search', query: data.query, results: data.results };
          browser.runtime.sendMessage(reply).catch(() => {});
        },
        (err: Error) => {
          const reply: ContentToBg = { type: 'scrape-failed', message: err.message };
          browser.runtime.sendMessage(reply).catch(() => {});
        },
      );
      sendResponse({ type: 'scrape-ack' });
      return false;
    });
  },
});

interface SearchData { query: string; results: ScrapedSearchResult[] }

async function scrapeSearch(): Promise<SearchData> {
  const data = await readYtInitialData();
  if (!data) throw new Error('ytInitialData missing');

  const params = new URL(window.location.href).searchParams;
  const query = params.get('search_query') ?? '';

  const sections = (data?.contents as Record<string, unknown>)?.twoColumnSearchResultsRenderer
    ?? null;
  if (!sections) throw new Error('no search results renderer');

  const collected: ScrapedSearchResult[] = [];
  function walk(node: unknown) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const obj = node as Record<string, unknown>;
    if (obj.videoRenderer) {
      const r = obj.videoRenderer as Record<string, unknown>;
      const videoId = r.videoId as string | undefined;
      if (videoId) {
        const title = (((r.title as { runs?: { text: string }[] })?.runs ?? [])[0]?.text) ?? '';
        const channelTitle = (((r.ownerText as { runs?: { text: string }[] })?.runs ?? [])[0]?.text)
          ?? (((r.longBylineText as { runs?: { text: string }[] })?.runs ?? [])[0]?.text)
          ?? '';
        const channelId =
          ((((r.ownerText as { runs?: { navigationEndpoint?: { browseEndpoint?: { browseId?: string } } }[] })?.runs ?? [])[0]?.navigationEndpoint?.browseEndpoint?.browseId)
          ?? null);
        const thumbnailUrl = ((r.thumbnail as { thumbnails?: { url: string }[] })?.thumbnails ?? []).at(-1)?.url ?? '';
        collected.push({ videoId, channelId, channelTitle, title, thumbnailUrl });
      }
    }
    for (const v of Object.values(obj)) walk(v);
  }
  walk(sections);

  return { query, results: collected.slice(0, 50) };
}

function readYtInitialData(): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const eventName = `koko-yt-search-${Math.random().toString(36).slice(2)}`;
    const onEvent = (ev: Event) => {
      window.removeEventListener(eventName, onEvent);
      resolve(((ev as CustomEvent).detail as Record<string, unknown> | null) ?? null);
    };
    window.addEventListener(eventName, onEvent);
    const script = document.createElement('script');
    script.textContent = `(function(){try{window.dispatchEvent(new CustomEvent(${JSON.stringify(eventName)},{detail:window.ytInitialData||null}));}catch(e){window.dispatchEvent(new CustomEvent(${JSON.stringify(eventName)},{detail:null}));}})();`;
    document.documentElement.appendChild(script);
    script.remove();
    setTimeout(() => { window.removeEventListener(eventName, onEvent); resolve(null); }, 3000);
  });
}
```

- [ ] **Step 2: Build**

```bash
cd extension
npm run build
```

Expected: clean. Manifest now has 3 content scripts.

- [ ] **Step 3: Commit**

```bash
git add extension/src/entrypoints/youtube-search.content.ts
git commit -m "feat(extension): search-page content script — scrape results from ytInitialData"
```

---

### Task 7: Sidebar-side bridge for active-tab queries

**Files:**
- Create: `extension/src/lib/active-tab-bridge.ts`

- [ ] **Step 1: Implement**

```ts
import type { ActiveTabInfo, BgToSidebar, ScrapeResult, SidebarToBg } from './messaging';

export async function getActiveTab(): Promise<ActiveTabInfo | null> {
  const req: SidebarToBg = { type: 'get-active-tab' };
  const reply = (await browser.runtime.sendMessage(req)) as BgToSidebar;
  if (reply.type === 'active-tab') return reply.info;
  throw new Error('unexpected reply from background');
}

export async function scrapeActiveTab(): Promise<ScrapeResult> {
  const req: SidebarToBg = { type: 'scrape-active-tab' };
  const reply = (await browser.runtime.sendMessage(req)) as BgToSidebar;
  if (reply.type === 'scrape-result') return reply.payload;
  if (reply.type === 'scrape-error') throw new Error(reply.message);
  throw new Error('unexpected reply from background');
}

const ACTIVE_TAB_KEY = 'koko.activeTab';

export function subscribeActiveTab(listener: (info: ActiveTabInfo | null) => void): () => void {
  const handler = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area !== 'local') return;
    if (ACTIVE_TAB_KEY in changes) listener(((changes[ACTIVE_TAB_KEY].newValue as ActiveTabInfo | null) ?? null));
  };
  browser.storage.onChanged.addListener(handler);
  return () => browser.storage.onChanged.removeListener(handler);
}
```

- [ ] **Step 2: Compile**

```bash
cd extension
npm run compile
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add extension/src/lib/active-tab-bridge.ts
git commit -m "feat(extension): sidebar bridge for active-tab queries"
```

---

### Task 8: ActiveTabCard component + Watchlist integration

**Files:**
- Create: `extension/src/app/components/ActiveTabCard.tsx`
- Modify: `extension/src/app/routes/Watchlist.tsx`

- [ ] **Step 1: Create `ActiveTabCard.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { getActiveTab, scrapeActiveTab, subscribeActiveTab } from '~/lib/active-tab-bridge';
import type { ActiveTabInfo, ScrapeResult } from '~/lib/messaging';
import { storage } from '~/lib/storage';
import type { Channel } from '~/types';

interface Props {
  onResult?: (r: ScrapeResult) => void;
}

export default function ActiveTabCard({ onResult }: Props) {
  const [info, setInfo] = useState<ActiveTabInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<ScrapeResult | null>(null);

  useEffect(() => {
    void getActiveTab().then(setInfo);
    return subscribeActiveTab(setInfo);
  }, []);

  if (!info || (info.kind !== 'channel' && info.kind !== 'search')) return null;

  async function importTab() {
    setBusy(true);
    setErr(null);
    try {
      const r = await scrapeActiveTab();
      setResult(r);
      if (r.kind === 'channel') {
        const channel: Channel = {
          platform: 'youtube',
          channelId: r.channelId,
          title: r.channelTitle,
        };
        await storage.addToWatchlist(channel);
      }
      onResult?.(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const label =
    info.kind === 'channel'
      ? `Channel: ${info.title || info.identifier}`
      : `Search: "${info.identifier}"`;
  const action =
    info.kind === 'channel' ? 'Add to watchlist (scrape uploads)' : 'Scrape search results';

  return (
    <section className="koko-card p-4 space-y-2">
      <div className="text-xs text-slate-500">active tab</div>
      <div className="text-sm font-medium truncate">{label}</div>
      <div className="flex items-center gap-2">
        <button onClick={importTab} disabled={busy} className="koko-btn text-sm">
          {busy ? 'scraping…' : action}
        </button>
        {err ? <span className="text-xs text-rose-700">{err}</span> : null}
      </div>
      {result?.kind === 'channel' ? (
        <div className="text-xs text-slate-600">
          ✓ added <strong>{result.channelTitle}</strong> · {result.videos.length} uploads scraped
        </div>
      ) : null}
      {result?.kind === 'search' ? (
        <div className="text-xs text-slate-600">
          ✓ scraped {result.results.length} results for "{result.query}"
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 2: Embed in `Watchlist.tsx`**

In the JSX, ABOVE the existing "Add a channel" section, render `<ActiveTabCard />`. Add import:

```tsx
import ActiveTabCard from '~/app/components/ActiveTabCard';
```

Insertion point: immediately after the `<MissingKeyBanner />` and before `<section className="koko-card p-6 space-y-4"><h2>Add a channel</h2>...`.

```tsx
<ActiveTabCard />
<section className="koko-card p-6 space-y-4">
  <h2 className="text-lg font-display font-semibold">Add a channel</h2>
  ...
</section>
```

- [ ] **Step 3: Build + smoke**

```bash
cd extension
npm run compile
npm run build
```

Expected: clean. Manual check in Firefox: open sidebar (Watchlist tab), navigate Firefox tab to `youtube.com/@MrBeast`. Sidebar should show "active tab" card with "Add to watchlist (scrape uploads)" button. Click → channel added, scraped uploads visible. Navigate to a non-YT page → card disappears.

- [ ] **Step 4: Commit**

```bash
git add extension/src/app/components/ActiveTabCard.tsx extension/src/app/routes/Watchlist.tsx
git commit -m "feat(extension): ActiveTabCard surface — import channel from current YT tab"
```

---

### Task 9: Channel route — refresh from active tab

**Files:**
- Modify: `extension/src/app/routes/Channel.tsx`

When the user is viewing a Channel page in kokocastles AND that channel happens to be open in another browser tab, surface a "Refresh from this tab" button that scrapes upload list directly (skips YouTube Data API quota).

- [ ] **Step 1: Add `<ActiveTabCard onResult={...}>` wired to channel match**

Inside the Channel route, near the existing toolbar, conditionally render a small button when `getActiveTab()` reports `info.kind === 'channel'` AND the identifier matches the current channel.

Concrete change: top of Channel.tsx component body, add:

```tsx
const [activeMatch, setActiveMatch] = useState<ActiveTabInfo | null>(null);
useEffect(() => {
  void getActiveTab().then((info) => {
    if (info?.kind === 'channel' && (info.identifier === channelId || (videos[0]?.channelId === channelId && info.url.includes(channelId)))) {
      setActiveMatch(info);
    } else {
      setActiveMatch(null);
    }
  });
  return subscribeActiveTab((info) => {
    if (info?.kind === 'channel' && (info.identifier === channelId || info.url.includes(channelId ?? ''))) {
      setActiveMatch(info);
    } else {
      setActiveMatch(null);
    }
  });
}, [channelId, videos]);
```

In toolbar JSX, when `activeMatch` is set, render:

```tsx
<button
  onClick={async () => {
    try {
      const r = await scrapeActiveTab();
      if (r.kind === 'channel') {
        // Convert ScrapedVideo[] to Video[] (best-effort — no API call)
        const scraped: Video[] = r.videos.map((v) => ({
          platform: 'youtube',
          videoId: v.videoId,
          channelId: r.channelId,
          channelTitle: r.channelTitle,
          title: v.title,
          publishedAt: '', // relative — display layer handles
          durationSec: v.durationSec ?? undefined,
          viewCount: v.viewCount ?? 0,
          thumbnailUrl: v.thumbnailUrl,
        }));
        setVideos(scraped);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }}
  className="koko-btn-ghost text-sm"
>
  Refresh from active tab
</button>
```

Add imports: `getActiveTab, scrapeActiveTab, subscribeActiveTab` from `~/lib/active-tab-bridge`, `ActiveTabInfo` from `~/lib/messaging`.

Note: scraped videos lack `publishedAt` ISO string (only relative text). Sort-by-date will degrade gracefully (empty publishedAt sorts last). Acceptable trade-off for quota-free fetch.

- [ ] **Step 2: Build + tsc**

```bash
cd extension
npm run compile
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add extension/src/app/routes/Channel.tsx
git commit -m "feat(extension): Channel route refreshes uploads from active YT tab (no quota)"
```

---

### Task 10: Help docs — sidebar position + Phase A/B usage

**Files:**
- Modify: `extension/src/app/routes/Help.tsx`

- [ ] **Step 1: Add sections to Help**

Append two `<section>` blocks:

```tsx
<section className="koko-card p-6 space-y-3">
  <h2 className="text-lg font-display font-semibold">Sidebar on right side</h2>
  <p className="text-sm text-slate-600">
    Firefox controls sidebar position globally — extensions cannot force it. To move
    the kokocastles sidebar to the right edge of the window:
  </p>
  <ol className="list-decimal list-inside text-sm text-slate-600 space-y-1">
    <li>Right-click anywhere on the sidebar header</li>
    <li>Click <strong>Move Sidebar to Right</strong></li>
  </ol>
  <p className="text-xs text-slate-500">
    Available in Firefox 106+. The setting persists across browser restarts.
  </p>
</section>

<section className="koko-card p-6 space-y-3">
  <h2 className="text-lg font-display font-semibold">Active-tab integration</h2>
  <p className="text-sm text-slate-600">
    When you're on a YouTube channel page (e.g. <code>youtube.com/@MrBeast</code>) or
    a search results page, the sidebar shows an "active tab" card. Clicking the
    button scrapes the page in your residential IP — no YouTube Data API quota burned,
    works without an API key.
  </p>
</section>

<section className="koko-card p-6 space-y-3">
  <h2 className="text-lg font-display font-semibold">Activity panel</h2>
  <p className="text-sm text-slate-600">
    The bar pinned at the bottom of the sidebar tracks every LLM call: provider,
    model, in-flight status, latency, estimated cost (when pricing is known).
    Click to expand. Persists last 50 calls across reloads.
  </p>
</section>
```

- [ ] **Step 2: Commit**

```bash
git add extension/src/app/routes/Help.tsx
git commit -m "docs(help): sidebar-on-right instructions + active-tab + activity panel sections"
```

---

### Task 11: Final verification

- [ ] **Step 1: Full test + tsc + build**

```bash
cd extension
npm run compile
npm test
npm run build
```

Expected: tsc clean, 53/53 tests, build clean (no chunk-size regressions beyond expected ~5KB increase from new content scripts + activity panel).

- [ ] **Step 2: Manual smoke matrix**

Load extension in Firefox via `npx web-ext run --source-dir=.output/firefox-mv2`.

| Scenario | Expected |
|---|---|
| Open sidebar on first install | Welcome state, Watchlist empty, activity bar shows "activity · 0" |
| Right-click sidebar → Move Sidebar to Right | Sidebar relocates |
| Settings → paste keys → save | "saved ✓" flash; reload sidebar — keys persist |
| Navigate Firefox tab to `youtube.com/@MrBeast` | Sidebar shows "active tab · Channel: MrBeast" card |
| Click "Add to watchlist (scrape uploads)" | Channel added, video count shown |
| Open the channel from watchlist | Channel page shows scraped uploads |
| Click "Triage hooks" | Activity bar shows N in-flight, pulsing dot, then settles to count + cost |
| Trigger an analysis with invalid key | Activity bar shows red dot + ✗ entry |
| Navigate Firefox to `youtube.com/results?search_query=mrbeast` | Sidebar card switches to "Search: mrbeast" with "Scrape search results" button |
| Click scrape | Reports N results scraped |
| Reload sidebar (close + reopen) | Activity history restored, watchlist intact |

Document any failures as follow-up tasks.

- [ ] **Step 3: Push**

```bash
git push
```

---

## Notes

- **Sidebar position is the user's call.** Documented; not enforced. If user really wants extension-controlled position, the alternative is a detached popup window via `windows.create()` — out of scope here, can be a Phase D toggle.

- **No new dependencies.** Activity store + content scripts are vanilla. Pricing table is hand-curated; missing models gracefully render `~?$`.

- **Token usage extraction is deferred.** OpenAI / Anthropic / Gemini SDKs DO return `usage` blocks; wiring them into the activity store needs adapter changes in `anthropic.ts`, `openaiCompat.ts`, `gemini.ts`. Plan calls `done(token, {})` (no token counts) — cost stays null until adapters expose usage. Future cleanup: a small follow-up task to bubble usage out of each adapter.

- **Active-tab scraping doesn't replace the Data API** — it complements it. Data API gives clean `publishedAt` ISO + `viewCount` integers; scraping gives relative dates + parsed view counts (lossy). User can pick: API (clean, quota cost) or scrape (free, lossy).

- **Bot detection mitigations.** Scraping ONLY runs when the user manually clicks "Import" / "Refresh from active tab" — no auto-navigation. Multi-channel batch (Phase C) will need throttling + jitter; out of scope here.

- **Search results scraped from `ytInitialData`** — this is what YouTube ships to the page on load. PoToken doesn't gate search rendering. Reliable.

- **Channel ID resolution.** Scraping returns the canonical `UC...` channel ID from `metadata.channelMetadataRenderer.externalId`. Watchlist's existing `Channel.channelId` field accepts this directly — no conversion needed.

- **Persistence of activity history.** Currently writes to `browser.storage.local` on every event. For high-volume sessions (~200+ calls) this could cause IO churn. Acceptable for typical usage; if it becomes a problem, debounce writes with `setTimeout` coalescing.

- **Multi-platform (Instagram, TikTok)** is a separate plan: each gets its own content script + `classifyUrl` branch + scraping logic. Architecture supports it cleanly.
