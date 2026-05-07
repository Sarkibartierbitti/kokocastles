# Phase C: Niche Scan + Cross-Channel Comparison — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add (1) niche-scan UI that takes a search query, opens a hidden YouTube tab, scrapes search results, lets the user mass-add discovered channels to the watchlist, and (2) cross-channel comparison route that opens hidden tabs in a throttled queue for selected watchlist channels, scrapes their uploads, and shows a unified sorted video grid (top by views across the niche).

**Architecture:** Background gains a generic `scrapeUrl(url, kind)` orchestrator that opens a hidden tab, waits for `tabs.onUpdated` `complete` status, sends the existing `{type:'scrape', kind}` message to the content scripts that already match `youtube.com/@*`, `/channel/*`, `/c/*`, `/user/*`, `/results*` (Phase A). Content scripts are unchanged — they reply via the long-running `sendResponse` pattern landed in commit `24a56fb`. New `~/lib/batch-queue.ts` runs an async function over an item list with concurrency cap and inter-launch jitter. New routes `/niche` and `/compare` consume these primitives. No new content scripts, no DOM scraper changes.

**Tech Stack:** wxt + React 19 + TS + Tailwind, Vitest, no new runtime deps. Reuses existing background message router (commit `eb6169b`), Phase A content scripts, activity panel.

---

## Repository Structure (delta vs current)

```
extension/src/
  app/
    routes/
      NicheScan.tsx                  NEW — search-query form, results, mass-add to watchlist
      CrossChannel.tsx               NEW — pick channels from watchlist, batch-scrape, top-N grid
    components/
      ChannelMultiPicker.tsx         NEW — checkbox list of watchlist channels
      ChannelImportList.tsx          NEW — list of scraped channels w/ tick-and-add UX
    App.tsx                          MOD — route registrations + nav links
  entrypoints/
    background.ts                    MOD — adds scrapeUrl handler
  lib/
    batch-queue.ts                   NEW — runBatch(items, fn, {concurrency, jitterMs})
    __tests__/
      batch-queue.test.ts            NEW — concurrency + jitter + abort tests
    niche-bridge.ts                  NEW — sidebar-side helpers: scrapeSearchQuery, scrapeChannelById
    messaging.ts                     MOD — new ScrapeUrlReq variant
```

Plan does NOT touch existing routes (Watchlist, Channel, VideoAnalysis, Settings, Help) beyond adding nav links in `App.tsx`.

---

## Architectural Notes

**Hidden-tab pattern.** Already proven for transcripts (commit `eb6169b`). For Phase C, reuse: open `browser.tabs.create({url, active:false})`, wait for tab status `complete` via `tabs.onUpdated`, send `{type:'scrape', kind}` to that tabId, await reply, close tab. Phase A content scripts respond via `sendResponse` (commit `24a56fb`).

**Throttle defaults.** Concurrency 2, jitter 1500-3500ms between launches, per-item timeout 12s (hidden tab needs page load + content script init). Max 30 items per batch. These defaults live in `niche-bridge.ts` constants — caller can override.

**No bot-detection mitigation beyond throttle/jitter.** Personal use, niche queries; YouTube ToS risk acknowledged in Help. If user hits rate-limit, errors surface in the activity panel.

**Search-result channel extraction.** Search content script returns `ScrapedSearchResult[]` (videoId, channelId, channelTitle, title, thumbnailUrl). Phase C extracts unique `(channelId, channelTitle)` pairs. Channels missing `channelId` are dropped — happens for some search-results when YouTube renders without `browseEndpoint`.

**Cross-channel grid.** Pick K channels (default max 5) from watchlist. Open K hidden tabs in throttled queue. Each tab returns `ScrapedVideo[]` for that channel. Merge all videos, attach `channelTitle` per row, sort by view count desc, render top 50.

**Activity panel reuse.** Each scrape isn't an LLM call — they don't appear in the activity panel currently. Phase C adds a parallel batch-status indicator to the route UI itself (per-row "scraping…" / "done" / "✗ <error>") rather than extending the activity panel scope.

**No new persistence.** Niche scan results live in route state; not saved. Cross-channel comparison results similarly ephemeral. User can manually save channels of interest via "add to watchlist" buttons.

---

## Task List

### Task 0: Pre-flight

**Files:** none.

- [ ] **Step 1: Confirm Phase A+B is shipped**

```bash
cd /home/jj_d/Documents/everything/work/claude_projects/kokocastles
git log --oneline -5
cd extension
npm test 2>&1 | tail -3
npm run compile
npm run build 2>&1 | tail -3
```

Expected: HEAD at `24a56fb` or descendant, 53/53 tests pass, tsc clean, build clean (3 content scripts shipped).

- [ ] **Step 2: Tag pre-Phase-C checkpoint**

```bash
git tag pre-phase-C
git push origin pre-phase-C
```

---

### Task 1: Batch queue lib (TDD)

**Files:**
- Create: `extension/src/lib/batch-queue.ts`
- Create: `extension/src/lib/__tests__/batch-queue.test.ts`

- [ ] **Step 1: Write failing tests**

`extension/src/lib/__tests__/batch-queue.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { runBatch } from '../batch-queue';

describe('runBatch', () => {
  it('processes all items and returns results in order', async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await runBatch(items, async (n) => n * 10, { concurrency: 2, jitterMs: 0 });
    expect(results).toEqual([
      { ok: true, value: 10 },
      { ok: true, value: 20 },
      { ok: true, value: 30 },
      { ok: true, value: 40 },
      { ok: true, value: 50 },
    ]);
  });

  it('caps concurrency', async () => {
    let inFlight = 0;
    let peak = 0;
    const items = [1, 2, 3, 4, 5, 6];
    await runBatch(
      items,
      async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 30));
        inFlight--;
      },
      { concurrency: 2, jitterMs: 0 },
    );
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('captures errors as ok:false entries without aborting batch', async () => {
    const items = [1, 2, 3];
    const results = await runBatch(
      items,
      async (n) => {
        if (n === 2) throw new Error('boom');
        return n * 10;
      },
      { concurrency: 1, jitterMs: 0 },
    );
    expect(results[0]).toEqual({ ok: true, value: 10 });
    expect(results[1]).toEqual({ ok: false, error: 'boom' });
    expect(results[2]).toEqual({ ok: true, value: 30 });
  });

  it('emits progress events as items complete', async () => {
    const items = [1, 2, 3];
    const events: { index: number; total: number }[] = [];
    await runBatch(items, async (n) => n, {
      concurrency: 1,
      jitterMs: 0,
      onProgress: (index, total) => events.push({ index, total }),
    });
    expect(events).toEqual([
      { index: 1, total: 3 },
      { index: 2, total: 3 },
      { index: 3, total: 3 },
    ]);
  });

  it('respects abort signal — pending items skipped, in-flight finish', async () => {
    const items = [1, 2, 3, 4, 5];
    const ctrl = new AbortController();
    const fn = vi.fn(async (n: number) => {
      if (n === 2) ctrl.abort();
      await new Promise((r) => setTimeout(r, 5));
      return n;
    });
    const results = await runBatch(items, fn, { concurrency: 1, jitterMs: 0, signal: ctrl.signal });
    // First two run, rest aborted with ok:false 'aborted'
    expect(results[0]).toEqual({ ok: true, value: 1 });
    expect(results[1]).toEqual({ ok: true, value: 2 });
    for (let i = 2; i < 5; i++) {
      expect(results[i]).toEqual({ ok: false, error: 'aborted' });
    }
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
cd extension
npm test -- batch-queue
```

Expected: import error (no `../batch-queue`).

- [ ] **Step 3: Implement `extension/src/lib/batch-queue.ts`**

```ts
export type BatchResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface BatchOptions {
  concurrency: number;
  /** Random delay between launches, sampled uniformly in [jitterMs/3, jitterMs]. 0 = none. */
  jitterMs: number;
  onProgress?: (completed: number, total: number) => void;
  signal?: AbortSignal;
}

export async function runBatch<I, V>(
  items: I[],
  fn: (item: I, index: number) => Promise<V>,
  opts: BatchOptions,
): Promise<BatchResult<V>[]> {
  const results: BatchResult<V>[] = new Array(items.length);
  const total = items.length;
  let completed = 0;
  let aborted = false;
  if (opts.signal?.aborted) aborted = true;
  opts.signal?.addEventListener('abort', () => { aborted = true; });

  let cursor = 0;
  async function worker(): Promise<void> {
    while (true) {
      if (aborted) return;
      const idx = cursor++;
      if (idx >= total) return;
      if (idx > 0 && opts.jitterMs > 0) {
        const min = Math.floor(opts.jitterMs / 3);
        const span = opts.jitterMs - min;
        const delay = min + Math.random() * span;
        await new Promise((r) => setTimeout(r, delay));
        if (aborted) return;
      }
      try {
        const v = await fn(items[idx], idx);
        results[idx] = { ok: true, value: v };
      } catch (e) {
        results[idx] = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
      completed++;
      opts.onProgress?.(completed, total);
    }
  }

  const workers = Array.from({ length: Math.max(1, opts.concurrency) }, () => worker());
  await Promise.all(workers);

  for (let i = 0; i < total; i++) {
    if (results[i] === undefined) {
      results[i] = { ok: false, error: 'aborted' };
    }
  }
  return results;
}
```

- [ ] **Step 4: Run tests, expect PASS**

```bash
cd extension
npm test -- batch-queue
```

Expected: 5/5 pass.

- [ ] **Step 5: Run full suite**

```bash
npm test
```

Expected: 58 (53 prior + 5 new) all pass.

- [ ] **Step 6: Commit**

```bash
cd /home/jj_d/Documents/everything/work/claude_projects/kokocastles
git add extension/src/lib/batch-queue.ts extension/src/lib/__tests__/batch-queue.test.ts
git commit -m "feat(extension): batch-queue with concurrency cap, jitter, abort signal"
```

---

### Task 2: Background `scrape-url` handler

**Files:**
- Modify: `extension/src/lib/messaging.ts`
- Modify: `extension/src/entrypoints/background.ts`

- [ ] **Step 1: Extend message contract**

Edit `extension/src/lib/messaging.ts`. Add to `SidebarToBg` union:

```ts
  | { type: 'scrape-url'; url: string; kind: 'channel' | 'search' }
```

(Insert as a new variant before `'ping'`.)

The existing `BgToSidebar` `scrape-result` and `scrape-error` variants serve as replies — no new types needed.

The full union after edit:

```ts
export type SidebarToBg =
  | { type: 'fetch-transcript'; videoId: string }
  | { type: 'get-active-tab' }
  | { type: 'scrape-active-tab' }
  | { type: 'scrape-url'; url: string; kind: 'channel' | 'search' }
  | { type: 'ping' };
```

- [ ] **Step 2: Add `handleScrapeUrl` in `background.ts`**

In `extension/src/entrypoints/background.ts`, add this function below the existing `handleScrapeActiveTab` definition:

```ts
async function handleScrapeUrl(url: string, kind: 'channel' | 'search'): Promise<ScrapeResult> {
  const tab = await browser.tabs.create({ url, active: false });
  if (tab.id == null) throw new Error('failed to open hidden tab');
  const tabId = tab.id;

  // Wait for the tab to fully load before sending the scrape message — content
  // script injects at document_idle, and tabs.sendMessage sent before injection
  // throws "Could not establish connection".
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      reject(new Error('tab load timeout (8s)'));
    }, 8_000);
    function listener(updatedId: number, change: { status?: string }) {
      if (updatedId === tabId && change.status === 'complete') {
        clearTimeout(timer);
        browser.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    browser.tabs.onUpdated.addListener(listener);
  });

  // Give the content script a tick to attach its onMessage listener.
  await new Promise((r) => setTimeout(r, 200));

  let reply: ContentToBg;
  try {
    reply = (await browser.tabs.sendMessage(tabId, { type: 'scrape', kind })) as ContentToBg;
  } catch (e) {
    browser.tabs.remove(tabId).catch(() => {});
    throw new Error(`content script did not respond (${e instanceof Error ? e.message : String(e)})`);
  }
  browser.tabs.remove(tabId).catch(() => {});

  if (reply?.type === 'scraped-channel') {
    return { kind: 'channel', videos: reply.videos, channelTitle: reply.channelTitle, channelId: reply.channelId };
  }
  if (reply?.type === 'scraped-search') {
    return { kind: 'search', results: reply.results, query: reply.query };
  }
  if (reply?.type === 'scrape-failed') {
    throw new Error(reply.message);
  }
  throw new Error('unexpected reply from content script');
}
```

- [ ] **Step 3: Wire dispatcher**

In the `browser.runtime.onMessage` listener inside `background.ts`, add this branch BEFORE the final `return false`:

```ts
    if (msg.type === 'scrape-url') {
      handleScrapeUrl(msg.url, msg.kind).then(
        (payload) => sendResponse({ type: 'scrape-result', payload }),
        (err: Error) => sendResponse({ type: 'scrape-error', message: err?.message ?? String(err) }),
      );
      return true;
    }
```

- [ ] **Step 4: Compile + build**

```bash
cd extension
npm run compile
npm run build
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
cd /home/jj_d/Documents/everything/work/claude_projects/kokocastles
git add extension/src/lib/messaging.ts extension/src/entrypoints/background.ts
git commit -m "feat(extension): background scrape-url handler — opens hidden tab, awaits onUpdated complete"
```

---

### Task 3: Sidebar-side niche-bridge

**Files:**
- Create: `extension/src/lib/niche-bridge.ts`

- [ ] **Step 1: Implement**

```ts
import type { BgToSidebar, ScrapeResult, ScrapedSearchResult, ScrapedVideo, SidebarToBg } from './messaging';
import { runBatch, type BatchResult } from './batch-queue';

const SEARCH_URL = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
const CHANNEL_URL = (id: string) => `https://www.youtube.com/channel/${encodeURIComponent(id)}`;

async function scrapeUrlViaBackground(url: string, kind: 'channel' | 'search'): Promise<ScrapeResult> {
  const req: SidebarToBg = { type: 'scrape-url', url, kind };
  const reply = (await browser.runtime.sendMessage(req)) as BgToSidebar;
  if (reply.type === 'scrape-result') return reply.payload;
  if (reply.type === 'scrape-error') throw new Error(reply.message);
  throw new Error('unexpected reply from background');
}

export async function scrapeSearchQuery(query: string): Promise<{ query: string; results: ScrapedSearchResult[] }> {
  const r = await scrapeUrlViaBackground(SEARCH_URL(query), 'search');
  if (r.kind !== 'search') throw new Error('expected search result');
  return { query: r.query, results: r.results };
}

export interface ChannelDigest {
  channelId: string;
  channelTitle: string;
  videos: ScrapedVideo[];
}

export async function scrapeChannelById(channelId: string): Promise<ChannelDigest> {
  const r = await scrapeUrlViaBackground(CHANNEL_URL(channelId), 'channel');
  if (r.kind !== 'channel') throw new Error('expected channel result');
  return { channelId: r.channelId, channelTitle: r.channelTitle, videos: r.videos };
}

export interface BatchScrapeOptions {
  concurrency?: number;
  jitterMs?: number;
  onProgress?: (completed: number, total: number) => void;
  signal?: AbortSignal;
}

export async function batchScrapeChannels(
  channelIds: string[],
  opts: BatchScrapeOptions = {},
): Promise<BatchResult<ChannelDigest>[]> {
  return runBatch(channelIds, (id) => scrapeChannelById(id), {
    concurrency: opts.concurrency ?? 2,
    jitterMs: opts.jitterMs ?? 2500,
    onProgress: opts.onProgress,
    signal: opts.signal,
  });
}

export function uniqueChannelsFromSearch(results: ScrapedSearchResult[]): { channelId: string; channelTitle: string }[] {
  const seen = new Set<string>();
  const out: { channelId: string; channelTitle: string }[] = [];
  for (const r of results) {
    if (!r.channelId) continue;
    if (seen.has(r.channelId)) continue;
    seen.add(r.channelId);
    out.push({ channelId: r.channelId, channelTitle: r.channelTitle });
  }
  return out;
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
cd /home/jj_d/Documents/everything/work/claude_projects/kokocastles
git add extension/src/lib/niche-bridge.ts
git commit -m "feat(extension): niche-bridge — scrapeSearchQuery, scrapeChannelById, batchScrapeChannels"
```

---

### Task 4: NicheScan route

**Files:**
- Create: `extension/src/app/routes/NicheScan.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useState } from 'react';
import { scrapeSearchQuery, uniqueChannelsFromSearch } from '~/lib/niche-bridge';
import { storage } from '~/lib/storage';
import type { ScrapedSearchResult } from '~/lib/messaging';
import type { Channel } from '~/types';

export default function NicheScan() {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [results, setResults] = useState<ScrapedSearchResult[]>([]);
  const [channels, setChannels] = useState<{ channelId: string; channelTitle: string }[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());

  async function scan() {
    if (!query.trim()) return;
    setBusy(true);
    setErr(null);
    setResults([]);
    setChannels([]);
    setAdded(new Set());
    try {
      const r = await scrapeSearchQuery(query.trim());
      setResults(r.results);
      setChannels(uniqueChannelsFromSearch(r.results));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function addChannel(c: { channelId: string; channelTitle: string }) {
    const ch: Channel = { platform: 'youtube', channelId: c.channelId, title: c.channelTitle };
    await storage.addToWatchlist(ch);
    setAdded((prev) => new Set(prev).add(c.channelId));
  }

  async function addAll() {
    for (const c of channels) {
      if (added.has(c.channelId)) continue;
      const ch: Channel = { platform: 'youtube', channelId: c.channelId, title: c.channelTitle };
      await storage.addToWatchlist(ch);
    }
    setAdded(new Set(channels.map((c) => c.channelId)));
  }

  return (
    <div className="space-y-6">
      <section className="koko-card p-6 space-y-3">
        <h2 className="text-lg font-display font-semibold">Scan a niche</h2>
        <p className="text-xs text-slate-600">
          Enter a YouTube search query. Background opens a hidden YouTube tab, scrapes results,
          extracts unique channels. Click any channel to add it to your watchlist.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className="koko-input flex-1"
            placeholder="e.g. orthodox christianity, mr beast challenges, indie game devlog"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') scan(); }}
          />
          <button onClick={scan} disabled={busy || !query.trim()} className="koko-btn">
            {busy ? 'scanning…' : 'Scan'}
          </button>
        </div>
        {err ? <div className="text-sm text-rose-700">{err}</div> : null}
      </section>

      {channels.length > 0 ? (
        <section className="koko-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold">Discovered channels ({channels.length})</h3>
            <button
              onClick={addAll}
              disabled={channels.every((c) => added.has(c.channelId))}
              className="koko-btn-ghost text-sm"
            >
              Add all to watchlist
            </button>
          </div>
          <ul className="divide-y divide-sky-100">
            {channels.map((c) => (
              <li key={c.channelId} className="flex items-center justify-between py-2 text-sm">
                <div className="truncate">{c.channelTitle}</div>
                {added.has(c.channelId) ? (
                  <span className="text-xs text-koko-pink-deep">✓ added</span>
                ) : (
                  <button
                    onClick={() => addChannel(c)}
                    className="koko-btn-ghost text-xs"
                  >
                    add
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {results.length > 0 ? (
        <section className="koko-card p-4 space-y-2">
          <h3 className="font-display font-semibold">Top videos in search ({results.length})</h3>
          <ul className="divide-y divide-sky-100">
            {results.slice(0, 20).map((r) => (
              <li key={r.videoId} className="py-2 text-sm flex items-start gap-3">
                <img src={r.thumbnailUrl} alt="" className="w-24 h-14 object-cover rounded ring-1 ring-sky-200 shrink-0" loading="lazy" />
                <div className="min-w-0">
                  <div className="line-clamp-2 font-medium">{r.title}</div>
                  <div className="text-xs text-slate-500">{r.channelTitle || '—'}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
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
cd /home/jj_d/Documents/everything/work/claude_projects/kokocastles
git add extension/src/app/routes/NicheScan.tsx
git commit -m "feat(extension): NicheScan route — search query → discovered channels → mass-add to watchlist"
```

---

### Task 5: ChannelMultiPicker component

**Files:**
- Create: `extension/src/app/components/ChannelMultiPicker.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useEffect, useState } from 'react';
import { storage } from '~/lib/storage';
import type { Channel } from '~/types';

interface Props {
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  max?: number;
}

export default function ChannelMultiPicker({ selected, onChange, max = 5 }: Props) {
  const [channels, setChannels] = useState<Channel[]>([]);

  useEffect(() => {
    setChannels(storage.getWatchlist().filter((c) => c.platform === 'youtube'));
  }, []);

  function toggle(channelId: string) {
    const next = new Set(selected);
    if (next.has(channelId)) {
      next.delete(channelId);
    } else {
      if (next.size >= max) return;
      next.add(channelId);
    }
    onChange(next);
  }

  if (channels.length === 0) {
    return <div className="text-sm text-slate-500">No YouTube channels in watchlist yet.</div>;
  }

  return (
    <div className="space-y-1 max-h-64 overflow-auto">
      <div className="text-xs text-slate-500 mb-1">
        pick up to {max} ({selected.size} selected)
      </div>
      {channels.map((c) => {
        const checked = selected.has(c.channelId);
        const disabled = !checked && selected.size >= max;
        return (
          <label
            key={c.channelId}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm ${
              disabled ? 'opacity-50' : 'cursor-pointer hover:bg-koko-pink/30'
            } ${checked ? 'bg-koko-sky/40' : ''}`}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={() => toggle(c.channelId)}
            />
            <span className="truncate">{c.title}</span>
          </label>
        );
      })}
    </div>
  );
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
cd /home/jj_d/Documents/everything/work/claude_projects/kokocastles
git add extension/src/app/components/ChannelMultiPicker.tsx
git commit -m "feat(extension): ChannelMultiPicker — checkbox list of watchlist channels with max cap"
```

---

### Task 6: CrossChannel route

**Files:**
- Create: `extension/src/app/routes/CrossChannel.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useMemo, useRef, useState } from 'react';
import ChannelMultiPicker from '~/app/components/ChannelMultiPicker';
import { batchScrapeChannels, type ChannelDigest } from '~/lib/niche-bridge';
import type { BatchResult } from '~/lib/batch-queue';
import type { ScrapedVideo } from '~/lib/messaging';

interface MergedRow extends ScrapedVideo {
  channelId: string;
  channelTitle: string;
}

export default function CrossChannel() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<BatchResult<ChannelDigest>[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  const merged = useMemo<MergedRow[]>(() => {
    const rows: MergedRow[] = [];
    for (const r of results) {
      if (!r.ok) continue;
      for (const v of r.value.videos) {
        rows.push({
          ...v,
          channelId: r.value.channelId,
          channelTitle: r.value.channelTitle,
        });
      }
    }
    rows.sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0));
    return rows.slice(0, 50);
  }, [results]);

  async function run() {
    if (selected.size === 0) return;
    setBusy(true);
    setErr(null);
    setResults([]);
    setProgress({ done: 0, total: selected.size });
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    try {
      const ids = Array.from(selected);
      const out = await batchScrapeChannels(ids, {
        concurrency: 2,
        jitterMs: 2500,
        signal: ctrl.signal,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setResults(out);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      ctrlRef.current = null;
    }
  }

  function abort() {
    ctrlRef.current?.abort();
  }

  const failures = results.filter((r) => !r.ok);

  return (
    <div className="space-y-6">
      <section className="koko-card p-6 space-y-3">
        <h2 className="text-lg font-display font-semibold">Cross-channel comparison</h2>
        <p className="text-xs text-slate-600">
          Pick up to 5 watchlist channels. Background opens hidden YouTube tabs (2 at a time,
          ~2.5s jitter), scrapes their uploads, merges and sorts by views.
        </p>
        <ChannelMultiPicker selected={selected} onChange={setSelected} max={5} />
        <div className="flex items-center gap-2">
          <button onClick={run} disabled={busy || selected.size === 0} className="koko-btn">
            {busy ? `scraping ${progress.done}/${progress.total}…` : `Scrape ${selected.size} channel${selected.size === 1 ? '' : 's'}`}
          </button>
          {busy ? (
            <button onClick={abort} className="koko-btn-ghost text-sm">cancel</button>
          ) : null}
        </div>
        {err ? <div className="text-sm text-rose-700">{err}</div> : null}
        {failures.length > 0 && !busy ? (
          <div className="text-xs text-amber-800">
            {failures.length} channel{failures.length === 1 ? '' : 's'} failed:{' '}
            {failures.map((f, i) => (f.ok ? null : <span key={i}>{f.error}{i < failures.length - 1 ? '; ' : ''}</span>))}
          </div>
        ) : null}
      </section>

      {merged.length > 0 ? (
        <section className="koko-card p-4 space-y-2">
          <h3 className="font-display font-semibold">Top {merged.length} videos by views</h3>
          <ul className="divide-y divide-sky-100">
            {merged.map((v) => (
              <li key={`${v.channelId}-${v.videoId}`} className="py-2 flex gap-3 items-start text-sm">
                <img src={v.thumbnailUrl} alt="" className="w-24 h-14 object-cover rounded ring-1 ring-sky-200 shrink-0" loading="lazy" />
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 font-medium">{v.title}</div>
                  <div className="text-xs text-slate-500">
                    {v.channelTitle} · {(v.viewCount ?? 0).toLocaleString()} views · {v.publishedAtRelative || 'unknown date'}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
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
cd /home/jj_d/Documents/everything/work/claude_projects/kokocastles
git add extension/src/app/routes/CrossChannel.tsx
git commit -m "feat(extension): CrossChannel route — batch scrape watchlist channels, merged top-50 grid"
```

---

### Task 7: Wire routes in `App.tsx`

**Files:**
- Modify: `extension/src/app/App.tsx`

- [ ] **Step 1: Add imports + nav links + route registrations**

In `App.tsx`, add imports after existing route imports:

```tsx
import NicheScan from '~/app/routes/NicheScan';
import CrossChannel from '~/app/routes/CrossChannel';
```

Add NavLinks in the existing `<nav>` element after the help link:

```tsx
        <NavLink to="/niche" className={({ isActive }) => isActive ? 'text-koko-pink-deep font-semibold' : 'text-slate-600'}>niche</NavLink>
        <NavLink to="/compare" className={({ isActive }) => isActive ? 'text-koko-pink-deep font-semibold' : 'text-slate-600'}>compare</NavLink>
```

Add route entries in the existing `<Routes>` block before the catch-all (or just before the help route is fine):

```tsx
          <Route path="/niche" element={<NicheScan />} />
          <Route path="/compare" element={<CrossChannel />} />
```

- [ ] **Step 2: Compile + build + tests**

```bash
cd extension
npm run compile
npm test
npm run build 2>&1 | tail -3
```

Expected: tsc clean, 58/58 tests, build clean.

- [ ] **Step 3: Commit**

```bash
cd /home/jj_d/Documents/everything/work/claude_projects/kokocastles
git add extension/src/app/App.tsx
git commit -m "feat(extension): wire /niche and /compare routes; sidebar nav adds links"
```

---

### Task 8: Help docs

**Files:**
- Modify: `extension/src/app/routes/Help.tsx`

- [ ] **Step 1: Add two sections**

In `Help.tsx`, before the existing "Sidebar on right side" section (or after the activity panel section — order matters less than presence), insert:

```tsx
      <section className="koko-card p-6 space-y-3">
        <h2 className="text-lg font-display font-semibold">Niche scan</h2>
        <p className="text-sm text-slate-600">
          The <strong>niche</strong> tab takes a YouTube search query, opens a hidden YouTube tab in
          the background, and scrapes the results. Unique channels surface as a list — click any
          to add it to your watchlist, or "Add all" to bulk-import.
        </p>
        <p className="text-xs text-slate-500">
          Uses your residential IP. No YouTube Data API quota burned. One hidden tab per scan,
          closed after scrape.
        </p>
      </section>

      <section className="koko-card p-6 space-y-3">
        <h2 className="text-lg font-display font-semibold">Cross-channel comparison</h2>
        <p className="text-sm text-slate-600">
          The <strong>compare</strong> tab lets you pick up to 5 watchlist channels and scrape their
          uploads in parallel. Results are merged into a single sorted list — top 50 videos by
          view count across the selected channels.
        </p>
        <p className="text-xs text-slate-500">
          Concurrency capped at 2 hidden tabs, with a 1.5–3.5s jitter between launches to avoid
          looking automated. Use sparingly; YouTube ToS forbids bulk automated scraping. Personal
          use, niche-focused queries are low-risk in practice.
        </p>
      </section>
```

- [ ] **Step 2: Commit**

```bash
cd /home/jj_d/Documents/everything/work/claude_projects/kokocastles
git add extension/src/app/routes/Help.tsx
git commit -m "docs(help): niche scan + cross-channel sections"
```

---

### Task 9: Final verification

- [ ] **Step 1: Full check**

```bash
cd extension
npm run compile
npm test
npm run build 2>&1 | tail -8
```

Expected: tsc clean, 58/58 tests, build outputs include 3 content scripts (`youtube.js`, `youtube-channel.js`, `youtube-search.js`), background.js, popup, sidebar.

- [ ] **Step 2: Manual smoke matrix**

```bash
cd extension
npx web-ext run --source-dir=.output/firefox-mv2
```

| Scenario | Expected |
|---|---|
| Open sidebar | Nav now has watchlist · settings · help · niche · compare |
| `/niche` route loads | Form input + Scan button |
| Type "orthodox christianity" → Scan | Hidden tab opens (briefly visible in tab list), closes; channel list + top videos render |
| Click "add" on a channel | ✓ added badge appears; switch to watchlist, channel present |
| Click "Add all to watchlist" | All channels show ✓ added; watchlist contains them |
| `/compare` route loads | ChannelMultiPicker shows watchlist YouTube channels; cap 5 |
| Select 3 channels → Scrape 3 channels | Progress counter increments 1/3 → 2/3 → 3/3; jitter visible (~5-8s total); merged top-50 grid renders sorted by views desc |
| Click cancel mid-scrape | In-flight finishes; pending channels marked "aborted" in failures list |
| One bad channel ID (e.g. removed channel) | That row enters failures list with error message; other channels still merge |

If any step fails, document as follow-up.

- [ ] **Step 3: Push**

```bash
git push
```

---

## Notes

- **No multi-platform yet.** Niche + compare are YouTube-only. Instagram + TikTok would need their own search and channel content scripts; out of scope.

- **Hidden-tab UX.** Tabs flash in the tab bar momentarily during scrape. Firefox doesn't support truly hidden tabs without `discarded:true` (which prevents content scripts from running). Acceptable.

- **Throttle math for compare.** 5 channels × 2 concurrency = ~3 launch waves with 2.5s jitter ≈ 7-10s total wall time. With 30 channels (well above the picker cap) it would be ~38-45s. Cap exists.

- **Activity panel does NOT track scrapes.** Phase B activity is LLM-only. Phase C surfaces progress in the route UI itself. Future cleanup: a more general activity bus that swallows network calls + scrape jobs uniformly.

- **No abort-mid-scrape for the in-flight tab.** AbortSignal stops queue advancement but lets the current request resolve naturally. Cleaner abort would require closing the open tab on signal — left out for simplicity; the in-flight tab self-closes within ~12s anyway.

- **No cache.** Each scrape re-fetches. Future: add `koko.scrape.<channelId>` cache with a TTL so repeated runs in the same session don't re-open tabs.

- **Bot-detection edge cases.** YouTube may serve a CAPTCHA page. Content script fails silently (`scrape-failed: no captionTracks` or similar) — surfaces as "scraping failed" in the route. User must solve the CAPTCHA in Firefox UI. Future: detect challenge page and surface "open the tab to solve" prompt.
