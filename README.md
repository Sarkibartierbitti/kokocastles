# kokocastles

Free, BYO-key short-form video analysis — Firefox extension that analyzes
YouTube channels, hooks, and outliers using your own LLM provider keys.

## Quick start

```bash
cd extension
npm install
npm run dev
```

Firefox launches with the extension loaded. Click the toolbar icon to open
the sidebar, then click "Open kokocastles sidebar".

## Architecture

- `extension/` — Firefox extension (wxt + React + Tailwind)
  - Sidebar UI: full app — settings, watchlist, channel + video analysis, export
  - Background service worker: message router, transcript orchestration via hidden tabs
  - YouTube content script: scrapes `ytInitialPlayerResponse` for captions from the user's
    own residential IP (bypasses 429 datacenter blocks)
- `archive/` — original Vite web app + Cloudflare Worker proxy (no longer maintained;
  preserved as artifact)
- `docs/superpowers/plans/` — implementation plans

## Why an extension?

YouTube hard-blocks server-side caption fetch from datacenter IPs (CF Workers, AWS, etc.)
since the 2024 PoToken rollout. Browser extensions inherit the user's residential IP
and can read `window.ytInitialPlayerResponse` directly from page context — no scraping
arms race.

## Provider support (12)

Anthropic · OpenAI · Google Gemini · Mistral · DeepSeek · xAI Grok · Moonshot Kimi ·
Z.ai (GLM) · OpenRouter · Groq · Together AI · Fireworks AI

Auto-detected by key prefix where unambiguous; manual select otherwise.

## Status

- YouTube: shipped
- Instagram, TikTok: planned (separate content scripts per platform)
- AI chat: planned (next phase)
- Cloud sync / multi-device: planned (would need backend)

See `docs/superpowers/plans/2026-05-02-firefox-extension-pivot.md` for migration history.

## Scripts

```bash
npm run dev          # wxt dev server, Firefox launches with extension loaded
npm run build        # production build → .output/firefox-mv2/
npm run zip          # build + zip for self-hosted install
npm test             # vitest run
npm run compile      # tsc --noEmit
```
