# kokocastles

free [sandcastles.ai](https://sandcastles.ai) clone — viral short-form video analysis, BYO API keys, zero subscription.

paste a YouTube channel → see recent uploads → flag outliers → click any video → Claude breaks down the hook, structure, pacing, and reusable techniques.

## status

v1: **YouTube** watchlist + outlier detection + per-video analysis (hook + structure JSON via Claude tool use).
v2 (planned): TikTok + Instagram via Apify actors, browser-extension fallback, multi-video script synthesis, niche-tuned prompts, vault.

## stack

- Vite + React + TypeScript + Tailwind — static SPA, light-blue/pink theme.
- `@anthropic-ai/sdk` direct from browser (`dangerouslyAllowBrowser: true`).
- YouTube Data API v3 direct from browser.
- One Cloudflare Worker (`proxy/transcript.ts`) for caption fetch (`youtube.com/watch` is CORS-blocked).
- All state in `localStorage`. No accounts, no DB, no per-user infra cost.

## you supply

- **Anthropic API key** — paid by you per token. Settings page → tier mode controls cost (Eco = Haiku-only, Standard = Haiku triage + Sonnet deep, Max = Sonnet triage + Opus synthesis).
- **Google YouTube Data API key** — free 10k units/day per Google Cloud project.

keys never leave your browser; calls go direct from the SPA to Anthropic / Google.

## model routing

centralized in [src/lib/claude.ts](src/lib/claude.ts) `pickModel(task, tier)`:

| task | standard | eco | max |
|------|----------|-----|-----|
| triage scan (parallel across N videos) | haiku 4.5 | haiku | sonnet |
| outlier "why" one-liner | haiku 4.5 | haiku | sonnet |
| deep analysis (single video) | sonnet 4.6 | haiku | sonnet |
| synthesis (v2, multi-video) | sonnet 4.6 | sonnet | **opus 4.7** |

Opus is never auto-routed outside Max. Per-task overrides under Settings → advanced.

## platform abstraction

all consumer code talks to `PlatformAdapter` ([src/lib/platforms/types.ts](src/lib/platforms/types.ts)). v1 ships only `youtubeAdapter`. Adding TikTok/Instagram = one new file under [src/lib/platforms/](src/lib/platforms/) + a registry entry; UI, outlier math, prompts stay untouched.

## run

```sh
npm install
npm run dev          # http://localhost:5173
npm test             # vitest
npm run build        # static dist/
```

deploy frontend to Netlify/Vercel/GH Pages. Deploy the worker separately:

```sh
cd proxy
npx wrangler deploy
```

then set `VITE_PROXY_URL=https://<your-worker>.workers.dev` in `.env`.

## flow

1. Settings → paste both keys, pick tier.
2. Watchlist → paste a channel URL/@handle/UC-id → resolves + saves.
3. Channel page → recent 30 uploads, outliers (≥ 2× channel-median views) badged pink. Click **Triage hooks** → Haiku scans each in parallel (cap 6, cached). Click **Why outliers?** → Haiku one-liners.
4. Video page → thumbnail base64'd + transcript (or pasted fallback) → Sonnet returns structured `{hook, structure[], pacing, techniques[]}` via forced tool_use. Cached.

## license

MIT — see [LICENSE](LICENSE).
