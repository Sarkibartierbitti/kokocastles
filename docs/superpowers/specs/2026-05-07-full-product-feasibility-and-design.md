# Kokocastles — Full Product Feasibility + Design

Date: 2026-05-07
Author: Claude (autonomous brainstorm — user unavailable, no clarifying-question pass)
Source: `docs/suggested _implementation.md` (target product) cross-referenced with current
`extension/` codebase (Phase C shipped on `remote-dev`).

This document is the **design spec** consumed by the planning routine that fires after
this commit. It is intentionally exhaustive about *what* is feasible inside a browser
extension, *what* must be degraded, and *what order* features should land. The planning
routine will turn each phase into a `docs/superpowers/plans/<slug>.md` file. The
implementation routine that fires 30 min later will execute the first 1–2 phases.

---

## 0. Operating constraints

The product MUST live entirely inside the WXT browser extension. All earlier attempts to
sit on a Cloudflare Worker proxy with a public API failed (fragile auth, quota, abuse).
The only allowed server-side surface is `proxy/` — the existing transcript proxy — and
that should stay narrow (transcript fetch only).

Implications:

- **All data sources** are either (a) the user's own platform API key (YouTube Data v3),
  or (b) DOM scraping inside content scripts loaded into youtube.com / instagram.com /
  tiktok.com pages, or (c) the LLM (Anthropic / Gemini / OpenAI-compat) routed through
  `extension/src/lib/llm/`.
- **All persistence** is `browser.storage.local`. Quota in MV2 Firefox is ~10 MB
  unlimited with `unlimitedStorage` permission. Thumbnails are stored as URLs, not
  blobs. Transcripts are stored as segment arrays (compact).
- **No backend state.** Hypotheses, databanks, ideas — all live per-install.
- **No background workers** other than the WXT background script + alarms.
- **Anthropic SDK browser-direct** is already wired; never default Opus per
  `feedback_model_cost.md` — `pickModel` in `lib/claude.ts` routes by task tier.

---

## 1. Inventory: what already exists

(Read from current `remote-dev` HEAD.)

### Routes
- `/` Watchlist (channels list, add, remove)
- `/channel/:platform/:channelId` Channel (uploads, refresh from active tab)
- `/video/:platform/:videoId` VideoAnalysis (triage + deep, hook, structure)
- `/settings` Settings (LLM key, YouTube key, provider, model)
- `/help` Help
- `/niche` NicheScan (search query → channels → mass-add)
- `/compare` CrossChannel (batch scrape watchlist channels, merged top-50 grid)

### Lib
- `lib/llm/*` — provider abstraction (Anthropic, Gemini, OpenAI-compat), `pickModel`,
  `callLLM`, model registry, task tier (triage/deep/synthesis/etc.)
- `lib/platforms/youtube.ts` — adapter via YouTube Data API v3 (channels, uploads,
  videos, transcript-via-bridge)
- `lib/platforms/types.ts` — `PlatformAdapter` interface (multi-platform-ready)
- `lib/storage.ts` — typed wrappers over `browser.storage.local`, hydrated cache
- `lib/transcript-bridge.ts` — talk to Cloudflare worker for captions
- `lib/transcript.ts` — `fullText`, `sliceByTime`
- `lib/prompts.ts` — Zod schemas + system prompts: triage, deep, outlierWhy, synthesis
- `lib/outlier.ts` — outlier ratio (views ÷ channel mean) + `isOutlier` flag
- `lib/export.ts` — CSV/XLSX export of `(Video, DeepAnalysis | null)` rows
- `lib/batch-queue.ts` — concurrency cap + jitter + abort signal for bulk scrape
- `lib/active-tab-bridge.ts` — sidebar talks to background to scrape active YT tab
- `lib/niche-bridge.ts` — `scrapeSearchQuery`, `scrapeChannelById`,
  `batchScrapeChannels`
- `lib/activity.ts` — activity panel events (LLM start/done/error)

### Content scripts
- `entrypoints/youtube.content.ts` (video page transcript hook)
- `entrypoints/youtube-channel.content.ts` (channel uploads scrape from
  `ytInitialData`)
- `entrypoints/youtube-search.content.ts` (search results scrape)
- `entrypoints/background.ts` (active-tab tracking, scrape-url handler)

### Shared types (`types.ts`)
- `Channel`, `Video`, `TranscriptSegment`, `OutlierFlag`, `TriageResult`,
  `DeepAnalysis` (hook + structure + pacing + techniques)
- `PlatformId = 'youtube' | 'tiktok' | 'instagram'` (declared, only YT implemented)

### Storage keys (`koko.*`)
- `llmKey`, `llmProvider`, `llmModel`, `youtubeKey`
- `watchlist` (Channel[])
- `triage.<platform>.<videoId>` (TriageResult cache)
- `deep.<platform>.<videoId>` (DeepAnalysis cache)

---

## 2. Feature-by-feature feasibility audit

For each item in `docs/suggested _implementation.md`, classify:

- ✅ **direct** — straight implementation, no new infra
- 🟡 **degraded** — feasible but with named compromise
- 🔴 **blocked** — not feasible inside extension; punt or replace

### 2.1 Analyze page — sub-page toggle [Videos | Hooks | Scripts]

✅ direct. New `/analyze` route with internal segmented toggle. Existing
`/channel/:platform/:channelId` becomes a *filter* of the videos sub-page (channel-
scoped feed), or merges in. Recommended: keep `/channel/...` as deep link, add
`/analyze` as the cross-channel default.

#### 2.1.1 Videos sub-page

| Toolbar item | Status | Notes |
|---|---|---|
| Add video URL | ✅ | URL → classifyUrl → fetch via adapter, append to feed |
| Bulk analyze 10–30 | ✅ | `batch-queue.ts` already gates concurrency |
| Filter (likes / views / outlier / date) | ✅ | client-side over feed |
| Sort by (same fields) | ✅ | client-side |
| Export xlsx/csv (field ticks) | 🟡 | `export.ts` exists; extend with field-pick UI |
| Count badge "Showing X of Y" | ✅ | derived state |
| Paginated card grid | ✅ | virtualize with `react-window` if >500 |
| Detail page | ✅ | reuse `/video/:platform/:videoId` |
| "Add to databank" | ✅ | once databanks land (§2.3) |
| Select mode + Top X / Bottom X / Custom filter | ✅ | local state machine |
| Remove for session / Remove permanently | ✅ | session list in memory; permanent → `koko.hidden.<platform>.<videoId>` |
| Outlier score | ✅ | `outlier.ts` already; threshold from settings |

#### 2.1.2 Hooks sub-page

| Item | Status | Notes |
|---|---|---|
| Aggregate hooks from analyzed cache | ✅ | iterate `koko.deep.*` |
| Written hook text | ✅ | `deep.hook.spoken` + `deep.hook.onScreen` |
| Audio hook (transcribed) | ✅ | derive from `transcript[0..5s]` |
| **Visual hook (in-video frame)** | 🔴→🟡 | See §3.1 — punt to thumbnail + `?t=2` deep-link in v1 |
| "Analyze [N] more" footer action | ✅ | drains next N unanalyzed videos in feed |
| Category bubbles ("best for" tags) | ✅ | LLM call with closed enum (§3.4) |

#### 2.1.3 Scripts sub-page

✅ direct. Same shape as Hooks but body is full transcript. Cache from `transcript`
already fetched during deep analysis. Add `koko.transcript.<platform>.<videoId>` key
so we don't re-fetch.

### 2.2 Channels page

| Item | Status | Notes |
|---|---|---|
| Add channel by URL | ✅ | exists |
| Search in-app | ✅ | NicheScan already does YT search |
| Sort by subscriber count | ✅ | `Channel.subscriberCount` is captured |
| Remove | ✅ | exists |

### 2.3 Databanks

🟡 — feasible but **new subsystem**. Design:

```
type Databank = {
  id: string;              // uuid
  name: string;
  createdAt: string;
  videoRefs: { platform: PlatformId; videoId: string }[];
};
```

Storage key: `koko.databanks` (Databank[]). Membership lookups go through a derived
index on hydrate. Inside-databank view reuses the Videos sub-page in "filtered to
databank" mode. No new card design.

### 2.4 Ideas page

✅ direct. Pure LLM call: input = (selected videos OR databank), output = list of
`{ idea, sourceVideoIds, score }`. Storage `koko.ideas` (Idea[]) with two-bucket
state `bucket: 'inbox' | 'shortlist'`. Empty state matches sandcastles. Search/sort/
export reuse existing primitives.

### 2.5 My Channel + Hypotheses

🟡 — feasible with caveats:

- **Linking own channel:** add `koko.ownChannel: Channel | null` to settings.
- **"Fetches videos when channel updates"** — extension cannot subscribe to
  YouTube. Replacement: `chrome.alarms` polling every 6 h that calls
  `recentUploads(ownChannelId, 50)` and merges new IDs. Surface a "Refresh now"
  button so the user does not depend on the alarm.
- **Hypothesis schema:**

```
type Hypothesis = {
  id: string;
  name: string;
  description: string;
  manualVideoIds: string[];      // user-ticked existing videos
  applyToNext: number;           // N
  appliedAuto: string[];         // videoIds the alarm tagged
};
```

Storage `koko.hypotheses`. Filter/sort surfaces in the videos feed when
`scope === 'myChannel'`. Auto-tagging happens in the alarm handler.

### 2.6 Writer

🟡 — feasible. The sandcastles XML pattern is already documented in
`docs/sandcastles-reference.md` §AI-Prompts. Plan:

- New `/writer` route. State = thread of messages + selected context refs.
- `+` button → modal that lets user select databanks (full or per-video), persona,
  and uploaded files (read via `FileReader` to text; PDFs out of scope v1).
- Model selector reuses existing `pickModel` ladder (`triage` → Haiku, `deep` →
  Sonnet, `writer` → Sonnet by default, manual override to Opus).
- Multi-step conversational flow: clarify → personalize → draft → iterate. State
  machine in component, no backend. Persist threads under
  `koko.writerThreads.<id>` so user can resume.

### 2.7 Persona

✅ direct. New `/persona` route. Three textareas with char limits per
sandcastles-reference.md §Persona. Storage:

```
koko.persona = {
  niche: string;        // ≤5000
  context: string;      // ≤5000
  styleSample: string;  // ≤3000
  attachedDatabankIds: string[];
}
```

Niche feeds NicheScan + Ideas. Context + styleSample feed Writer.

### 2.8 Settings

✅ direct. Add to existing route:

- Outlier threshold (number, default 1.5)
- Own channel link (resolved to `Channel` then stored under `koko.ownChannel`)
- Refresh interval for own-channel polling (default 6 h)
- Throttle defaults (concurrency, jitterMs) — already in remote.md backlog
- Per-platform extension-config block (placeholder for IG/TT adapter config)

---

## 3. Bottlenecks called out by name

### 3.1 Visual hook frame extraction 🔴

The spec asks for "in-video frame, not just thumbnail". Inside an extension:

- Cannot stream the video file directly (DRM + auth + bandwidth).
- Could open the video in a hidden tab, scrub to t=2s via `<video>.currentTime`,
  draw to canvas, capture data URL. Will be slow (≥3 s per video), brittle (ads,
  consent dialogs, A/B paywalls), and costly to render in bulk.
- **Recommendation v1:** stay on thumbnail; render a "▶ play 0:00–0:05" link that
  opens the video at `?t=0` in a side window. Re-evaluate after Phases 1–4 are
  shipped.

### 3.2 IG / TikTok adapters 🟡

Phase C track-D in remote.md already plans this. For this product spec:

- IG adapter: content script on `instagram.com/reel/...` and `instagram.com/<user>`
  that returns `ScrapedVideo[]` matching the YT contract. Subscriber/view counts
  from rendered DOM (selectors are unstable — ship a shape-mismatch warning).
- TT adapter: content script on `tiktok.com/@<user>` and `tiktok.com/video/<id>`.
  Similar shape.
- Both behind feature flags so a regression in selectors does not poison YT users.

### 3.3 Storage quota 🟡

`browser.storage.local` defaults to ~10 MB. With 5000 cached deep analyses
(~2 KB each) + 5000 transcripts (~5 KB each) we are at 35 MB. Solutions:

- Request `unlimitedStorage` permission in `wxt.config.ts`.
- LRU eviction on `koko.deep.*` and `koko.transcript.*` capped at user-set N
  (default 10 000 entries, surfaced in Settings).
- Don't persist thumbnails as base64 — keep URLs and re-fetch when needed.

### 3.4 Hook category classifier 🟡

Sandcastles ships a hand-curated category list. We can:

- Scrape category names from sandcastles' public default-hooks page once at
  build time, store as a static enum in `lib/hookCategories.ts`. (Names are
  facts, not creative content — low IP risk.)
- LLM call (triage tier — Haiku) that picks the closest category from that
  enum. Refuse to invent new categories.

### 3.5 Bulk analyze cost 🟡

A 30-video bulk analyze with deep tier (Sonnet) at ~1500 output tokens each =
~$0.40 per run. Surface estimated cost *before* user commits, derived from
`pickModel(task)` + token estimate. Already half-built — `activity.ts` tracks
cost per call; just needs a pre-flight estimator.

### 3.6 Multi-step Writer flow state 🟡

The conversational flow needs persistence (user closes sidebar mid-draft). Use
indexed storage with one key per thread; cap to 50 threads with LRU; surface a
"resume" picker at top of /writer.

### 3.7 Channel-feed pagination 🟡

A user with 50 watched channels × 50 uploads = 2500 cards. React-window
virtualization is required; CSS grid layout with windowing is doable.

### 3.8 Outlier requires channel-mean views 🟡

Already implemented in `lib/outlier.ts`. New requirement: **per-channel mean
caching** so we don't recompute every render. Store
`koko.channelStats.<platform>.<channelId> = { meanViews, sampleSize, updatedAt }`
and refresh whenever uploads list refreshes.

---

## 4. Phasing — order of implementation

The implementation routine that fires 30 min after this commit will pick up
**Phase 1** and execute it via `superpowers:executing-plans`. Subsequent
iterations of the existing 90-min cloud cadence (see `remote.md`) will pick up
later phases, one per fire.

### Phase 1 — Navigation + Persona + Settings extensions [SMALL, FOUNDATION]

1. Add `/persona` route with the three-textarea card layout. Storage
   `koko.persona`.
2. Extend Settings: outlier threshold, own-channel input, refresh-interval
   slider, throttle defaults exposed.
3. Add LRU eviction config UI (cap N).
4. Sidebar nav reorder: `Analyze | Channels | Databanks | Ideas | My Channel
   | Writer | Persona | Settings | Help` (stub routes for not-yet-built ones,
   each rendering "coming soon").
5. Move `/` from Watchlist to a placeholder Analyze route shell that renders
   the existing CrossChannel grid as the Videos sub-page (so the homepage
   actually shows videos by default).
6. **Verification:** tsc clean, all existing tests still pass, build clean.

### Phase 2 — Databanks subsystem [SMALL]

1. `koko.databanks` storage + CRUD helpers.
2. `/databanks` list page (create / rename / delete / video-count).
3. `/databanks/:id` reuses Videos-sub-page in filter mode.
4. "Add to databank" action on every video card.
5. Tests for storage helpers + dedupe behavior.

### Phase 3 — Analyze page real shell + Hooks/Scripts sub-pages [MEDIUM]

1. Sub-page toggle `[Videos | Hooks | Scripts]` inside `/analyze`.
2. Videos sub-page: filter / sort / search / select-mode / Top-X / Bottom-X /
   per-card add-to-databank / extended export with field ticks.
3. Hooks sub-page: aggregator over `koko.deep.*`. "Analyze N more" CTA.
4. Scripts sub-page: same as hooks but transcript body. New
   `koko.transcript.*` cache.
5. Storage migration: replay existing `koko.deep.*` to populate hook indexes.
6. Tests: aggregator, filter, sort, select-mode reducers.

### Phase 4 — Ideas page [SMALL]

1. `/ideas` route + Inbox / Shortlist buckets.
2. "Generate ideas from current feed / from databank" action.
3. New LLM task `ideas` (Haiku tier; closed-shape Zod schema; 8–12 ideas per
   call).
4. Empty state matches sandcastles reference.

### Phase 5 — Writer v1 [MEDIUM]

1. `/writer` route. Single-shot (non-conversational) script generation taking
   persona + databank + free-text topic.
2. Reuse existing XML-pattern prompt builder.
3. Model selector with tier ladder.
4. Persist threads `koko.writerThreads.<id>`.

### Phase 6 — My Channel + Hypotheses [MEDIUM]

1. `/my-channel` route + analytics view (sort/filter by views, outlier, likes,
   hypothesis).
2. Hypothesis CRUD with manual-tick + apply-to-next-N.
3. `chrome.alarms` poll every 6 h calling `recentUploads(ownChannelId, 50)`.
4. Auto-tag the next N uploads after a hypothesis is created with
   `applyToNext > 0`.

### Phase 7 — Hook categories [SMALL]

1. Static enum `lib/hookCategories.ts` (names scraped from public sandcastles
   default-hooks page at build time).
2. LLM task `categorizeHook` (Haiku, closed enum). Run on cache miss when
   Hooks sub-page renders.
3. Bubble UI on each hook card.

### Phase 8 — Writer multi-step flow [MEDIUM]

1. State machine: clarify → personalize → draft → iterate.
2. Inline UI for personalization-options selection.
3. Markdown rendering of drafts; "regenerate paragraph" affordance.

### Phase 9 — IG / TikTok adapters [LARGE, optional]

1. `lib/platforms/instagram.ts` + content scripts on instagram.com.
2. `lib/platforms/tiktok.ts` + content scripts on tiktok.com.
3. Multi-platform watchlist surface.
4. Selector-mismatch warning banners.

### Phase 10 — Visual hook frame [LARGE, optional, only if 1–9 done]

1. Hidden tab strategy: open video, seek to t=2s, draw to canvas, persist
   `koko.frame.<platform>.<videoId>`.
2. Background queue for frame capture, max 1 concurrent.
3. Surface in Hooks sub-page.

---

## 5. What we are NOT building (YAGNI)

- Cloud sync of databanks / personas (single-install only, deliberate).
- Server-side script storage (browser-extension only).
- Stripe / paywall (free product, deliberate).
- Real-time collaboration on a script.
- Proprietary sandcastles default-hooks copy (we build our own from analyzed
  videos; only category *names* are reused, see §3.4).
- Pixel-perfect sandcastles theme (we use koko-sky / koko-pink palette).
- Public API or webhooks.

---

## 6. Open questions left to the planning routine

The planning routine MAY refine:

1. Whether Phase 1's homepage shows the Videos sub-page or the existing
   Watchlist (UX call — recommend Videos sub-page, since that is what the
   target product opens to).
2. Whether to gate Hypotheses behind a feature flag in v1.
3. Whether to ship the LRU eviction config in Phase 1 or defer to a later
   "Settings polish" phase.
4. Whether the Writer thread storage should be IndexedDB rather than
   `browser.storage.local` (only if we expect transcripts > 100 KB per thread).

---

## 7. Acceptance criteria for this spec

- Every feature in `docs/suggested _implementation.md` is mapped above as
  ✅ / 🟡 / 🔴.
- Every 🟡 names its compromise.
- Every 🔴 names its degradation strategy.
- Phases are ordered such that early phases unblock later ones (Persona +
## 8. Handoff to planning routine

This spec is the input to `superpowers:writing-plans`. Expected output: one
plan per phase under
`docs/superpowers/plans/2026-05-07-phase-<N>-<slug>.md`. Phase 1 plan must be
detailed enough that the implementation routine 30 min later can run
`superpowers:executing-pl
  Databanks before Writer; Analyze shell before Hooks/Scripts sub-pages).
- All work fits inside the WXT extension; the only server surface is the
  existing transcript proxy.

---

## 8. Handoff to planning routine

This spec is the input to `superpowers:writing-plans`. Expected output: one
plan per phase under
`docs/superpowers/plans/2026-05-07-phase-<N>-<slug>.md`. Phase 1 plan must be
detailed enough that the implementation routine 30 min later can run
`superpowers:executing-plans` against it without further user input.
