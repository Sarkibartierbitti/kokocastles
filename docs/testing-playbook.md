# Kokocastles — Testing Playbook

Per-phase test flows, marked **auto** (Claude can run via MCP + dev tools,
no human in the loop) or **manual** (needs real Firefox + the loaded
extension; can't be done without you).

> Legend:
> - 🤖 **auto** — runnable via vitest, playwright MCP, or shell commands.
>   Claude can do this end-to-end and report PASS/FAIL.
> - 🧑 **manual** — needs the actual extension loaded in Firefox via
>   `about:debugging → Load Temporary Add-on → .output/firefox-mv2/manifest.json`.
>   You drive the UI; Claude can only diagnose from logs you paste.
> - 🟡 **hybrid** — Claude can run a partial check (UI render, storage
>   shape, YT page structure); golden path still needs you.

## Constraints that force "manual"

These hard limits make some flows un-automatable from Claude's side:

- `browser.tabs.create` (hidden-tab scrape pipeline) only works inside a
  real extension runtime. Playwright/Chrome DevTools MCP can't simulate it.
- `browser.runtime.sendMessage` between sidebar ↔ background ↔ content
  scripts only works inside the extension.
- Cross-origin fetches to `api.anthropic.com`, `api.openai.com`,
  `openrouter.ai`, `googleapis.com/youtube/v3` from `localhost:8765`
  (mocked sidebar) hit CORS. Real extension has `host_permissions` that
  bypass this.
- Firefox-only `sidebar_action` panel rendering — playwright runs
  Chromium.

## Per-phase test flows

### Phase 1 — Foundation, nav, persona, settings

| Check | Mode |
|---|---|
| All 149 unit tests pass — `npm test` | 🤖 |
| tsc clean — `npm run compile` | 🤖 |
| Production build clean — `npm run build` | 🤖 |
| Sidebar bootstrap renders nav (Analyze \| Channels \| Databanks \| Ideas \| My Channel \| Writer \| Persona \| Niche \| Compare \| Settings \| Help) | 🤖 (playwright + mocked `browser.storage`) |
| /persona — 3 textareas with `maxLength` 5000/5000/3000, Research/Scripting badges, char counters | 🤖 |
| /settings — 4 sections (API keys, Analysis defaults, Throttling & refresh, My channel) with defaults outlier=1.5, LRU=10000, concurrency=2, jitter=2500, refresh=6h, ownChannel='' | 🤖 |
| Stub routes /databanks, /ideas, /my-channel, /writer render ComingSoon with phase badge | 🤖 |
| `koko-card` and `koko-btn` styles applied (visual polish) | 🟡 — render is auto, palette eyeball is yours |
| /persona save persists to `koko.persona` and reloads correctly | 🧑 (mocked browser.storage in playwright doesn't survive page reload; real ext does) |
| Settings own-channel input → lazy YT resolve via `youtubeAdapter.resolveChannel` → save to `koko.ownChannel` | 🧑 (needs real YT key + real fetch) |

### Phase 2 — Databanks

| Check | Mode |
|---|---|
| Unit tests (helpers + storage CRUD + DatabanksList + DatabankPicker + DatabankDetail) — 27 cases | 🤖 |
| /databanks empty state | 🤖 |
| Create databank → name validation (empty / >80 chars rejected) | 🤖 |
| AddToDatabankButton on VideoCard opens picker modal | 🟡 — React-controlled inputs don't accept synthetic DOM events well in playwright; vitest already covers this |
| /databanks/:id renders CrossChannel filtered to that bank's video refs | 🟡 — render is auto; actual scraped videos populating the bank is manual |
| Delete databank prompts `window.confirm`, removes entry, persists | 🧑 (confirm dialog) |

### Phase 3a — Hooks + Scripts aggregators

| Check | Mode |
|---|---|
| Unit tests (aggregators + storage transcript cache + HooksSubPage + ScriptsSubPage) — 12 cases | 🤖 |
| /analyze → Hooks tab empty state when no `koko.deep.*` entries | 🤖 |
| /analyze → Hooks tab renders one HookCard per `koko.deep.*` entry (visual / written / audio columns) | 🟡 — empty render auto; populated render needs real `koko.deep.*` entries from a real LLM run |
| ScriptCard expand/collapse over 280 chars | 🤖 |
| HookCard 0–5s audio hook derived from transcript | 🤖 (unit test) |
| End-to-end: analyze a video → see hook + script appear in tabs | 🧑 (needs LLM key + real `lib/llm/tasks.analyzeDeep` from the extension's CORS-allowed origin) |

### Phase 3b — Videos toolbar

| Check | Mode |
|---|---|
| Unit tests (feedFilter helpers + storage hidden + ExportFieldPicker integration) — 13 cases | 🤖 |
| VideoToolbar render — search input, min-views, min-likes, min-outlier, from-date, sort dropdown, export button, count badge | 🤖 |
| ExportFieldPicker modal — 10 field ticks default-on, csv/xlsx select | 🤖 |
| Export to file (CSV/XLSX) — `videosToCSV` / `videosToXLSX` produce correct columns | 🤖 (unit test or playwright-triggered download) |
| Hide buttons (session + permanent) drop rows from grid; permanent persists to `koko.hidden.<platform>.<videoId>` | 🟡 — state changes are auto; persistence across real extension reload is manual |
| CrossChannel pipeline (search → filter → sort → applyHidden → top 50) | 🤖 (unit-level via feedFilter) |
| **Full pipeline with scraped data populating the grid** | 🧑 (needs hidden-tab scrape — extension only) |

### Phase 4 — Ideas page

| Check | Mode |
|---|---|
| Unit tests (storage CRUD + ideasSchema + IdeasRoute behavior) — 10 cases | 🤖 |
| /ideas empty state with sandcastles copy | 🤖 |
| Inbox / Shortlist tab toggle filters ideas correctly | 🤖 (vitest already covers; playwright optional) |
| Move idea between buckets via button | 🤖 |
| Search filters by title + rationale | 🤖 |
| **"Generate from feed" — actual LLM call to `generateIdeas`** | 🧑 (needs LLM key from real extension origin) |
| Ideas persist across reload | 🧑 (real `browser.storage.local`) |

### Quota meter

| Check | Mode |
|---|---|
| `QuotaMeter` renders in sidebar header with tooltip showing `0 / 10,000 units used today (UTC)` | 🤖 |
| Bar tones: sky < 80%, amber ≥ 80%, rose ≥ 100% | 🟡 — code review + storybook-style render; populated bar needs real YT calls |
| `storage.getYtQuotaToday` auto-rolls when UTC day changes | 🤖 (unit test if added; today only checked manually) |
| Actual YT Data API calls increment counter (Settings own-channel resolve, Channel route refresh) | 🧑 |

### Scrape pipeline (cross-phase)

| Check | Mode |
|---|---|
| Content script registers Promise-returning onMessage listener (Firefox MV2 pattern) | 🤖 (code review + tsc) |
| `/channel/<id>/videos` ytInitialData has gridVideoRenderer items + Videos tab selected | 🤖 (playwright probe on real youtube.com) |
| Locale-agnostic tab matcher picks the right tab on RU / FR / etc. YT | 🟡 — playwright probe per locale; full content-script run needs ext |
| Active-tab card on `/@handle` retries via hidden `/videos` tab when first pass returns 0 videos | 🧑 (needs `browser.tabs.create`) |
| NicheScan `/results?search_query=...` → discovered channels list + top videos list | 🧑 |
| /compare batch scrape → "Scrape complete: X/Y channels succeeded; N videos total" + grid | 🧑 |
| Activity panel shows `scrape-search` / `scrape-channel` entries with detail URL | 🧑 (real ext) |
| 15s tab-load timeout + 8s ytInitialData timeout — slow networks no longer false-timeout | 🧑 (manual; depends on network) |

### Transcript / video analysis (flagged broken)

| Check | Mode |
|---|---|
| `/video/:platform/:videoId` route mounts | 🤖 |
| Transcript fetch from `entrypoints/youtube.content.ts` via player-response → transcript bridge | 🧑 (needs `/watch?v=...` open + extension content script) |
| `analyzeTriage` + `analyzeDeep` LLM tasks complete + persist to `koko.triage.*` / `koko.deep.*` | 🧑 (LLM key + CORS from extension) |
| Diagnostic next steps (when you're ready): paste the exact error message from sidebar console + activity panel | 🧑 |

## Manual smoke-test golden path (~15 min)

Use this after major phases land. Assumes OpenRouter + YT keys pasted
(see `docs/dev-test-fixture.md`).

1. Build → load `.output/firefox-mv2` as temp add-on.
2. Open sidebar. Paste keys in /settings, save.
3. /niche → "making pastry" → expect channels list + videos list with
   +watchlist buttons.
4. /channels → open `https://www.youtube.com/@nopengoo` in main tab →
   active-tab card → "Add to watchlist (scrape uploads)" → expect
   `[koko channel-scrape] success: UC... 30 videos` in console (or
   retry log + 30 videos after `/videos` fallback).
5. /compare → check NoPengoo → Scrape → expect
   `Scrape complete: 1/1 channels succeeded; 30 videos total` + grid.
6. /analyze → Videos tab inherits CrossChannel grid (same as /compare
   render). Toolbar: search, filter min-views, sort.
7. /analyze → Hooks tab + Scripts tab: empty state until a video gets
   analyzed (next step).
8. Click a video → /video/:platform/:videoId → triage + deep analysis.
   **This is the currently-broken path — see Transcript / video
   analysis section above.**
9. /databanks → create "Smoke test" → from any video card click
   "+ databank" → pick "Smoke test" → /databanks/Smoke test renders
   that video in the grid.
10. /ideas → "generate from feed" → expect 8–12 ideas in Inbox tab.
11. /persona → fill three fields, save. Reload extension. /persona
    fields rehydrate.
12. Quota meter in sidebar header: hover tooltip shows expected unit
    count (Settings own-channel resolve = 1 unit).

## Reporting back

When a flow fails, paste:
- Console lines starting with `[koko ...]` (specific log path).
- Activity panel: expand the bottom bar, hover the ✗ entry, paste
  tooltip text.
- The exact error string from the UI (red text under a section card).

Bonus: paste `git log --oneline -5` so we know which commit you're
testing against.
