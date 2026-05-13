# Phase 9 — Instagram + TikTok Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land minimal scrape-only Instagram and TikTok adapters behind feature flags. v1 supports **resolveChannel by URL** and **recentUploads via DOM scrape from the active tab** (matching the YouTube content-script pattern in `entrypoints/youtube-channel.content.ts`). `videoDetails` and `transcript` return graceful stubs in v1 (the YT path remains the canonical full implementation). Selectors are fragile by nature — every parser emits a `koko.platformWarn.<platform>` flag when it gets zero items from a page that looks loaded, and a banner surfaces this on the active-tab card so the user knows the adapter needs maintenance.

Feature flags off by default — YT-only users are unaffected. When a user opens an IG/TT URL with the flag enabled, the background's active-tab handler routes the scrape to the platform-specific content script.

**Architecture:**
- `PlatformId = 'youtube' | 'tiktok' | 'instagram'` already declared in `src/types.ts`.
- `lib/platforms/instagram.ts` + `lib/platforms/tiktok.ts` — `PlatformAdapter` implementations. They delegate `recentUploads` to a content-script bridge keyed by platform (same scrape-active-tab message contract). `videoDetails` returns `[]` in v1 (logged "not supported"). `transcript` throws an unsupported error.
- Pure DOM parsers `parseInstagramProfile(html: string): ScrapedVideo[]` and `parseTikTokProfile(html: string): ScrapedVideo[]` exported from each adapter file so we can unit-test the regex/JSON extraction without a browser.
- Content scripts `entrypoints/instagram.content.ts` + `entrypoints/tiktok.content.ts` that load on the relevant URLs, run the parser, post back to background.
- `lib/platforms/index.ts` `getAdapter()` returns the right adapter; `listSupportedPlatforms()` filters by feature-flag.
- `koko.platformsEnabled: { instagram: boolean; tiktok: boolean }` + `koko.platformWarn.<platform>: string | null`.
- Settings page grows a "Experimental platforms" section with two toggles.
- WXT manifest: add IG/TT host_permissions + content-script matches.

**Tech Stack:** Same as Phases 1–8.

**Source spec:** `docs/superpowers/specs/2026-05-07-full-product-feasibility-and-design.md` §2.2 + §3.2 + §4 Phase 9. Multi-platform discipline per `remote.md` Hard Rule #2.

**Prerequisites:** Phases 1–8 shipped. Watchlist already accepts `Channel.platform`; YT adapter already exists.

---

## File Structure

**New files:**
- `extension/src/lib/platforms/instagram.ts`
- `extension/src/lib/platforms/tiktok.ts`
- `extension/src/lib/__tests__/instagramParser.test.ts`
- `extension/src/lib/__tests__/tiktokParser.test.ts`
- `extension/src/lib/__tests__/platformsEnabled.test.ts`
- `extension/src/entrypoints/instagram.content.ts`
- `extension/src/entrypoints/tiktok.content.ts`

**Modified files:**
- `extension/src/lib/platforms/index.ts` — register new adapters, respect feature flag
- `extension/src/lib/storage.ts` — `platformsEnabled` + `platformWarn` accessors
- `extension/src/app/routes/Settings.tsx` — Experimental platforms toggle section
- `extension/src/entrypoints/background.ts` — scrape-active-tab routes to platform content script
- `extension/wxt.config.ts` — add IG/TT host_permissions
- `extension/src/lib/messaging.ts` — extend kind enums where needed (audit only)

---

## Task 1: Feature-flag storage + tests

Add to `KEY`:
```
platformsEnabled: 'koko.platformsEnabled',
platformWarnPrefix: 'koko.platformWarn.',
```

Accessors:
```typescript
type PlatformsEnabled = { instagram: boolean; tiktok: boolean };

getPlatformsEnabled: () =>
  getCached<PlatformsEnabled>(KEY.platformsEnabled, { instagram: false, tiktok: false }),
setPlatformsEnabled: (v: PlatformsEnabled) => writeThrough(KEY.platformsEnabled, v),

getPlatformWarn: (p: PlatformId): string | null =>
  getCached<string | null>(`${KEY.platformWarnPrefix}${p}`, null),
setPlatformWarn: (p: PlatformId, msg: string | null) =>
  writeThrough(`${KEY.platformWarnPrefix}${p}`, msg),
```

Tests in `platformsEnabled.test.ts`: default state, toggle round-trip, warn round-trip. ~3 cases.

---

## Task 2: Pure parsers

Both platforms expose JSON in `<script type="application/ld+json">` and inline `<script>` blobs (TikTok has `__UNIVERSAL_DATA_FOR_REHYDRATION__`; IG has `_sharedData` / `additionalDataLoaded`). Selectors break often — keep the parser tiny + tolerant.

`instagram.ts`:

```typescript
export function parseInstagramProfile(html: string): ScrapedVideo[] {
  // 1. Try og:url to get the handle.
  const handle = html.match(/<meta property="og:url" content="https:\/\/www\.instagram\.com\/([^/?"]+)/)?.[1] ?? '';
  // 2. Find any application/ld+json that exposes video posts.
  const blobs = Array.from(html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g));
  const videos: ScrapedVideo[] = [];
  for (const b of blobs) {
    try {
      const j = JSON.parse(b[1]);
      // ld+json shape varies — defensively dig
      if (Array.isArray(j?.video)) {
        for (const v of j.video) {
          if (!v?.contentUrl && !v?.url) continue;
          videos.push({
            platform: 'instagram',
            videoId: extractIgId(v.url ?? v.contentUrl ?? ''),
            channelId: handle,
            channelTitle: handle,
            title: v?.description ?? v?.name ?? '(untitled reel)',
            publishedAt: v?.uploadDate ?? '',
            viewCount: Number(v?.interactionStatistic?.userInteractionCount ?? 0),
            thumbnailUrl: v?.thumbnailUrl ?? '',
          });
        }
      }
    } catch { /* malformed json — skip */ }
  }
  return videos;
}
```

`tiktok.ts`:

```typescript
export function parseTikTokProfile(html: string): ScrapedVideo[] {
  const blob = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!blob) return [];
  try {
    const j = JSON.parse(blob);
    const items = j?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo?.itemList
      ?? j?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.itemList
      ?? [];
    if (!Array.isArray(items)) return [];
    return items.slice(0, 30).map((it: TikTokItem) => ({
      platform: 'tiktok' as const,
      videoId: String(it.id),
      channelId: String(it.author?.uniqueId ?? ''),
      channelTitle: String(it.author?.nickname ?? it.author?.uniqueId ?? ''),
      title: String(it.desc ?? ''),
      publishedAt: it.createTime ? new Date(it.createTime * 1000).toISOString() : '',
      viewCount: Number(it.stats?.playCount ?? 0),
      thumbnailUrl: String(it.video?.cover ?? ''),
    }));
  } catch { return []; }
}
```

Tests:
- `parseInstagramProfile` on a fixture HTML string returns N videos with expected shape.
- Empty / malformed HTML returns `[]`.
- Same for TikTok.
- ~3 cases each.

---

## Task 3: Adapters

Each adapter:
```typescript
export const instagramAdapter: PlatformAdapter = {
  id: 'instagram',
  async resolveChannel(urlOrHandle) {
    const handle = parseHandle(urlOrHandle);
    return { platform: 'instagram', channelId: handle, handle, title: handle };
  },
  async recentUploads() {
    throw new Error('instagram.recentUploads must be called via the active-tab scrape bridge in v1');
  },
  async videoDetails() { return []; },
  async transcript() { throw new Error('instagram.transcript not supported in v1'); },
  thumbnail() { return ''; },
};
```

(Mirror for tiktok.)

`lib/platforms/index.ts` — register both adapters in `getAdapter`. Add `listEnabledPlatforms()` that consults `storage.getPlatformsEnabled()` for IG/TT (YT always on).

Tests: `getAdapter('instagram')` returns adapter; `getAdapter('tiktok')` returns adapter.

---

## Task 4: Content scripts

`entrypoints/instagram.content.ts`:

```typescript
import { defineContentScript } from 'wxt/utils/define-content-script';
import { parseInstagramProfile } from '~/lib/platforms/instagram';

export default defineContentScript({
  matches: ['https://www.instagram.com/*'],
  runAt: 'document_idle',
  main() {
    browser.runtime.onMessage.addListener(async (msg) => {
      if (msg?.type !== 'scrape-ig-profile') return undefined;
      const html = document.documentElement.outerHTML;
      const videos = parseInstagramProfile(html);
      return Promise.resolve({ videos });
    });
  },
});
```

Mirror for tiktok with `matches: ['https://www.tiktok.com/*']` and `scrape-tt-profile`.

The Firefox MV2 Promise pattern from `youtube-channel.content.ts` applies.

---

## Task 5: Background routing

Extend the existing `scrape-active-tab` handler. When `info.url` matches `instagram.com` AND `getPlatformsEnabled().instagram` is true, message the active tab with `scrape-ig-profile` instead of the YT scrape. Same for TT. If the scrape returns 0 videos but DOM is non-empty (`html.length > 50000` as a cheap signal), set `platformWarn` to "Selector mismatch — adapter may need maintenance."

Reuse existing bridge plumbing; add per-platform branches.

---

## Task 6: Settings UI + manifest + warn banner

Settings: experimental section with two toggles wired to `setPlatformsEnabled`.

`wxt.config.ts`:
```typescript
host_permissions: [
  ...existing,
  'https://www.instagram.com/*',
  'https://www.tiktok.com/*',
],
```

`ActiveTabCard` (or wherever scrape outcomes surface): if `storage.getPlatformWarn(platform)` is set, render a yellow banner with the message + dismiss button.

---

## Task 7: Verify + commit

Targets:
- tsc clean.
- Existing tests still pass; new tests ~8 (3 storage + 3 IG parser + 3 TT parser + ~3 adapter index).
- Build clean (will pull in IG/TT content scripts as new outputs).

Commit:
```
feat(extension): Phase 9 Instagram + TikTok adapter stubs (flagged)

- IG + TT adapters with pure DOM parsers (defensive against selector drift)
- Content scripts on instagram.com + tiktok.com (Firefox MV2 Promise pattern)
- Feature flags koko.platformsEnabled.{instagram,tiktok} default off
- koko.platformWarn.<platform> surfaces in active-tab card when scrape empty
- Settings: Experimental platforms section with two toggles
- Manifest: IG/TT host_permissions
- N new tests; tsc + build clean
```

## Out of scope (later)
- IG/TT NicheScan (in-app search) — IG/TT search requires logged-in scraping.
- IG/TT videoDetails + transcript — DOM yield is unreliable; v2 only.
- TikTok ~10s "show more" auto-paginate from script — current adapter snapshots the first ~30 items.
- Per-platform throttle/jitter settings.
- Multi-platform Watchlist UX polish.

## Known fragility (track in remote.md "Open Bugs" if smoke fails)
- IG removed ld+json on some pages around 2025-Q4 — parser yields 0 → expect warn banner. Fall back to extracting from `window._sharedData` inline blob in v1.1.
- TikTok renames `__UNIVERSAL_DATA_FOR_REHYDRATION__` occasionally — parser yields 0. Same warn banner.
- Both sites block iframe + cross-origin fetches — adapter is content-script-only by design.
