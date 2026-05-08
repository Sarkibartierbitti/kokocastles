# Dev test fixture

User-provided test credentials and sample data for manual smoke testing
the extension. Keys themselves are NOT committed (Github push-protection
blocks them); paste them into the extension's Settings page from your
local notes file.

> Owner note: keys + accounts the user shares for this purpose are
> sacrificial. The user has stated they don't mind the OpenRouter
> balance being spent or the Google account being banned ("I have
> ten"). Do NOT reuse these for production work. Rotate after each
> round of debugging.

## LLM key (OpenRouter)

- Format: `sk-or-v1-<64-hex>`
- Provider auto-detect lands on **OpenRouter**.
- Recommended test model: **gpt-5.4-mini** (cheap, vision-capable).

## YouTube Data API v3 key

- Format: `AIza<35-char>` (Google Cloud API key)
- Free tier: 10,000 quota units / day per Cloud project.
- Used by `extension/src/lib/platforms/youtube.ts` for the channel
  resolve / uploads / videos endpoints (when DOM-scrape isn't taken).
- Live usage is shown in the sidebar header by the `QuotaMeter`
  component (top-right scale bar, hover for exact units).

## Sample channel

```
https://www.youtube.com/@nopengoo
```

Use for: Settings → My Channel input, Watchlist add, Channel route smoke.

## Sample niche query

```
making pastry
```

Use for: NicheScan (`/niche`) — should return ~15–20 unique channels +
20 video results.

## Quick-start manual test sequence

1. Build + load extension (`cd extension && npm run build` → load
   `.output/firefox-mv2` as temporary add-on in `about:debugging`).
2. Open the sidebar, navigate to `/settings`.
3. Paste your OpenRouter key into "LLM API key". Provider auto-sets to
   OpenRouter; pick **gpt-5.4-mini** if the model picker doesn't.
4. Paste your YouTube API key into "Google YouTube Data API key".
5. Optionally paste `https://www.youtube.com/@nopengoo` into "Own
   channel URL" — resolved + saved on Save.
6. Save.
7. Navigate to `/niche`, type `making pastry`, hit Scan.
8. Expected stage transitions: `opening tab… → waiting for YT… →
   scraping… → done`. Discovered-channels list + top-videos list render.
9. Watch the quota meter in the header — `/niche` is DOM-scrape only,
   so it does NOT consume YT quota. The meter only ticks when you use
   features that hit `googleapis.com` (Settings own-channel resolve,
   future Channel-uploads refresh).

## Debugging tips

- If you change extension code and reload, you MUST also reload any
  open YouTube tabs — content scripts only inject on page load.
- The hidden-tab scrape pipeline opens
  `https://www.youtube.com/results?search_query=…` in a non-active
  tab, waits up to 15s for `complete` status, then asks the content
  script to read `ytInitialData`. If YT serves a CAPTCHA gate or login
  wall, the scrape fails with `ytInitialData missing` or `no search
  results renderer`.
- Watch the activity panel at the bottom of the sidebar for in-flight
  scrape + LLM calls. Errors show as ✗ with a hover-tooltip message.
- Sidebar console: right-click sidebar → Inspect → Console tab. Look
  for `[koko nichescan]` lines for scrape diagnostics.
