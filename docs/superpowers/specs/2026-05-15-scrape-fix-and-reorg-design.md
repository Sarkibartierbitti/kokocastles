# Scrape fix + UX reorg — design

Date: 2026-05-15
Branch context: `feat/full-product-spec`
Related: `docs/testing-playbook copy.md` (Phase 2, 3a, 3b test results); `docs/suggested _implementation.md` (analyze sub-pages, databanks).

## Problem

Three issues surfaced during manual testing of the scrape pipeline:

1. **Channel scrape returns 0 videos.** `CrossChannel` reports
   `Scrape complete: 1/1 channels succeeded; 0 videos total`. Hidden tab
   opens, content script runs, ytInitialData parsed, Videos tab found —
   but `parseVideoRenderer` returns null for every grid item. Root cause:
   YT migrated the channel uploads grid from `videoRenderer` to
   `lockupViewModel` (new Flexy/ViewModel rendering). The existing parser
   doesn't know that shape, returns null, items are filtered out.
   Verified via live Playwright probe on `/@nopengoo/videos` —
   `richItemRenderer.content.videoRenderer` no longer exists; the content
   is now `lockupViewModel`. Counts: 30 `richItemRenderer`, 30
   `lockupViewModel`, 0 `videoRenderer` on the channel grid.

2. **Databank doesn't render its videos.** Adding a video to a databank
   increments the count but `/databanks/:id` shows an empty grid.
   Reason: `DatabankDetail` mounts `CrossChannel` and filters by
   `videoRefs`, but `CrossChannel` only renders videos that came from
   its own scrape — manually-added refs have no source feed to render
   from, so they're invisible.

3. **Scrape UX missing from `/analyze`.** Per
   `docs/suggested _implementation.md`, scrape entry should live on the
   Hooks sub-page with a "scrape latest N videos" control. Currently
   only `/compare` (CrossChannel) has a scrape button, and there's no N
   input.

## Goals

- Scrape extracts videos again from current YT (parser handles
  `lockupViewModel`).
- Future selector drift surfaces as a warn flag instead of a silent
  "succeeded with 0 videos".
- Databank detail renders both scraped and manually-added videos.
- Scrape control available from `/analyze → Hooks` and `/compare`, with
  a "Latest N" input (1–30, default 30) and a target-databank picker.
- Scrape results auto-persist video metadata so any consumer (databank
  detail, /compare, future hook aggregator) can render them.

## Non-goals

- Pagination beyond ~30 grid items via `continuationItemRenderer`.
  Capped at 30 in the UI.
- Migrating IG / TT scrapers to view-model shapes (separate adapter
  work, surfaced by drift warn flag when it happens).
- Redesigning `/compare` rendering — the existing render path stays.

## Architecture

### Data flow (after change)

```
sidebar ScrapeControl (analyze/Hooks or /compare)
   ↓ batchScrapeChannels(channelIds, { latestN, databankId? })
   ↓ background.handleScrapeUrl (hidden tab per channel)
   ↓ youtube-channel.content.ts: scrapeChannel
      → parseVideoRenderer (handles videoRenderer | gridVideoRenderer
                            | richItemRenderer | lockupViewModel)
      → returns ScrapedVideo[]
   ↑ ScrapeResult { kind:'channel', videos, channelId, channelTitle }
   ↑ niche-bridge persists each video to koko.scrapedVideos cache
   ↑ niche-bridge appends refs to chosen databank (optional)
   ↑ resolve to caller; caller renders progress + done message

DatabankDetail reads videoRefs ⨝ koko.scrapedVideos cache
   → renders one VideoRow per ref; cache miss → fallback row with
     yt thumbnail-by-id + "(no metadata yet)" placeholder
```

### Components changed

| File | Change |
|---|---|
| `entrypoints/youtube-channel.content.ts` | parser: add `lockupViewModel` branch; walker: collect `lockupViewModel` where `contentType === 'LOCKUP_CONTENT_TYPE_VIDEO'`; emit drift warn when tabs found but 0 items extracted. |
| `entrypoints/background.ts` | extend `handleScrapeUrl` to set `koko.platformWarn.youtube` on `videos.length === 0` (mirroring active-tab path). |
| `lib/niche-bridge.ts` | wrap `batchScrapeChannels`: on each ok result, write videos into `koko.scrapedVideos` and (if `databankId` passed) append refs to that bank. Add `latestN` option, slice videos to N. |
| `lib/storage.ts` | add `getScrapedVideo(platform, videoId)`, `setScrapedVideos(rows)`. New KEY `scrapedVideos`. |
| `types.ts` | add `ScrapedVideoCacheEntry`. |
| `app/components/ScrapeControl.tsx` (new) | channel multipicker + latestN input + databank select + run button. Reuses niche-bridge wrapper. |
| `app/routes/HooksSubPage.tsx` | mount `<ScrapeControl>` above existing empty/hook-card render. |
| `app/routes/CrossChannel.tsx` | replace inline scrape UI with `<ScrapeControl>`; keep render section + toolbar; read from `koko.scrapedVideos` instead of component state. |
| `app/routes/DatabankDetail.tsx` | rewrite: list `videoRefs` joined with cache; remove `CrossChannel` mount. |
| `lib/databanks.ts` | helper `addRefsToBank(bankId, refs)` if not already present (storage already exposes single-ref add; add bulk variant). |
| `app/components/AddToDatabankButton.tsx` | when adding ref, also `setScrapedVideo` for that video's metadata if not already cached. |

### Parser detail (lockupViewModel)

Sample shape from live YT (`/@nopengoo/videos`, 2026-05-15):

```jsonc
{
  "contentId": "VrDknUDsrUk",
  "contentType": "LOCKUP_CONTENT_TYPE_VIDEO",
  "contentImage": {
    "thumbnailViewModel": {
      "image": { "sources": [ { "url": "...hqdefault.jpg...", "width": 336, "height": 188 }, ... ] },
      "overlays": [
        { "thumbnailBottomOverlayViewModel": { "badges": [
          { "thumbnailBadgeViewModel": { "text": "0:26", "badgeStyle": "THUMBNAIL_OVERLAY_BADGE_STYLE_DEFAULT" } }
        ]}},
        ...
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

Parser rule:

- `videoId` ← `contentId`. Skip if `contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO'`.
- `title` ← `metadata.lockupMetadataViewModel.title.content`.
- For each `metadataRow.metadataParts[*].text.content`, run the existing
  `parseViewCount` regex; first match wins for `viewCount`. Other text
  parts that don't parse as view-count populate
  `publishedAtRelative` (first non-numeric remainder).
- `thumbnailUrl` ← largest `image.sources[*].url`
  (sort by `width * height`).
- `durationSec` ← parse the
  `thumbnailBottomOverlayViewModel.badges[*].thumbnailBadgeViewModel.text`
  that matches `^\d+(:\d+){1,2}$` (drops "LIVE", "NEW", etc.).
- Returns null only if `videoId` missing.

Walker keeps the old branches; adds `lockupViewModel` to the trigger
set. Old `videoRenderer` / `gridVideoRenderer` paths remain for
search-results, watch-page sidebar, Shorts feed, and any locale or page
that still serves the old shape.

### Drift telemetry

In `scrapeChannel()`, after `extractVideoItems(videoTab)`:

- If `items.length > 0` but `videos.length === 0`, log
  `[koko channel-scrape] 0 items parsed from N renderers — selectors drifted`
  including a `Object.keys(items[0])` dump.
- If `items.length === 0` and `videoTab` had `content`, log similar
  "tab content present but no candidate renderers found".

Background `handleScrapeUrl` mirrors `handleScrapeActiveTab` logic:
when `reply.videos.length === 0`, set
`koko.platformWarn.youtube = 'Scrape returned 0 videos — selectors may have drifted.'`.
On success (`videos.length > 0`), clear that key.

### Storage shape

```ts
// types.ts
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

// storage.ts
KEY.scrapedVideos = 'koko.scrapedVideos';
// stored value: Record<string, ScrapedVideoCacheEntry> keyed by `${platform}::${videoId}`
storage.getScrapedVideos(): Record<string, ScrapedVideoCacheEntry>
storage.getScrapedVideo(platform, videoId): ScrapedVideoCacheEntry | null
storage.setScrapedVideos(entries: ScrapedVideoCacheEntry[]): Promise<void> // bulk upsert
```

Bounded growth: scrape writes overwrite by key. No TTL in this pass;
acceptable until we approach `chrome.storage.local` quota
(`unlimitedStorage` permission already declared, so practically
unbounded). LRU eviction is a follow-up.

### ScrapeControl component

Props:

```ts
interface Props {
  defaultDatabankId?: string; // when mounted from /databanks/:id
  onDone?: (summary: { okCount: number; total: number; videoCount: number }) => void;
}
```

State: selected channels (Set<string>, max 5), `latestN` (1–30, default
30), `targetBank` ('none' | databankId | '__new__'), new-bank name input,
busy, progress, err, lastSummary.

Submit:

1. If `targetBank === '__new__'`, create databank first.
2. `await batchScrapeChannels(ids, { latestN, databankId, signal })`.
3. Show done message; emit `onDone` callback.

The same component renders on HooksSubPage and on CrossChannel.

### DatabankDetail rewrite

```tsx
const bank = findById(storage.getDatabanks(), id);
const cache = storage.getScrapedVideos();
const rows = bank.videoRefs.map((r) => {
  const hit = cache[`${r.platform}::${r.videoId}`];
  return hit ?? fallbackRow(r);
});
// renders thumbnail, title, channel, views, "open on YT", "remove from bank"
```

`fallbackRow` for cache miss:
- thumbnail: `youtubeAdapter.thumbnail(videoId)` (always returns a URL).
- title: `'(no metadata — analyze video to populate)'`.
- channelTitle: `''`.
- viewCount: null.

Includes a top-mounted `<ScrapeControl defaultDatabankId={id}>` so the
"scrape and add" flow lives inside the bank as well.

### CrossChannel changes

- Drops inline scrape button, progress, abort.
- Mounts `<ScrapeControl>` at the top (no `defaultDatabankId`).
- Render section reads from `storage.getScrapedVideos()` filtered by
  `videoFilter` (if provided) and merged across all cached entries —
  matches existing toolbar behavior.

### AddToDatabankButton change

On confirm:

```ts
await storage.addVideoRef(bankId, ref);
const known = storage.getScrapedVideo(ref.platform, ref.videoId);
if (!known && video) await storage.setScrapedVideos([video]); // video param from VideoCard
```

`VideoCard` already has the metadata in scope; thread it through the
button's API.

## Testing

### Unit (vitest)

- `parseVideoRenderer` against a `lockupViewModel` fixture
  (`src/entrypoints/__fixtures__/lockupViewModel.sample.json` — slim
  copy of the live probe output for one item).
- `parseVideoRenderer` still passes existing `videoRenderer` /
  `gridVideoRenderer` fixtures.
- Skip `contentType !== LOCKUP_CONTENT_TYPE_VIDEO`.
- Duration parser handles "LIVE", "NEW", "0:26", "1:23:45".
- `niche-bridge` writes to `koko.scrapedVideos` on success.
- `niche-bridge` appends refs when `databankId` passed.
- DatabankDetail renders cache hits + fallback rows.

### Manual (Firefox temp add-on)

- Watchlist a real YT channel (NoPengoo). `/analyze` → Hooks → scrape
  → expect `Scrape complete: 1/1; 30 videos`.
- Console line: `[koko channel-scrape] success: UC... 30 videos`.
- No `koko.platformWarn.youtube` flag set.
- Same flow from `/compare` and `/databanks/:id`.
- Manually add a video to a fresh bank → bank shows the row (fallback
  metadata is fine).
- After scrape with `databankId` set, bank shows ~30 hydrated rows.

## Risks

- View-model shape might vary by region/locale variant (`m.youtube.com`,
  age-gated channels, premieres). Walker permissive (depth-12) +
  contentType gate should be robust; drift warn covers the rest.
- AddToDatabankButton API change requires updating call sites
  (`VideoCard`, search results panel). Search via grep before edit.
- `koko.scrapedVideos` shared across pages — reads must reflect writes.
  Storage layer already write-throughs and notifies hydration; no
  ordering risk since DatabankDetail re-reads on `useEffect([id])`.

## Rollout

Single PR (user picked bundled approach). Order of commits inside:

1. `fix(scrape): parse lockupViewModel grid items` — minimal fix +
   fixture + unit test. Ships the parser fix in isolation in case the
   reorg gets reverted later.
2. `fix(scrape): warn flag on zero-videos result from hidden tab` —
   background `handleScrapeUrl` mirror.
3. `feat(storage): koko.scrapedVideos cache + helpers` — types + storage
   + unit test.
4. `feat(scrape): persist results to scrapedVideos cache + optional
   databank append` — niche-bridge wrapper + types.
5. `feat(scrape): ScrapeControl component (channels, latestN, bank)` —
   new component + unit test.
6. `refactor(databanks): DatabankDetail renders refs from cache` —
   replace CrossChannel mount.
7. `feat(analyze): scrape entry on Hooks sub-page` — mount
   ScrapeControl on HooksSubPage.
8. `feat(compare): CrossChannel uses ScrapeControl + cache` — drop
   inline scrape, read cache.
9. `feat(databanks): manual-add caches video metadata` —
   AddToDatabankButton + VideoCard wiring.

Each commit keeps the test suite green.
