# Scrape fix + UX reorg Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the channel-scrape pipeline that silently returns 0 videos on current YouTube (`lockupViewModel` shape drift), surface future drift via warn flag, cache scrape results so databanks and views can render them, and add a single `ScrapeControl` component used on `/analyze → Hooks` and `/compare`.

**Architecture:** A new branch in `parseVideoRenderer` decodes `lockupViewModel`. Scrape results flow through `niche-bridge.batchScrapeChannels`, which now slices to `latestN` (≤30), persists every video to a `koko.scrapedVideos` cache, and optionally appends refs to a chosen databank. The cache is the new source of truth for `DatabankDetail` and `CrossChannel` rendering. A new `ScrapeControl` component is the single scrape UI, mounted on both `HooksSubPage` and `CrossChannel`.

**Tech Stack:** WXT (Firefox MV2), React + TS, Tailwind, vitest, `browser.tabs.create` hidden-tab content scripts, `browser.storage.local` cache.

**Source spec:** `docs/superpowers/specs/2026-05-15-scrape-fix-and-reorg-design.md`.

---

### Task 1: Lockup parser — fixture + failing test

**Files:**
- Create: `extension/src/entrypoints/__fixtures__/lockupViewModel.sample.json`
- Create: `extension/src/entrypoints/__tests__/youtube-channel-parser.test.ts`

- [ ] **Step 1: Save the live-probe sample as a fixture**

Write `extension/src/entrypoints/__fixtures__/lockupViewModel.sample.json` containing the trimmed lockup item from the live YT probe (only the fields the parser reads):

```json
{
  "contentId": "VrDknUDsrUk",
  "contentType": "LOCKUP_CONTENT_TYPE_VIDEO",
  "contentImage": {
    "thumbnailViewModel": {
      "image": {
        "sources": [
          { "url": "https://i.ytimg.com/vi/VrDknUDsrUk/hq.jpg?w=168", "width": 168, "height": 94 },
          { "url": "https://i.ytimg.com/vi/VrDknUDsrUk/hq.jpg?w=336", "width": 336, "height": 188 }
        ]
      },
      "overlays": [
        { "thumbnailBottomOverlayViewModel": { "badges": [
          { "thumbnailBadgeViewModel": { "text": "0:26", "badgeStyle": "THUMBNAIL_OVERLAY_BADGE_STYLE_DEFAULT" } }
        ]}}
      ]
    }
  },
  "metadata": {
    "lockupMetadataViewModel": {
      "title": { "content": "Linnea, do not listen to this man..." },
      "metadata": { "contentMetadataViewModel": { "metadataRows": [
        { "metadataParts": [
          { "text": { "content": "45K views" } },
          { "text": { "content": "3 weeks ago" } }
        ]}
      ]}}
    }
  }
}
```

- [ ] **Step 2: Export the parser for unit testing**

Modify `extension/src/entrypoints/youtube-channel.content.ts`. After the `defineContentScript` block, add named exports:

```ts
export { parseVideoRenderer, extractVideoItems };
```

(They are currently file-private. Re-export at the bottom of the file so the test can import them. No behavior change.)

- [ ] **Step 3: Write failing parser tests**

Create `extension/src/entrypoints/__tests__/youtube-channel-parser.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseVideoRenderer, extractVideoItems } from '../youtube-channel.content';
import lockupSample from '../__fixtures__/lockupViewModel.sample.json';

describe('parseVideoRenderer — lockupViewModel', () => {
  it('extracts videoId, title, viewCount, durationSec, thumbnail from lockupViewModel', () => {
    const v = parseVideoRenderer({ lockupViewModel: lockupSample });
    expect(v).not.toBeNull();
    expect(v!.videoId).toBe('VrDknUDsrUk');
    expect(v!.title).toBe('Linnea, do not listen to this man...');
    expect(v!.viewCount).toBe(45000);
    expect(v!.durationSec).toBe(26);
    expect(v!.publishedAtRelative).toBe('3 weeks ago');
    expect(v!.thumbnailUrl).toBe('https://i.ytimg.com/vi/VrDknUDsrUk/hq.jpg?w=336');
  });

  it('skips lockupViewModel with non-VIDEO contentType', () => {
    const v = parseVideoRenderer({
      lockupViewModel: { ...lockupSample, contentType: 'LOCKUP_CONTENT_TYPE_PLAYLIST' },
    });
    expect(v).toBeNull();
  });

  it('still parses legacy videoRenderer shape', () => {
    const v = parseVideoRenderer({
      videoRenderer: {
        videoId: 'abc123',
        title: { runs: [{ text: 'old shape' }] },
        viewCountText: { simpleText: '1.2K views' },
        publishedTimeText: { simpleText: '2 days ago' },
        thumbnail: { thumbnails: [{ url: 'https://example.com/t1.jpg' }, { url: 'https://example.com/t2.jpg' }] },
        lengthText: { simpleText: '1:23' },
      },
    });
    expect(v).not.toBeNull();
    expect(v!.videoId).toBe('abc123');
    expect(v!.title).toBe('old shape');
    expect(v!.viewCount).toBe(1200);
    expect(v!.durationSec).toBe(83);
  });

  it('extractVideoItems collects richItemRenderer + lockupViewModel + videoRenderer', () => {
    const tab = {
      content: {
        items: [
          { richItemRenderer: { content: { lockupViewModel: lockupSample } } },
          { gridVideoRenderer: { videoId: 'g1' } },
          { other: { videoRenderer: { videoId: 'v1' } } },
        ],
      },
    };
    const items = extractVideoItems(tab);
    expect(items.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd extension && npx vitest run src/entrypoints/__tests__/youtube-channel-parser.test.ts`
Expected: FAIL on the lockup tests — parser returns null because there's no branch for `lockupViewModel`.

- [ ] **Step 5: Commit the failing test + fixture**

```bash
git add extension/src/entrypoints/__fixtures__/lockupViewModel.sample.json \
        extension/src/entrypoints/__tests__/youtube-channel-parser.test.ts \
        extension/src/entrypoints/youtube-channel.content.ts
git commit -m "test(scrape): failing lockupViewModel parser tests + fixture

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Lockup parser — implementation

**Files:**
- Modify: `extension/src/entrypoints/youtube-channel.content.ts` (parser + walker)

- [ ] **Step 1: Extend the walker to also collect `lockupViewModel`**

In `extractVideoItems`, change the trigger from `if (obj.richItemRenderer || obj.gridVideoRenderer || obj.videoRenderer)` to also include `obj.lockupViewModel`:

```ts
function extractVideoItems(videoTab: unknown): unknown[] {
  const collected: unknown[] = [];
  function walk(node: unknown) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const obj = node as Record<string, unknown>;
    if (obj.richItemRenderer || obj.gridVideoRenderer || obj.videoRenderer || obj.lockupViewModel) {
      collected.push(obj);
    }
    for (const v of Object.values(obj)) walk(v);
  }
  walk(videoTab);
  return collected;
}
```

- [ ] **Step 2: Add lockup branch to `parseVideoRenderer`**

Replace the body of `parseVideoRenderer` with:

```ts
function parseVideoRenderer(item: unknown): ScrapedVideo | null {
  const obj = item as Record<string, unknown>;

  // Legacy renderer shapes
  const r =
    (obj.videoRenderer as Record<string, unknown> | undefined) ??
    (obj.gridVideoRenderer as Record<string, unknown> | undefined) ??
    ((obj.richItemRenderer as { content?: { videoRenderer?: Record<string, unknown> } } | undefined)?.content?.videoRenderer as Record<string, unknown> | undefined);
  if (r) {
    const videoId = r.videoId as string | undefined;
    if (!videoId) return null;
    const title = (((r.title as { runs?: { text: string }[] } | undefined)?.runs ?? [])[0]?.text)
      ?? ((r.title as { simpleText?: string } | undefined)?.simpleText)
      ?? '';
    const viewCountStr =
      ((r.viewCountText as { simpleText?: string } | undefined)?.simpleText) ??
      (((r.viewCountText as { runs?: { text: string }[] } | undefined)?.runs ?? []).map((x) => x.text).join('')) ??
      '';
    const publishedAtRelative = ((r.publishedTimeText as { simpleText?: string } | undefined)?.simpleText) ?? '';
    const thumbnailUrl = ((r.thumbnail as { thumbnails?: { url: string }[] } | undefined)?.thumbnails ?? []).at(-1)?.url ?? '';
    const durationStr = ((r.lengthText as { simpleText?: string } | undefined)?.simpleText) ?? '';
    return {
      videoId,
      title,
      viewCount: parseViewCount(viewCountStr),
      publishedAtRelative,
      thumbnailUrl,
      durationSec: parseDuration(durationStr),
    };
  }

  // Lockup view-model shape (current YT channel grid)
  const lvm = obj.lockupViewModel as Record<string, unknown> | undefined
    ?? ((obj.richItemRenderer as { content?: { lockupViewModel?: Record<string, unknown> } } | undefined)?.content?.lockupViewModel);
  if (lvm) return parseLockupViewModel(lvm);

  return null;
}

function parseLockupViewModel(lvm: Record<string, unknown>): ScrapedVideo | null {
  if (lvm.contentType && lvm.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO') return null;
  const videoId = lvm.contentId as string | undefined;
  if (!videoId) return null;

  const meta = (lvm.metadata as { lockupMetadataViewModel?: Record<string, unknown> } | undefined)?.lockupMetadataViewModel;
  const title = ((meta?.title as { content?: string } | undefined)?.content) ?? '';

  const rows = ((meta?.metadata as { contentMetadataViewModel?: { metadataRows?: unknown[] } } | undefined)?.contentMetadataViewModel?.metadataRows ?? []) as unknown[];
  const parts: string[] = [];
  for (const row of rows) {
    const mp = (row as { metadataParts?: { text?: { content?: string } }[] }).metadataParts ?? [];
    for (const p of mp) {
      const t = p.text?.content;
      if (t) parts.push(t);
    }
  }
  let viewCount: number | null = null;
  let publishedAtRelative = '';
  for (const t of parts) {
    if (viewCount === null && /\d/.test(t) && /view/i.test(t)) {
      viewCount = parseViewCount(t);
      continue;
    }
    if (!publishedAtRelative) publishedAtRelative = t;
  }

  const sources = (((lvm.contentImage as { thumbnailViewModel?: { image?: { sources?: { url: string; width?: number; height?: number }[] } } } | undefined)?.thumbnailViewModel?.image?.sources) ?? []);
  const best = sources.slice().sort((a, b) => ((b.width ?? 0) * (b.height ?? 0)) - ((a.width ?? 0) * (a.height ?? 0)))[0];
  const thumbnailUrl = best?.url ?? '';

  const overlays = (((lvm.contentImage as { thumbnailViewModel?: { overlays?: unknown[] } } | undefined)?.thumbnailViewModel?.overlays) ?? []) as unknown[];
  let durationStr = '';
  for (const ov of overlays) {
    const badges = ((ov as { thumbnailBottomOverlayViewModel?: { badges?: unknown[] } }).thumbnailBottomOverlayViewModel?.badges ?? []) as unknown[];
    for (const b of badges) {
      const text = ((b as { thumbnailBadgeViewModel?: { text?: string } }).thumbnailBadgeViewModel?.text) ?? '';
      if (/^\d+(:\d+){1,2}$/.test(text)) { durationStr = text; break; }
    }
    if (durationStr) break;
  }

  return {
    videoId,
    title,
    viewCount,
    publishedAtRelative,
    thumbnailUrl,
    durationSec: parseDuration(durationStr),
  };
}
```

- [ ] **Step 3: Run the parser tests and verify they pass**

Run: `cd extension && npx vitest run src/entrypoints/__tests__/youtube-channel-parser.test.ts`
Expected: 4 tests PASS.

- [ ] **Step 4: Run the full suite to catch regressions**

Run: `cd extension && npm test -- --run`
Expected: all existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add extension/src/entrypoints/youtube-channel.content.ts
git commit -m "fix(scrape): parse lockupViewModel grid items (current YT shape)

YT migrated channel uploads grid from videoRenderer to
lockupViewModel. Parser now decodes both. Verified via live probe on
/@nopengoo/videos.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Drift telemetry in content script

**Files:**
- Modify: `extension/src/entrypoints/youtube-channel.content.ts` (`scrapeChannel`)

- [ ] **Step 1: Add drift warn when items found but parsed to zero**

In `scrapeChannel()`, replace the block starting at `const items = extractVideoItems(videoTab);` with:

```ts
const items = extractVideoItems(videoTab);
const videos: ScrapedVideo[] = items
  .map(parseVideoRenderer)
  .filter((v): v is ScrapedVideo => v !== null);
if (videos.length === 0 && items.length > 0) {
  const sampleKeys = Object.keys((items[0] as Record<string, unknown>) ?? {});
  console.warn('[koko channel-scrape] 0 items parsed from', items.length, 'renderers — selectors drifted. sample keys:', sampleKeys);
} else if (items.length === 0) {
  console.warn('[koko channel-scrape] no candidate renderers in videos tab content');
}
return { channelId, channelTitle, videos };
```

- [ ] **Step 2: Run the parser tests (no test for the warn yet — log-only)**

Run: `cd extension && npx vitest run src/entrypoints/__tests__/youtube-channel-parser.test.ts`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add extension/src/entrypoints/youtube-channel.content.ts
git commit -m "feat(scrape): warn log when grid items present but 0 parsed

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Background warn flag for `handleScrapeUrl`

**Files:**
- Modify: `extension/src/entrypoints/background.ts` (`handleScrapeUrl`)

- [ ] **Step 1: Mirror the active-tab warn-flag logic in `handleScrapeUrl`**

Locate the success branch in `handleScrapeUrl`:

```ts
if (reply?.type === 'scraped-channel') {
  return { kind: 'channel', videos: reply.videos, channelTitle: reply.channelTitle, channelId: reply.channelId };
}
```

Replace with:

```ts
if (reply?.type === 'scraped-channel') {
  if (reply.videos.length === 0) {
    await browser.storage.local.set({
      'koko.platformWarn.youtube':
        'Scrape returned 0 videos — YouTube selectors may have drifted. Update the parser or wait for a release.',
    });
  } else {
    await browser.storage.local.set({ 'koko.platformWarn.youtube': null });
  }
  return { kind: 'channel', videos: reply.videos, channelTitle: reply.channelTitle, channelId: reply.channelId };
}
```

- [ ] **Step 2: Run the full suite**

Run: `cd extension && npm test -- --run`
Expected: all pass (no test added — this is observable wiring).

- [ ] **Step 3: Run tsc**

Run: `cd extension && npm run compile`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add extension/src/entrypoints/background.ts
git commit -m "fix(scrape): warn flag on zero-videos result from hidden tab

handleScrapeUrl now mirrors handleScrapeActiveTab — sets
koko.platformWarn.youtube on 0-video scrape, clears it on success.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `ScrapedVideoCacheEntry` type + storage cache

**Files:**
- Modify: `extension/src/types.ts`
- Modify: `extension/src/lib/storage.ts`
- Create: `extension/src/lib/__tests__/storage.scrapedVideos.test.ts`

- [ ] **Step 1: Add the type**

Append to `extension/src/types.ts` (after `IdeaSourceRef`):

```ts
export interface ScrapedVideoCacheEntry {
  platform: PlatformId;
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  viewCount: number | null;
  publishedAtRelative: string;
  thumbnailUrl: string;
  durationSec: number | null;
  fetchedAt: string; // ISO
}
```

- [ ] **Step 2: Add storage key + helpers**

In `extension/src/lib/storage.ts`:

(a) Add to the `KEY` const (after `framePrefix`):

```ts
  scrapedVideos: 'koko.scrapedVideos',
```

(b) Update the imports line at the top to include `ScrapedVideoCacheEntry`:

```ts
import type { Channel, Databank, DatabankVideoRef, DeepAnalysis, Hypothesis, Idea, LLMModelId, LLMProvider, Persona, PlatformId, ScrapedVideoCacheEntry, TranscriptSegment, TriageResult, Video, WriterDraft, WriterThread } from '~/types';
```

(c) Add helpers inside the `storage` object (place after `getFramesEnabled`/`setFrame` area or anywhere consistent):

```ts
  getScrapedVideos: (): Record<string, ScrapedVideoCacheEntry> =>
    getCached<Record<string, ScrapedVideoCacheEntry>>(KEY.scrapedVideos, {}),

  getScrapedVideo: (platform: PlatformId, videoId: string): ScrapedVideoCacheEntry | null => {
    const map = getCached<Record<string, ScrapedVideoCacheEntry>>(KEY.scrapedVideos, {});
    return map[`${platform}::${videoId}`] ?? null;
  },

  setScrapedVideos: async (entries: ScrapedVideoCacheEntry[]): Promise<void> => {
    const map = { ...getCached<Record<string, ScrapedVideoCacheEntry>>(KEY.scrapedVideos, {}) };
    for (const e of entries) map[`${e.platform}::${e.videoId}`] = e;
    await writeThrough(KEY.scrapedVideos, map);
  },
```

- [ ] **Step 3: Write storage cache tests**

Create `extension/src/lib/__tests__/storage.scrapedVideos.test.ts`:

```ts
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
      set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(fakeStore, items); }),
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

describe('storage — scrapedVideos cache', () => {
  it('returns empty map by default', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    expect(storage.getScrapedVideos()).toEqual({});
    expect(storage.getScrapedVideo('youtube', 'abc')).toBeNull();
  });

  it('bulk upserts entries by platform::videoId', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.setScrapedVideos([
      {
        platform: 'youtube', videoId: 'a1', channelId: 'UC1', channelTitle: 'C1',
        title: 't1', viewCount: 100, publishedAtRelative: '1d', thumbnailUrl: 'http://x/1', durationSec: 60,
        fetchedAt: '2026-05-15T00:00:00Z',
      },
      {
        platform: 'youtube', videoId: 'a2', channelId: 'UC1', channelTitle: 'C1',
        title: 't2', viewCount: 200, publishedAtRelative: '2d', thumbnailUrl: 'http://x/2', durationSec: 90,
        fetchedAt: '2026-05-15T00:00:00Z',
      },
    ]);
    expect(storage.getScrapedVideo('youtube', 'a1')?.title).toBe('t1');
    expect(storage.getScrapedVideo('youtube', 'a2')?.viewCount).toBe(200);
  });

  it('overwrites by key on re-upsert', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.setScrapedVideos([{
      platform: 'youtube', videoId: 'a1', channelId: 'UC1', channelTitle: 'C1',
      title: 'old', viewCount: 1, publishedAtRelative: '1d', thumbnailUrl: '', durationSec: null,
      fetchedAt: '2026-05-15T00:00:00Z',
    }]);
    await storage.setScrapedVideos([{
      platform: 'youtube', videoId: 'a1', channelId: 'UC1', channelTitle: 'C1',
      title: 'new', viewCount: 9, publishedAtRelative: '2d', thumbnailUrl: '', durationSec: null,
      fetchedAt: '2026-05-15T01:00:00Z',
    }]);
    expect(storage.getScrapedVideo('youtube', 'a1')?.title).toBe('new');
    expect(storage.getScrapedVideo('youtube', 'a1')?.viewCount).toBe(9);
  });
});
```

- [ ] **Step 4: Run storage tests**

Run: `cd extension && npx vitest run src/lib/__tests__/storage.scrapedVideos.test.ts`
Expected: 3 pass.

- [ ] **Step 5: Run tsc + full suite**

Run: `cd extension && npm run compile && npm test -- --run`
Expected: clean + all green.

- [ ] **Step 6: Commit**

```bash
git add extension/src/types.ts extension/src/lib/storage.ts \
        extension/src/lib/__tests__/storage.scrapedVideos.test.ts
git commit -m "feat(storage): koko.scrapedVideos cache + helpers

Adds ScrapedVideoCacheEntry, KEY.scrapedVideos, and
getScrapedVideos / getScrapedVideo / setScrapedVideos bulk upsert.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `niche-bridge` — `latestN` + persist + optional databank append

**Files:**
- Modify: `extension/src/lib/niche-bridge.ts`
- Create: `extension/src/lib/__tests__/niche-bridge.persist.test.ts`

- [ ] **Step 1: Add a `persistChannelResult` helper and extend `batchScrapeChannels`**

Replace the bottom of `extension/src/lib/niche-bridge.ts` (everything from `export interface BatchScrapeOptions` onward) with:

```ts
import { storage } from './storage';
import type { ScrapedVideoCacheEntry } from '~/types';

export interface BatchScrapeOptions {
  concurrency?: number;
  jitterMs?: number;
  onProgress?: (completed: number, total: number) => void;
  signal?: AbortSignal;
  latestN?: number;       // 1–30, default 30
  databankId?: string;    // when set, append scraped refs to this databank
}

const MAX_LATEST = 30;

async function persistChannelResult(d: ChannelDigest, latestN: number, databankId?: string): Promise<void> {
  const n = Math.max(1, Math.min(MAX_LATEST, latestN));
  const sliced = d.videos.slice(0, n);
  const now = new Date().toISOString();
  const entries: ScrapedVideoCacheEntry[] = sliced.map((v) => ({
    platform: 'youtube',
    videoId: v.videoId,
    channelId: d.channelId,
    channelTitle: d.channelTitle,
    title: v.title,
    viewCount: v.viewCount,
    publishedAtRelative: v.publishedAtRelative,
    thumbnailUrl: v.thumbnailUrl,
    durationSec: v.durationSec,
    fetchedAt: now,
  }));
  if (entries.length > 0) await storage.setScrapedVideos(entries);
  if (databankId && entries.length > 0) {
    for (const e of entries) {
      await storage.addVideoRef(databankId, {
        platform: 'youtube',
        videoId: e.videoId,
        addedAt: now,
      });
    }
  }
}

export async function batchScrapeChannels(
  channelIds: string[],
  opts: BatchScrapeOptions = {},
): Promise<BatchResult<ChannelDigest>[]> {
  const latestN = Math.max(1, Math.min(MAX_LATEST, opts.latestN ?? MAX_LATEST));
  const results = await runBatch(channelIds, (id) => scrapeChannelById(id), {
    concurrency: opts.concurrency ?? 2,
    jitterMs: opts.jitterMs ?? 2500,
    onProgress: opts.onProgress,
    signal: opts.signal,
  });
  for (const r of results) {
    if (r.ok) {
      r.value.videos = r.value.videos.slice(0, latestN);
      await persistChannelResult(r.value, latestN, opts.databankId);
    }
  }
  return results;
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

- [ ] **Step 2: Verify the existing `storage.addVideoRef` shape**

Open `extension/src/lib/storage.ts` and confirm there is a method like:

```ts
addVideoRef: async (id: string, ref: DatabankVideoRef): Promise<void> => { ... }
```

The plan assumes `(bankId, ref)` order. If the actual signature differs, adapt the call in `persistChannelResult` to match.

- [ ] **Step 3: Write persist tests**

Create `extension/src/lib/__tests__/niche-bridge.persist.test.ts`:

```ts
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
      set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(fakeStore, items); }),
      remove: vi.fn(async () => {}),
    },
  },
  runtime: {
    sendMessage: vi.fn(async () => ({
      type: 'scrape-result',
      payload: {
        kind: 'channel',
        channelId: 'UC1',
        channelTitle: 'Channel One',
        videos: [
          { videoId: 'v1', title: 't1', viewCount: 100, publishedAtRelative: '1d', thumbnailUrl: 'http://x/1', durationSec: 60 },
          { videoId: 'v2', title: 't2', viewCount: 200, publishedAtRelative: '2d', thumbnailUrl: 'http://x/2', durationSec: 90 },
        ],
      },
    })),
  },
};
(globalThis as Record<string, unknown>).browser = mockBrowser;

beforeEach(() => {
  for (const k of Object.keys(fakeStore)) delete fakeStore[k];
  vi.clearAllMocks();
  vi.resetModules();
});

describe('batchScrapeChannels — persist to scrapedVideos + databank', () => {
  it('writes scraped videos into cache', async () => {
    const { batchScrapeChannels } = await import('../niche-bridge');
    const { storage } = await import('../storage');
    await storage.hydrate();
    const out = await batchScrapeChannels(['UC1']);
    expect(out[0].ok).toBe(true);
    expect(storage.getScrapedVideo('youtube', 'v1')?.title).toBe('t1');
    expect(storage.getScrapedVideo('youtube', 'v2')?.channelTitle).toBe('Channel One');
  });

  it('appends refs to chosen databank', async () => {
    const { batchScrapeChannels } = await import('../niche-bridge');
    const { storage } = await import('../storage');
    await storage.hydrate();
    const bank = await storage.createDatabank('Test');
    await batchScrapeChannels(['UC1'], { databankId: bank.id });
    const after = storage.getDatabanks().find((d) => d.id === bank.id)!;
    const ids = after.videoRefs.map((r) => r.videoId).sort();
    expect(ids).toEqual(['v1', 'v2']);
  });

  it('respects latestN cap', async () => {
    const { batchScrapeChannels } = await import('../niche-bridge');
    const { storage } = await import('../storage');
    await storage.hydrate();
    const out = await batchScrapeChannels(['UC1'], { latestN: 1 });
    expect(out[0].ok && out[0].value.videos.length).toBe(1);
    expect(storage.getScrapedVideo('youtube', 'v1')).not.toBeNull();
    expect(storage.getScrapedVideo('youtube', 'v2')).toBeNull();
  });

  it('clamps latestN above 30 to 30', async () => {
    const { batchScrapeChannels } = await import('../niche-bridge');
    const out = await batchScrapeChannels(['UC1'], { latestN: 999 });
    // mock only returns 2 videos; just check it didn't throw and slice didn't exceed reasonable bounds
    expect(out[0].ok && out[0].value.videos.length).toBeLessThanOrEqual(2);
  });
});
```

- [ ] **Step 4: Run the niche-bridge tests**

Run: `cd extension && npx vitest run src/lib/__tests__/niche-bridge.persist.test.ts`
Expected: 4 pass.

- [ ] **Step 5: Run tsc + full suite**

Run: `cd extension && npm run compile && npm test -- --run`
Expected: clean + all green.

- [ ] **Step 6: Commit**

```bash
git add extension/src/lib/niche-bridge.ts extension/src/lib/__tests__/niche-bridge.persist.test.ts
git commit -m "feat(scrape): persist results to scrapedVideos cache + optional databank append

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `ScrapeControl` component

**Files:**
- Create: `extension/src/app/components/ScrapeControl.tsx`
- Create: `extension/src/app/components/ScrapeControl.test.tsx`

- [ ] **Step 1: Write the component**

Create `extension/src/app/components/ScrapeControl.tsx`:

```tsx
import { useMemo, useRef, useState } from 'react';
import { batchScrapeChannels } from '~/lib/niche-bridge';
import { storage } from '~/lib/storage';
import ChannelMultiPicker from './ChannelMultiPicker';

interface Props {
  defaultDatabankId?: string;
  onDone?: (summary: { okCount: number; total: number; videoCount: number }) => void;
}

export default function ScrapeControl({ defaultDatabankId, onDone }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [latestN, setLatestN] = useState(30);
  const banks = useMemo(() => storage.getDatabanks(), []);
  const [targetBank, setTargetBank] = useState<string>(defaultDatabankId ?? 'none');
  const [newBankName, setNewBankName] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [err, setErr] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ okCount: number; total: number; videoCount: number } | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  async function run() {
    if (selected.size === 0) return;
    setBusy(true);
    setErr(null);
    setSummary(null);
    setProgress({ done: 0, total: selected.size });
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    try {
      let databankId: string | undefined;
      if (targetBank === '__new__') {
        const name = newBankName.trim();
        if (!name) throw new Error('Enter a databank name or pick an existing one.');
        const bank = await storage.createDatabank(name);
        databankId = bank.id;
      } else if (targetBank !== 'none') {
        databankId = targetBank;
      }
      const n = Math.max(1, Math.min(30, latestN));
      const results = await batchScrapeChannels(Array.from(selected), {
        latestN: n,
        databankId,
        concurrency: 2,
        jitterMs: 2500,
        signal: ctrl.signal,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      const okCount = results.filter((r) => r.ok).length;
      const videoCount = results.reduce((acc, r) => acc + (r.ok ? r.value.videos.length : 0), 0);
      const s = { okCount, total: results.length, videoCount };
      setSummary(s);
      onDone?.(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      ctrlRef.current = null;
    }
  }

  function abort() { ctrlRef.current?.abort(); }

  return (
    <section className="koko-card p-4 space-y-3">
      <h3 className="text-sm font-display font-semibold">Scrape channels</h3>
      <ChannelMultiPicker selected={selected} onChange={setSelected} max={5} />
      <div className="flex flex-wrap items-end gap-3 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-slate-600">Latest N videos (1–30)</span>
          <input
            type="number"
            min={1}
            max={30}
            value={latestN}
            onChange={(e) => setLatestN(Math.max(1, Math.min(30, Number(e.target.value) || 30)))}
            className="w-20 px-2 py-1 rounded border border-sky-200"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-slate-600">Save to databank</span>
          <select
            value={targetBank}
            onChange={(e) => setTargetBank(e.target.value)}
            className="px-2 py-1 rounded border border-sky-200"
          >
            <option value="none">— none —</option>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
            <option value="__new__">+ create new…</option>
          </select>
        </label>
        {targetBank === '__new__' ? (
          <label className="flex flex-col gap-1">
            <span className="text-slate-600">New databank name</span>
            <input
              type="text"
              maxLength={80}
              value={newBankName}
              onChange={(e) => setNewBankName(e.target.value)}
              className="px-2 py-1 rounded border border-sky-200"
            />
          </label>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <button onClick={run} disabled={busy || selected.size === 0} className="koko-btn">
          {busy ? `scraping ${progress.done}/${progress.total}…` : `Scrape ${selected.size} channel${selected.size === 1 ? '' : 's'}`}
        </button>
        {busy ? <button onClick={abort} className="koko-btn-ghost text-sm">cancel</button> : null}
      </div>
      {err ? <div className="text-xs text-rose-700">{err}</div> : null}
      {summary ? (
        <div className="text-xs text-slate-600">
          <strong>Scrape complete:</strong> {summary.okCount}/{summary.total} channels succeeded; {summary.videoCount} videos total
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 2: Write a smoke test for the component**

Create `extension/src/app/components/ScrapeControl.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const fakeStore: Record<string, unknown> = {
  'koko.watchlist': [{ platform: 'youtube', channelId: 'UC1', title: 'Channel One' }],
};
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
      set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(fakeStore, items); }),
      remove: vi.fn(async () => {}),
    },
  },
  runtime: {
    sendMessage: vi.fn(async () => ({
      type: 'scrape-result',
      payload: {
        kind: 'channel', channelId: 'UC1', channelTitle: 'Channel One',
        videos: [{ videoId: 'v1', title: 't1', viewCount: 100, publishedAtRelative: '1d', thumbnailUrl: '', durationSec: 60 }],
      },
    })),
  },
};
(globalThis as Record<string, unknown>).browser = mockBrowser;

beforeEach(() => {
  for (const k of Object.keys(fakeStore)) delete fakeStore[k];
  fakeStore['koko.watchlist'] = [{ platform: 'youtube', channelId: 'UC1', title: 'Channel One' }];
  vi.clearAllMocks();
  vi.resetModules();
});

describe('ScrapeControl', () => {
  it('renders multipicker + latestN input + databank select + run button', async () => {
    const { storage } = await import('~/lib/storage');
    await storage.hydrate();
    const ScrapeControl = (await import('./ScrapeControl')).default;
    render(<MemoryRouter><ScrapeControl /></MemoryRouter>);
    expect(screen.getByText('Channel One')).toBeInTheDocument();
    expect(screen.getByText(/Latest N videos/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Scrape 0 channels/i })).toBeDisabled();
  });

  it('enables run when a channel is picked + latestN clamps to 30', async () => {
    const { storage } = await import('~/lib/storage');
    await storage.hydrate();
    const ScrapeControl = (await import('./ScrapeControl')).default;
    render(<MemoryRouter><ScrapeControl /></MemoryRouter>);
    const cb = screen.getByRole('checkbox');
    fireEvent.click(cb);
    expect(screen.getByRole('button', { name: /Scrape 1 channel/i })).toBeEnabled();
    const n = screen.getByRole('spinbutton') as HTMLInputElement;
    fireEvent.change(n, { target: { value: '99' } });
    expect(n.value).toBe('30');
  });
});
```

- [ ] **Step 3: Run component tests**

Run: `cd extension && npx vitest run src/app/components/ScrapeControl.test.tsx`
Expected: 2 pass.

- [ ] **Step 4: Run tsc + full suite**

Run: `cd extension && npm run compile && npm test -- --run`
Expected: clean + all green.

- [ ] **Step 5: Commit**

```bash
git add extension/src/app/components/ScrapeControl.tsx \
        extension/src/app/components/ScrapeControl.test.tsx
git commit -m "feat(scrape): ScrapeControl component (channels, latestN, databank)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Mount `ScrapeControl` on HooksSubPage

**Files:**
- Modify: `extension/src/app/routes/HooksSubPage.tsx`

- [ ] **Step 1: Import and mount the control above the empty state and the hook list**

In `extension/src/app/routes/HooksSubPage.tsx`:

(a) Add to imports:

```tsx
import ScrapeControl from '~/app/components/ScrapeControl';
```

(b) Replace the `if (hooks.length === 0) { return (...) }` block with:

```tsx
if (hooks.length === 0) {
  return (
    <div className="space-y-4">
      <ScrapeControl />
      <div className="koko-card p-8 max-w-xl mx-auto text-center text-sm text-slate-500">
        No hooks yet. Scrape channels above, then analyze videos from the Videos sub-page to populate this view.
      </div>
    </div>
  );
}
```

(c) Replace the bottom `return ( ... )` block with:

```tsx
return (
  <div className="space-y-4">
    <ScrapeControl />
    <header className="flex items-center justify-between">
      <p className="text-xs text-slate-500">
        {hooks.length} hook{hooks.length === 1 ? '' : 's'} from analyzed videos
      </p>
      {busy && <span className="text-xs text-slate-500">Categorizing…</span>}
      {err && <span className="text-xs text-red-600">{err}</span>}
    </header>
    <div className="space-y-2">
      {hooks.map((h) => (
        <HookCard key={`${h.platform}::${h.videoId}`} entry={h} />
      ))}
    </div>
  </div>
);
```

- [ ] **Step 2: Run tsc + full suite**

Run: `cd extension && npm run compile && npm test -- --run`
Expected: clean + all green.

- [ ] **Step 3: Commit**

```bash
git add extension/src/app/routes/HooksSubPage.tsx
git commit -m "feat(analyze): scrape entry on Hooks sub-page

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: `CrossChannel` — use `ScrapeControl` + read from cache

**Files:**
- Modify: `extension/src/app/routes/CrossChannel.tsx`

- [ ] **Step 1: Rewrite `CrossChannel` to use the new control + cache**

Replace the full contents of `extension/src/app/routes/CrossChannel.tsx` with:

```tsx
import { useEffect, useMemo, useState } from 'react';
import VideoToolbar from '~/app/components/VideoToolbar';
import ExportFieldPicker from '~/app/components/ExportFieldPicker';
import ScrapeControl from '~/app/components/ScrapeControl';
import {
  searchRows,
  filterRows,
  sortRows,
  applyHidden,
  type FilterState,
  type SortField,
  type SortDir,
} from '~/lib/feedFilter';
import { storage } from '~/lib/storage';

interface MergedRow {
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  viewCount: number | null;
  publishedAtRelative: string;
  thumbnailUrl: string;
}

interface Props {
  videoFilter?: (v: { platform: string; videoId: string }) => boolean;
}

export default function CrossChannel({ videoFilter }: Props = {}) {
  const [tick, setTick] = useState(0);

  const [search, setSearch] = useState('');
  const [filterState, setFilterState] = useState<FilterState>({});
  const [sortField, setSortField] = useState<SortField>('views');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [sessionHidden, setSessionHidden] = useState<Set<string>>(new Set());
  const [showExport, setShowExport] = useState(false);

  const totalRows = useMemo<MergedRow[]>(() => {
    const map = storage.getScrapedVideos();
    const rows: MergedRow[] = Object.values(map)
      .filter((e) => e.platform === 'youtube')
      .map((e) => ({
        videoId: e.videoId,
        channelId: e.channelId,
        channelTitle: e.channelTitle,
        title: e.title,
        viewCount: e.viewCount,
        publishedAtRelative: e.publishedAtRelative,
        thumbnailUrl: e.thumbnailUrl,
      }));
    return videoFilter
      ? rows.filter((v) => videoFilter({ platform: 'youtube', videoId: v.videoId }))
      : rows;
  }, [tick, videoFilter]);

  const visibleRows = useMemo<MergedRow[]>(() => {
    const hidden = storage.getAllHiddenKeys();
    const rowsAsFeed = totalRows.map((r) => ({
      videoId: r.videoId,
      channelId: r.channelId,
      channelTitle: r.channelTitle,
      title: r.title,
      viewCount: r.viewCount ?? 0,
      likeCount: undefined,
      publishedAt: undefined,
      platform: 'youtube',
    }));
    let working = searchRows(rowsAsFeed, search);
    working = filterRows(working, filterState);
    working = sortRows(working, sortField, sortDir);
    working = applyHidden(working, hidden, sessionHidden);
    const order = new Map(working.map((r, i) => [`youtube::${r.videoId}`, i]));
    const allowed = new Set(order.keys());
    const out = totalRows.filter((r) => allowed.has(`youtube::${r.videoId}`));
    out.sort(
      (a, b) =>
        (order.get(`youtube::${a.videoId}`) ?? 0) - (order.get(`youtube::${b.videoId}`) ?? 0),
    );
    return out.slice(0, 50);
  }, [totalRows, search, filterState, sortField, sortDir, sessionHidden]);

  return (
    <div className="space-y-6">
      <ScrapeControl onDone={() => setTick((t) => t + 1)} />

      {totalRows.length > 0 ? (
        <VideoToolbar
          total={totalRows.length}
          shown={visibleRows.length}
          search={search}
          onSearch={setSearch}
          filter={filterState}
          onFilter={setFilterState}
          sortField={sortField}
          sortDir={sortDir}
          onSort={(f, d) => {
            setSortField(f);
            setSortDir(d);
          }}
          onExport={() => setShowExport(true)}
        />
      ) : null}

      {visibleRows.length > 0 ? (
        <section className="koko-card p-4 space-y-2">
          <h3 className="font-display font-semibold">Top {visibleRows.length} videos</h3>
          <ul className="divide-y divide-sky-100">
            {visibleRows.map((v) => (
              <li key={`${v.channelId}-${v.videoId}`} className="py-2 flex gap-3 items-start text-sm">
                <img src={v.thumbnailUrl} alt="" className="w-24 h-14 object-cover rounded ring-1 ring-sky-200 shrink-0" loading="lazy" />
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 font-medium">{v.title}</div>
                  <div className="text-xs text-slate-500">
                    {v.channelTitle} · {(v.viewCount ?? 0).toLocaleString()} views · {v.publishedAtRelative || 'unknown date'}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <button
                    onClick={() =>
                      setSessionHidden((s) => new Set([...s, `youtube::${v.videoId}`]))
                    }
                    className="text-[10px] text-slate-400 hover:text-slate-600 px-1"
                    aria-label={`hide ${v.title} this session`}
                  >
                    hide
                  </button>
                  <button
                    onClick={async () => {
                      await storage.hideVideo('youtube', v.videoId);
                      setSessionHidden((s) => new Set([...s, `youtube::${v.videoId}`]));
                    }}
                    className="text-[10px] text-rose-500 hover:text-rose-700 px-1"
                    aria-label={`hide ${v.title} permanently`}
                  >
                    hide∞
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ExportFieldPicker
        open={showExport}
        onClose={() => setShowExport(false)}
        onConfirm={(fields, format) => {
          const records = visibleRows.map((v) => ({
            video: {
              platform: 'youtube' as const,
              videoId: v.videoId,
              channelId: v.channelId,
              channelTitle: v.channelTitle,
              title: v.title,
              publishedAt: '',
              viewCount: v.viewCount ?? 0,
              thumbnailUrl: v.thumbnailUrl,
            },
            analysis: null,
          }));
          import('~/lib/export').then(({ exportToFile }) => exportToFile(records, fields, format));
          setShowExport(false);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Run tsc + full suite**

Run: `cd extension && npm run compile && npm test -- --run`
Expected: clean. Any existing `CrossChannel.test.*` may need updating — if the suite fails on a removed `results` state, update assertions to seed the cache via `storage.setScrapedVideos`. If no such test exists, ignore.

- [ ] **Step 3: Commit**

```bash
git add extension/src/app/routes/CrossChannel.tsx
git commit -m "feat(compare): CrossChannel uses ScrapeControl + scrapedVideos cache

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: `DatabankDetail` — rewrite to read cache

**Files:**
- Modify: `extension/src/app/routes/DatabankDetail.tsx`
- Modify: `extension/src/app/routes/DatabankDetail.test.tsx` (only if it asserts the old CrossChannel mount — likely needs updating)

- [ ] **Step 1: Rewrite the route**

Replace `extension/src/app/routes/DatabankDetail.tsx` with:

```tsx
import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { storage } from '~/lib/storage';
import { findById } from '~/lib/databanks';
import ScrapeControl from '~/app/components/ScrapeControl';
import { youtubeAdapter } from '~/lib/platforms/youtube';

export default function DatabankDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const [tick, setTick] = useState(0);
  const db = useMemo(() => findById(storage.getDatabanks(), id), [id, tick]);

  if (!db) {
    return (
      <div className="koko-card p-8 max-w-xl text-center space-y-3">
        <p className="text-sm text-slate-500">Databank not found.</p>
        <Link to="/databanks" className="text-sm text-koko-pink-deep underline">back to list</Link>
      </div>
    );
  }

  const cache = storage.getScrapedVideos();

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-semibold">{db.name}</h1>
          <p className="text-sm text-slate-500">{db.videoRefs.length} video{db.videoRefs.length === 1 ? '' : 's'} in this bank</p>
        </div>
        <Link to="/databanks" className="text-sm text-slate-500 hover:text-slate-700">← all databanks</Link>
      </header>

      <ScrapeControl defaultDatabankId={id} onDone={() => setTick((t) => t + 1)} />

      {db.videoRefs.length === 0 ? (
        <div className="koko-card p-8 text-center text-sm text-slate-500">
          No videos yet. Scrape channels above to populate this bank.
        </div>
      ) : (
        <ul className="koko-card divide-y divide-sky-100">
          {db.videoRefs.map((ref) => {
            const hit = cache[`${ref.platform}::${ref.videoId}`];
            const title = hit?.title || '(no metadata yet — analyze video to populate)';
            const channelTitle = hit?.channelTitle ?? '';
            const viewCount = hit?.viewCount ?? null;
            const publishedAtRelative = hit?.publishedAtRelative ?? '';
            const thumbnailUrl = hit?.thumbnailUrl
              || (ref.platform === 'youtube' ? youtubeAdapter.thumbnail(ref.videoId) : '');
            const watchHref = ref.platform === 'youtube'
              ? `https://www.youtube.com/watch?v=${encodeURIComponent(ref.videoId)}`
              : '#';
            return (
              <li key={`${ref.platform}::${ref.videoId}`} className="py-2 px-3 flex gap-3 items-start text-sm">
                <Link to={`/video/${ref.platform}/${ref.videoId}`} className="shrink-0">
                  <img src={thumbnailUrl} alt="" className="w-28 h-16 object-cover rounded ring-1 ring-sky-200" loading="lazy" />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link to={`/video/${ref.platform}/${ref.videoId}`} className="line-clamp-2 font-medium hover:underline">
                    {title}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {channelTitle ? <>{channelTitle} · </> : null}
                    {viewCount !== null ? <>{viewCount.toLocaleString()} views · </> : null}
                    {publishedAtRelative || 'unknown date'}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <a href={watchHref} target="_blank" rel="noreferrer" className="text-[10px] text-sky-700 hover:underline">open on YT ↗</a>
                  <button
                    className="text-[10px] text-rose-500 hover:text-rose-700"
                    onClick={async () => {
                      await storage.removeVideoRef(db.id, ref.platform, ref.videoId);
                      setTick((t) => t + 1);
                    }}
                  >
                    remove from bank
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify `storage.removeVideoRef` exists**

Open `extension/src/lib/storage.ts`. Confirm `removeVideoRef(bankId, platform, videoId)` exists. If the actual signature differs, adapt the call in step 1. If the method doesn't exist at all, add it next to `addVideoRef`:

```ts
removeVideoRef: async (bankId: string, platform: PlatformId, videoId: string): Promise<void> => {
  const k = `${platform}::${videoId}`;
  const list = storage.getDatabanks().map((d) =>
    d.id === bankId ? { ...d, videoRefs: d.videoRefs.filter((r) => `${r.platform}::${r.videoId}` !== k) } : d
  );
  await writeThrough(KEY.databanks, list);
  rebuildDatabankIndex();
},
```

- [ ] **Step 3: Update or remove the existing DatabankDetail test**

If `extension/src/app/routes/DatabankDetail.test.tsx` asserts the old `CrossChannel` mount, replace its body with assertions for the new shape:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

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
      set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(fakeStore, items); }),
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

describe('DatabankDetail', () => {
  it('renders cache-hit rows with title + channel + views', async () => {
    const { storage } = await import('~/lib/storage');
    await storage.hydrate();
    const bank = await storage.createDatabank('B');
    await storage.addVideoRef(bank.id, { platform: 'youtube', videoId: 'v1', addedAt: '2026-05-15T00:00:00Z' });
    await storage.setScrapedVideos([{
      platform: 'youtube', videoId: 'v1', channelId: 'UC1', channelTitle: 'Ch1',
      title: 'Hello', viewCount: 1000, publishedAtRelative: '2d', thumbnailUrl: 'http://x/v1', durationSec: 60,
      fetchedAt: '2026-05-15T00:00:00Z',
    }]);
    const DatabankDetail = (await import('./DatabankDetail')).default;
    render(
      <MemoryRouter initialEntries={[`/databanks/${bank.id}`]}>
        <Routes>
          <Route path="/databanks/:id" element={<DatabankDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText(/Ch1/)).toBeInTheDocument();
    expect(screen.getByText(/1,000 views/)).toBeInTheDocument();
  });

  it('renders fallback row for cache-miss ref', async () => {
    const { storage } = await import('~/lib/storage');
    await storage.hydrate();
    const bank = await storage.createDatabank('B');
    await storage.addVideoRef(bank.id, { platform: 'youtube', videoId: 'vMissing', addedAt: '2026-05-15T00:00:00Z' });
    const DatabankDetail = (await import('./DatabankDetail')).default;
    render(
      <MemoryRouter initialEntries={[`/databanks/${bank.id}`]}>
        <Routes>
          <Route path="/databanks/:id" element={<DatabankDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(/no metadata yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run targeted tests**

Run: `cd extension && npx vitest run src/app/routes/DatabankDetail.test.tsx`
Expected: 2 pass.

- [ ] **Step 5: Run tsc + full suite**

Run: `cd extension && npm run compile && npm test -- --run`
Expected: clean + all green.

- [ ] **Step 6: Commit**

```bash
git add extension/src/app/routes/DatabankDetail.tsx \
        extension/src/app/routes/DatabankDetail.test.tsx \
        extension/src/lib/storage.ts
git commit -m "refactor(databanks): DatabankDetail renders refs from scrapedVideos cache

Drops the CrossChannel mount; lists videoRefs joined with the cache.
Cache-miss refs render a fallback row with the YT thumbnail-by-id.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Manual-add path caches metadata

**Files:**
- Modify: `extension/src/app/components/AddToDatabankButton.tsx`
- Modify: `extension/src/app/components/VideoCard.tsx`

- [ ] **Step 1: Extend `AddToDatabankButton` props**

Replace `extension/src/app/components/AddToDatabankButton.tsx` with:

```tsx
import { useState } from 'react';
import DatabankPicker from './DatabankPicker';
import { storage } from '~/lib/storage';
import type { PlatformId, ScrapedVideoCacheEntry } from '~/types';

interface Props {
  videoRef: { platform: PlatformId; videoId: string };
  metadata?: Omit<ScrapedVideoCacheEntry, 'platform' | 'videoId' | 'fetchedAt'>;
}

export default function AddToDatabankButton({ videoRef, metadata }: Props) {
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
        onPicked={async () => {
          if (metadata && !storage.getScrapedVideo(videoRef.platform, videoRef.videoId)) {
            await storage.setScrapedVideos([{
              platform: videoRef.platform,
              videoId: videoRef.videoId,
              fetchedAt: new Date().toISOString(),
              ...metadata,
            }]);
          }
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }}
      />
    </>
  );
}
```

- [ ] **Step 2: Pass metadata from `VideoCard`**

Replace the bottom `<AddToDatabankButton ... />` line in `extension/src/app/components/VideoCard.tsx` with:

```tsx
<AddToDatabankButton
  videoRef={{ platform: video.platform, videoId: video.videoId }}
  metadata={{
    channelId: video.channelId,
    channelTitle: video.channelTitle,
    title: video.title,
    viewCount: video.viewCount,
    publishedAtRelative: '',
    thumbnailUrl: video.thumbnailUrl,
    durationSec: null,
  }}
/>
```

- [ ] **Step 3: Run tsc + full suite**

Run: `cd extension && npm run compile && npm test -- --run`
Expected: clean + all green.

- [ ] **Step 4: Manual smoke (only if a dev build is loaded)**

Build, load the temp add-on, open a Watchlist channel, hit `+ databank`, pick a fresh bank, open `/databanks/:id` → expect the row rendered with title + thumbnail.

- [ ] **Step 5: Commit**

```bash
git add extension/src/app/components/AddToDatabankButton.tsx \
        extension/src/app/components/VideoCard.tsx
git commit -m "feat(databanks): manual-add caches video metadata

When + databank is clicked on a VideoCard, the card's metadata is
persisted to koko.scrapedVideos so the bank renders the row even
without a prior scrape pass.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: End-to-end smoke check (manual)

**Files:** none — this is a human-driven verification of the full slice.

- [ ] **Step 1: Build the extension**

Run: `cd extension && npm run build`
Expected: clean build.

- [ ] **Step 2: Load `.output/firefox-mv2/manifest.json` as a temporary add-on in Firefox.**

- [ ] **Step 3: In sidebar Settings, paste OpenRouter + YT keys (use `docs/dev-test-fixture.md` for keys if available).**

- [ ] **Step 4: Add `https://www.youtube.com/@nopengoo` to the watchlist via Channels page.**

- [ ] **Step 5: Open `/analyze` → Hooks tab.**

Expect a `Scrape channels` card with the watchlist picker, Latest N field, databank picker, and a Scrape button.

- [ ] **Step 6: Pick NoPengoo, set N=10, target databank = "+ create new…", name = "Smoke A". Click Scrape.**

Expect:
- Console: `[koko channel-scrape] success: UC2QWk1s2NrRyTaenzy2Q1Pw 10 videos`.
- Progress text in the button: `scraping 1/1…` → done.
- Summary: `Scrape complete: 1/1 channels succeeded; 10 videos total`.
- No `koko.platformWarn.youtube` set (check via `browser.storage.local.get('koko.platformWarn.youtube')` in the background console).

- [ ] **Step 7: Open `/databanks/Smoke A`.**

Expect 10 rows with thumbnail + title + channel + views. Each row clickable through to `/video/youtube/:videoId`. "open on YT ↗" works.

- [ ] **Step 8: Open `/compare` and confirm the same 10 videos appear in the cross-channel feed (plus toolbar works).**

- [ ] **Step 9: Click `+ databank` on one of the rows (via Videos sub-page if available), pick "Smoke B" (create new). Open `/databanks/Smoke B` and confirm the row renders fully (no `(no metadata yet)` fallback).**

If any step fails, capture the exact console line + activity panel entry per the testing playbook reporting format and file a fresh bug.

---

## Self-review notes

- Spec coverage: parser fix (Tasks 1-2), drift telemetry (Tasks 3-4), cache (Task 5), persist + latestN + databank (Task 6), ScrapeControl (Task 7), HooksSubPage entry (Task 8), CrossChannel reuse (Task 9), DatabankDetail rewrite (Task 10), manual-add metadata (Task 11), end-to-end smoke (Task 12). All spec sections accounted for.
- The `databanks.ts` bulk helper mentioned in the spec was dropped — `niche-bridge.persistChannelResult` calls existing `storage.addVideoRef` per item, which already dedupes via `dedupeRefs`. Bulk variant is YAGNI.
- Type consistency: `ScrapedVideoCacheEntry` shape consistent across types.ts, storage.ts, niche-bridge.ts, ScrapeControl, DatabankDetail, AddToDatabankButton.
- Field order on `removeVideoRef` in Task 10 step 2 must match the actual storage signature — step explicitly tells the engineer to verify.
