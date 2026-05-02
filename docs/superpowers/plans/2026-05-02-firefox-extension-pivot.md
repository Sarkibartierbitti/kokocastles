# Firefox Extension Pivot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert kokocastles from Vite web app + Cloudflare Worker into a Firefox MV3 extension where the entire UI lives in a sidebar panel, transcript + channel data are scraped from the user's residential IP via a content script on `youtube.com`, and storage moves to `browser.storage.local`.

**Architecture:** Three runtime contexts. (1) **Sidebar** hosts the React app (all current routes via HashRouter). (2) **Background service worker** routes messages between sidebar and content scripts, queues batch jobs, owns the YouTube Data API key (network requests run from extension origin → no CORS). (3) **YouTube content script** runs on `*.youtube.com/*`, scrapes `ytInitialPlayerResponse` for captions, posts data back to background. Existing web app + CF Worker preserved under `archive/` for reference.

**Tech Stack:** wxt (Vite-based MV3 framework), React 18, TypeScript, Tailwind CSS, React Router (HashRouter), zod, OpenAI/Anthropic/GoogleGenAI SDKs (already deps), xlsx (lazy), Vitest, web-ext (sideload tooling).

---

## Repository Structure (target)

```
archive/                              # OLD web app + worker (read-only artifact)
  app/                                # current src/, public/, index.html, vite.config.ts, etc.
  proxy/                              # CF Worker
  scripts/                            # setup-proxy.mjs
  README.md                           # "archived — see ../extension"

extension/                            # NEW wxt project (the actual product)
  wxt.config.ts
  package.json
  tsconfig.json
  tailwind.config.js
  postcss.config.js
  entrypoints/
    sidebar/
      index.html
      main.tsx                        # React mount
    popup/
      index.html                      # toolbar-icon popup → "Open sidebar"
      main.tsx
    background.ts                     # service worker
    youtube.content.ts                # content script @ *.youtube.com
  src/
    app/
      App.tsx                         # router + layout (was App.tsx in web app)
      routes/                         # ported from src/routes/
        Watchlist.tsx
        Channel.tsx
        VideoAnalysis.tsx
        Settings.tsx
        Help.tsx
      components/                     # ported from src/components/
    lib/
      llm/                            # ported, unchanged externally
      platforms/                      # ported, transcript path swapped
      storage.ts                      # NEW: browser.storage.local backend with hydration cache
      messaging.ts                    # NEW: typed message bus for sidebar↔bg↔content
      transcript-bridge.ts            # NEW: sidebar-side transcript fetch via background
    types.ts
  public/
    icons/
      icon-16.png
      icon-48.png
      icon-128.png
  README.md

docs/superpowers/plans/...            # this plan + earlier ones
```

`archive/` is a one-shot move from current repo root. Existing top-level files (`src/`, `proxy/`, `package.json`, `vite.config.ts`, `index.html`, etc.) all migrate INTO `archive/app/` and `archive/proxy/`. Repo root then contains only `extension/`, `archive/`, `docs/`, `.git/`, `.gitignore`, `README.md`, `CLAUDE.md`.

---

## Architectural Notes

**Storage shape.** `browser.storage.local` is async-only. Current code uses sync `storage.getLLMKey()` everywhere. Refactor approach: hydrate-on-boot into an in-memory cache, expose sync read API, write-through async on save. App mount blocks on initial `await storage.hydrate()`. Same external API as current `storage.ts`.

**LLM calls.** From sidebar React app. Requires `host_permissions` for every provider domain in `manifest.json` (12 entries). MV3 with declared host_permissions = no CORS prompt for those origins.

**Transcript flow.** Sidebar wants captions for video ID. Three steps:
1. Sidebar sends `{type: 'fetch-transcript', platform: 'youtube', videoId}` via `browser.runtime.sendMessage`.
2. Background opens hidden tab (`browser.tabs.create({url: 'https://www.youtube.com/watch?v=ID', active: false})`), waits for content script ping.
3. Content script (already injected via manifest match pattern) reads `ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks` from `window`, picks English track, fetches `baseUrl + '&fmt=json3'`, parses, sends `{type: 'transcript-ready', segments}` back. Background closes tab, returns segments to sidebar.

**Channel feeds.** Use YouTube Data API v3 (existing path). Scraping unnecessary — Data API gives `recentUploads` cleanly with user's own API key. Only transcripts need scraping.

**Build + sideload.** `wxt build` outputs `extension/.output/firefox-mv3/`. `web-ext run --source-dir=.output/firefox-mv3` launches Firefox with extension loaded. Self-hosted XPI via `wxt zip --browser firefox`. No AMO submission this plan.

---

## Task List

### Task 0: Pre-flight verification

**Files:** none changed.

- [ ] **Step 1: Capture current state**

```bash
git status --short
git rev-parse HEAD
npm test 2>&1 | tail -3
npm run build 2>&1 | tail -3
```

Expected: clean working tree, build clean, 48/48 tests pass.

- [ ] **Step 2: Verify Firefox is installed**

Run: `firefox --version`
Expected: `Mozilla Firefox <version>` (any 100+).

If absent, install via system package manager. Plan blocks here without Firefox.

- [ ] **Step 3: Create branch checkpoint**

```bash
git tag pre-extension-pivot
git push origin pre-extension-pivot
```

Tag preserves the working web app state for emergency rollback.

---

### Task 1: Archive existing web app

**Files:**
- Move: `src/`, `public/`, `proxy/`, `scripts/`, `index.html`, `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `package.json`, `package-lock.json`, `node_modules/` (gitignored — skip), `.env.example` → `archive/`
- Create: `archive/README.md`

- [ ] **Step 1: Make archive directory structure**

```bash
mkdir -p archive/app archive/proxy archive/scripts
```

- [ ] **Step 2: Move web app files**

```bash
git mv src archive/app/src
git mv public archive/app/public
git mv index.html archive/app/index.html
git mv vite.config.ts archive/app/vite.config.ts
git mv tailwind.config.js archive/app/tailwind.config.js
git mv postcss.config.js archive/app/postcss.config.js
git mv tsconfig.json archive/app/tsconfig.json
git mv tsconfig.app.json archive/app/tsconfig.app.json
git mv tsconfig.node.json archive/app/tsconfig.node.json
git mv package.json archive/app/package.json
git mv package-lock.json archive/app/package-lock.json
git mv .env.example archive/app/.env.example
```

- [ ] **Step 3: Move proxy + scripts**

```bash
git mv proxy/* archive/proxy/
rmdir proxy
git mv scripts/* archive/scripts/
rmdir scripts
```

- [ ] **Step 4: Write archive README**

Create `archive/README.md`:

```markdown
# Archived: kokocastles web app + Cloudflare Worker

This directory preserves the original Vite web app and Cloudflare Worker
proxy that shipped through commit `14b5aa8` (May 2026). The product pivoted
to a Firefox extension at `../extension` because YouTube hard-blocks
server-side caption fetch from datacenter IPs (CF Workers).

The extension scrapes captions from the user's residential IP via a
content script on `youtube.com`, eliminating the proxy.

## Running the archived web app

```bash
cd archive/app
npm install
npm run dev
```

The CF Worker at `archive/proxy/` is no longer deployed. The transcript
endpoint will fail; manual paste fallback works.
```

- [ ] **Step 5: Verify nothing left at repo root**

```bash
ls -la
```

Expected to see only: `.git/`, `.github/` (if present), `.gitignore`, `archive/`, `docs/`, `CLAUDE.md`, `README.md` (if present), `archive/`. No `src/`, `public/`, `proxy/`, `scripts/`, `package.json` at root.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(archive): move web app + worker to archive/ ahead of extension pivot"
```

---

### Task 2: Initialize wxt project at `extension/`

**Files:**
- Create: `extension/package.json`, `extension/wxt.config.ts`, `extension/tsconfig.json`, `extension/.gitignore`

- [ ] **Step 1: Scaffold wxt project**

```bash
cd /home/jj_d/Documents/everything/work/claude_projects/kokocastles
mkdir extension
cd extension
npm init -y
npm install --save-dev wxt @wxt-dev/module-react
npm install react react-dom react-router-dom zod zod-to-json-schema openai @anthropic-ai/sdk @google/genai xlsx
npm install --save-dev @types/react @types/react-dom typescript vitest jsdom @testing-library/react @testing-library/jest-dom
npm install --save-dev tailwindcss@^3.4 postcss autoprefixer
```

- [ ] **Step 2: Replace `extension/package.json` scripts block**

```json
{
  "name": "kokocastles-extension",
  "private": true,
  "version": "0.2.0",
  "type": "module",
  "scripts": {
    "dev": "wxt -b firefox",
    "dev:chrome": "wxt -b chrome",
    "build": "wxt build -b firefox",
    "build:chrome": "wxt build -b chrome",
    "zip": "wxt zip -b firefox",
    "test": "vitest run",
    "test:watch": "vitest",
    "compile": "tsc --noEmit"
  }
}
```

Keep `dependencies` and `devDependencies` blocks as installed.

- [ ] **Step 3: Create `extension/wxt.config.ts`**

```ts
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'kokocastles',
    description: 'BYOK short-form video analysis — sidebar + content script',
    version: '0.2.0',
    permissions: ['storage', 'tabs', 'activeTab'],
    host_permissions: [
      'https://www.youtube.com/*',
      'https://m.youtube.com/*',
      'https://api.anthropic.com/*',
      'https://api.openai.com/*',
      'https://generativelanguage.googleapis.com/*',
      'https://api.mistral.ai/*',
      'https://api.deepseek.com/*',
      'https://api.x.ai/*',
      'https://api.moonshot.ai/*',
      'https://api.z.ai/*',
      'https://openrouter.ai/*',
      'https://api.groq.com/*',
      'https://api.together.xyz/*',
      'https://api.fireworks.ai/*',
      'https://www.googleapis.com/*',
    ],
    sidebar_action: {
      default_title: 'kokocastles',
      default_panel: 'sidebar.html',
      default_icon: { '48': 'icons/icon-48.png' },
    },
    browser_specific_settings: {
      gecko: {
        id: 'kokocastles@local',
        strict_min_version: '115.0',
      },
    },
  },
  srcDir: 'src',
  outDir: '.output',
});
```

- [ ] **Step 4: Create `extension/tsconfig.json`**

```json
{
  "extends": "./.wxt/tsconfig.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "paths": {
      "~/*": ["./src/*"]
    }
  },
  "include": ["src", "entrypoints", "wxt.config.ts"]
}
```

- [ ] **Step 5: Create `extension/.gitignore`**

```
node_modules/
.output/
.wxt/
*.log
.env*
!.env.example
```

- [ ] **Step 6: First wxt prepare**

```bash
cd extension
npx wxt prepare
```

Generates `.wxt/` types directory. Should print `✔ Generated TypeScript declarations`.

- [ ] **Step 7: Commit**

```bash
git add extension/
git commit -m "feat(extension): scaffold wxt MV3 project with Firefox sidebar manifest"
```

---

### Task 3: Tailwind + theme

**Files:**
- Create: `extension/tailwind.config.js`, `extension/postcss.config.js`, `extension/src/styles.css`
- Modify: `extension/wxt.config.ts` (no change, leave)

- [ ] **Step 1: Create `extension/tailwind.config.js`**

Copy from `archive/app/tailwind.config.js`. The koko-sky / koko-pink palette:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './entrypoints/**/*.{html,tsx,ts}',
    './src/**/*.{tsx,ts}',
  ],
  theme: {
    extend: {
      colors: {
        koko: {
          sky: '#BAE6FD',
          pink: '#FBCFE8',
          'pink-deep': '#DB2777',
        },
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 2: Create `extension/postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 3: Create `extension/src/styles.css`**

Copy contents from `archive/app/src/index.css`. It defines `koko-card`, `koko-input`, `koko-btn`, `koko-btn-ghost`, `koko-badge` utility classes. Must include `@tailwind base; @tailwind components; @tailwind utilities;` at top.

- [ ] **Step 4: Verify build picks up Tailwind**

```bash
cd extension
npx wxt build -b firefox 2>&1 | tail -20
```

Expected: build fails with "no entrypoint" — Tailwind passes through, error is about missing sidebar entry. Acceptable; that's Task 4.

- [ ] **Step 5: Commit**

```bash
git add extension/tailwind.config.js extension/postcss.config.js extension/src/styles.css
git commit -m "feat(extension): port Tailwind config + koko theme utilities"
```

---

### Task 4: Sidebar entry point + minimal mount

**Files:**
- Create: `extension/entrypoints/sidebar/index.html`, `extension/entrypoints/sidebar/main.tsx`, `extension/src/app/App.tsx`

- [ ] **Step 1: Create `extension/entrypoints/sidebar/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>kokocastles</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./main.tsx"></script>
</body>
</html>
```

- [ ] **Step 2: Create `extension/entrypoints/sidebar/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from '~/app/App';
import '~/styles.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('root element missing');

createRoot(rootEl).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>
);
```

- [ ] **Step 3: Create `extension/src/app/App.tsx`**

Minimal placeholder. Routes added in Task 8 once components ported.

```tsx
import { Link, Routes, Route } from 'react-router-dom';

export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-pink-50 text-slate-900">
      <header className="px-4 py-3 border-b border-sky-100 flex items-center gap-3">
        <h1 className="font-display text-lg font-bold bg-gradient-to-r from-koko-sky to-koko-pink-deep bg-clip-text text-transparent">
          kokocastles
        </h1>
      </header>
      <nav className="px-4 py-2 flex gap-3 text-xs border-b border-sky-100">
        <Link to="/">watchlist</Link>
        <Link to="/settings">settings</Link>
        <Link to="/help">help</Link>
      </nav>
      <main className="p-4">
        <Routes>
          <Route path="/" element={<div>watchlist (port pending)</div>} />
          <Route path="/settings" element={<div>settings (port pending)</div>} />
          <Route path="/help" element={<div>help (port pending)</div>} />
        </Routes>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Build**

```bash
cd extension
npx wxt build -b firefox 2>&1 | tail -10
```

Expected: build succeeds, prints chunks under `.output/firefox-mv3/`.

- [ ] **Step 5: Smoke-load in Firefox**

```bash
cd extension
npx web-ext run --source-dir=.output/firefox-mv3 --start-url=about:debugging --no-reload
```

Firefox window opens. In about:debugging → "This Firefox" → confirm "kokocastles" listed. Click View → Sidebar → kokocastles. Sidebar shows minimal app with three nav links. Close Firefox.

If `web-ext` not installed: `npm install -g web-ext` first.

- [ ] **Step 6: Commit**

```bash
git add extension/entrypoints/sidebar extension/src/app
git commit -m "feat(extension): minimal sidebar mount with HashRouter scaffold"
```

---

### Task 5: Storage backend — browser.storage.local with hydration cache

**Files:**
- Create: `extension/src/lib/storage.ts`
- Create: `extension/src/lib/__tests__/storage.test.ts`

The original sync API:

```ts
storage.getLLMKey(): string
storage.setLLMKey(v: string): void
storage.getWatchlist(): Channel[]
storage.setWatchlist(v: Channel[]): void
storage.getTriage(platform, videoId): TriageResult | null
storage.setTriage(platform, videoId, r: TriageResult): void
storage.getDeep(platform, videoId): DeepAnalysis | null
storage.setDeep(platform, videoId, r: DeepAnalysis): void
// ... plus LLM provider, model, youtube key getters/setters
```

New design: hydrate everything on boot from `browser.storage.local` into an in-memory `Map`, expose sync read API, write-through async on writes. Per-video cache entries (`koko.triage.youtube.<id>`) are loaded on demand instead of bulk-hydrating to keep boot fast.

- [ ] **Step 1: Write the test first**

`extension/src/lib/__tests__/storage.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock browser.storage.local
const fakeStore: Record<string, unknown> = {};
const mockBrowser = {
  storage: {
    local: {
      get: vi.fn(async (keys?: string | string[] | null) => {
        if (keys == null) return { ...fakeStore };
        const arr = typeof keys === 'string' ? [keys] : keys;
        const out: Record<string, unknown> = {};
        for (const k of arr) {
          if (k in fakeStore) out[k] = fakeStore[k];
        }
        return out;
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(fakeStore, items);
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        const arr = typeof keys === 'string' ? [keys] : keys;
        for (const k of arr) delete fakeStore[k];
      }),
    },
  },
};
(globalThis as Record<string, unknown>).browser = mockBrowser;

beforeEach(() => {
  for (const k of Object.keys(fakeStore)) delete fakeStore[k];
  vi.clearAllMocks();
});

describe('storage', () => {
  it('returns empty defaults before hydration', async () => {
    const { storage } = await import('../storage');
    expect(storage.getLLMKey()).toBe('');
    expect(storage.getWatchlist()).toEqual([]);
  });

  it('hydrates from browser.storage.local', async () => {
    fakeStore['koko.llmKey'] = 'sk-test';
    fakeStore['koko.watchlist'] = [{ platform: 'youtube', channelId: 'UC1', title: 't' }];
    const { storage } = await import('../storage');
    await storage.hydrate();
    expect(storage.getLLMKey()).toBe('sk-test');
    expect(storage.getWatchlist()).toHaveLength(1);
  });

  it('write-through persists to browser.storage.local', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    await storage.setLLMKey('sk-new');
    expect(fakeStore['koko.llmKey']).toBe('sk-new');
    expect(storage.getLLMKey()).toBe('sk-new');
  });

  it('per-video deep cache reads on demand', async () => {
    fakeStore['koko.deep.youtube.abc'] = { hook: { type: 'visual' } };
    const { storage } = await import('../storage');
    await storage.hydrate();
    const r = await storage.getDeep('youtube', 'abc');
    expect(r).toEqual({ hook: { type: 'visual' } });
  });

  it('addToWatchlist deduplicates by platform+channelId', async () => {
    const { storage } = await import('../storage');
    await storage.hydrate();
    const c = { platform: 'youtube' as const, channelId: 'UC1', title: 't' };
    await storage.addToWatchlist(c);
    await storage.addToWatchlist(c);
    expect(storage.getWatchlist()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests, expect FAIL**

```bash
cd extension
npm test -- storage
```

Expected: import error (storage.ts missing).

- [ ] **Step 3: Implement `extension/src/lib/storage.ts`**

```ts
import type { Channel, DeepAnalysis, LLMModelId, LLMProvider, PlatformId, TriageResult } from '~/types';

declare const browser: {
  storage: {
    local: {
      get: (keys?: string | string[] | null) => Promise<Record<string, unknown>>;
      set: (items: Record<string, unknown>) => Promise<void>;
      remove: (keys: string | string[]) => Promise<void>;
    };
  };
};

const KEY = {
  llmKey: 'koko.llmKey',
  llmProvider: 'koko.llmProvider',
  llmModel: 'koko.llmModel',
  youtubeKey: 'koko.youtubeKey',
  watchlist: 'koko.watchlist',
  triagePrefix: 'koko.triage.',
  deepPrefix: 'koko.deep.',
} as const;

const cache = new Map<string, unknown>();
let hydrated = false;

async function hydrate(): Promise<void> {
  if (hydrated) return;
  const all = await browser.storage.local.get(null);
  for (const [k, v] of Object.entries(all)) cache.set(k, v);
  hydrated = true;
}

function getCached<T>(key: string, fallback: T): T {
  if (!cache.has(key)) return fallback;
  return cache.get(key) as T;
}

async function writeThrough<T>(key: string, value: T): Promise<void> {
  cache.set(key, value);
  await browser.storage.local.set({ [key]: value });
}

function triageKey(p: PlatformId, id: string) { return `${KEY.triagePrefix}${p}.${id}`; }
function deepKey(p: PlatformId, id: string) { return `${KEY.deepPrefix}${p}.${id}`; }

export const storage = {
  hydrate,

  getLLMKey: () => getCached<string>(KEY.llmKey, ''),
  setLLMKey: (v: string) => writeThrough(KEY.llmKey, v),

  getLLMProvider: () => getCached<LLMProvider | ''>(KEY.llmProvider, ''),
  setLLMProvider: (v: LLMProvider | '') => writeThrough(KEY.llmProvider, v),

  getLLMModel: () => getCached<string>(KEY.llmModel, ''),
  setLLMModel: (v: string) => writeThrough(KEY.llmModel, v),

  getYoutubeKey: () => getCached<string>(KEY.youtubeKey, ''),
  setYoutubeKey: (v: string) => writeThrough(KEY.youtubeKey, v),

  getWatchlist: () => getCached<Channel[]>(KEY.watchlist, []),
  setWatchlist: (v: Channel[]) => writeThrough(KEY.watchlist, v),
  addToWatchlist: async (c: Channel) => {
    const list = storage.getWatchlist();
    if (!list.find((x) => x.platform === c.platform && x.channelId === c.channelId)) {
      list.push(c);
      await writeThrough(KEY.watchlist, list);
    }
  },
  removeFromWatchlist: async (platform: PlatformId, channelId: string) => {
    const list = storage.getWatchlist().filter((c) => !(c.platform === platform && c.channelId === channelId));
    await writeThrough(KEY.watchlist, list);
  },

  getTriage: async (platform: PlatformId, videoId: string): Promise<TriageResult | null> => {
    const k = triageKey(platform, videoId);
    if (cache.has(k)) return (cache.get(k) ?? null) as TriageResult | null;
    const r = await browser.storage.local.get(k);
    const v = (r[k] ?? null) as TriageResult | null;
    cache.set(k, v);
    return v;
  },
  setTriage: (platform: PlatformId, videoId: string, r: TriageResult) =>
    writeThrough(triageKey(platform, videoId), r),

  getDeep: async (platform: PlatformId, videoId: string): Promise<DeepAnalysis | null> => {
    const k = deepKey(platform, videoId);
    if (cache.has(k)) return (cache.get(k) ?? null) as DeepAnalysis | null;
    const r = await browser.storage.local.get(k);
    const v = (r[k] ?? null) as DeepAnalysis | null;
    cache.set(k, v);
    return v;
  },
  setDeep: (platform: PlatformId, videoId: string, r: DeepAnalysis) =>
    writeThrough(deepKey(platform, videoId), r),
};

// Re-export for consumers
export type { LLMModelId, LLMProvider, PlatformId };
```

- [ ] **Step 4: Run tests, expect PASS**

```bash
cd extension
npm test -- storage
```

Expected: 5/5 pass.

- [ ] **Step 5: Commit**

```bash
git add extension/src/lib/storage.ts extension/src/lib/__tests__/storage.test.ts
git commit -m "feat(extension): browser.storage.local-backed storage with sync read API"
```

---

### Task 6: Port `src/types.ts` and LLM library

**Files:**
- Create: `extension/src/types.ts`, `extension/src/lib/llm/{providers,types,detect,models,index,adapter,anthropic,gemini,openaiCompat}.ts`
- Create: `extension/src/lib/llm/__tests__/providers.test.ts`, `detect.test.ts`, `models.test.ts`

The LLM library is platform-agnostic — copy verbatim from `archive/app/src/lib/llm/`.

- [ ] **Step 1: Copy types**

```bash
cp /home/jj_d/Documents/everything/work/claude_projects/kokocastles/archive/app/src/types.ts extension/src/types.ts
```

The file re-exports LLM types from `./lib/llm/types`. Path is unchanged after copy.

- [ ] **Step 2: Copy entire LLM lib**

```bash
mkdir -p extension/src/lib/llm/__tests__
cp archive/app/src/lib/llm/providers.ts extension/src/lib/llm/providers.ts
cp archive/app/src/lib/llm/types.ts extension/src/lib/llm/types.ts
cp archive/app/src/lib/llm/detect.ts extension/src/lib/llm/detect.ts
cp archive/app/src/lib/llm/models.ts extension/src/lib/llm/models.ts
cp archive/app/src/lib/llm/index.ts extension/src/lib/llm/index.ts
cp archive/app/src/lib/llm/adapter.ts extension/src/lib/llm/adapter.ts
cp archive/app/src/lib/llm/anthropic.ts extension/src/lib/llm/anthropic.ts
cp archive/app/src/lib/llm/gemini.ts extension/src/lib/llm/gemini.ts
cp archive/app/src/lib/llm/openaiCompat.ts extension/src/lib/llm/openaiCompat.ts
cp archive/app/src/lib/llm/__tests__/providers.test.ts extension/src/lib/llm/__tests__/providers.test.ts
cp archive/app/src/lib/llm/__tests__/detect.test.ts extension/src/lib/llm/__tests__/detect.test.ts
cp archive/app/src/lib/llm/__tests__/models.test.ts extension/src/lib/llm/__tests__/models.test.ts
```

- [ ] **Step 3: Adjust import paths**

The LLM `index.ts` imports `'../storage'`. New path is `'~/lib/storage'` per tsconfig paths. But `~/lib/llm/index.ts` importing `~/lib/storage` is fine.

Edit `extension/src/lib/llm/index.ts`:
- Change `import { storage } from '../storage';` → leave as-is (relative still resolves: `extension/src/lib/llm/index.ts` ↔ `extension/src/lib/storage.ts`).

Verify all relative imports resolve. Run:

```bash
cd extension
npx tsc --noEmit
```

Expected: clean (no module-not-found errors).

- [ ] **Step 4: Run LLM tests**

```bash
cd extension
npm test -- providers detect models
```

Expected: 7 + 11 + 6 = 24 pass.

- [ ] **Step 5: Commit**

```bash
git add extension/src/types.ts extension/src/lib/llm
git commit -m "feat(extension): port LLM library + tests verbatim from archive"
```

---

### Task 7: Port shared components

**Files:**
- Create: `extension/src/app/components/{KeyInput,SearchableSelect,MissingKeyBanner,HookPanel,StructurePanel,VideoCard,ChannelCard,ExportPanel}.tsx`

These are React components from `archive/app/src/components/`. Copy verbatim.

- [ ] **Step 1: Copy components**

```bash
mkdir -p extension/src/app/components
cp archive/app/src/components/KeyInput.tsx extension/src/app/components/KeyInput.tsx
cp archive/app/src/components/SearchableSelect.tsx extension/src/app/components/SearchableSelect.tsx
cp archive/app/src/components/MissingKeyBanner.tsx extension/src/app/components/MissingKeyBanner.tsx
cp archive/app/src/components/HookPanel.tsx extension/src/app/components/HookPanel.tsx
cp archive/app/src/components/StructurePanel.tsx extension/src/app/components/StructurePanel.tsx
cp archive/app/src/components/VideoCard.tsx extension/src/app/components/VideoCard.tsx
cp archive/app/src/components/ChannelCard.tsx extension/src/app/components/ChannelCard.tsx
cp archive/app/src/components/ExportPanel.tsx extension/src/app/components/ExportPanel.tsx
```

- [ ] **Step 2: Fix import paths**

Each component imports from `'../lib/storage'` or `'../types'`. After copy the relative path is wrong (component is now at `extension/src/app/components/`, lib at `extension/src/lib/`).

Bulk-fix relative imports (replaces `'../lib/...'` → `'~/lib/...'`, `'../types'` → `'~/types'`, etc.):

```bash
cd extension
# components import from '~/lib/...' instead of relative
sed -i "s|'../lib/|'~/lib/|g" src/app/components/*.tsx
sed -i "s|'../types'|'~/types'|g" src/app/components/*.tsx
sed -i "s|'../components/|'./|g" src/app/components/*.tsx
```

`SearchableSelect.tsx` imports from `'./SearchableSelect'` (self-ref) — manually verify no broken paths.

- [ ] **Step 3: Compile-check**

```bash
cd extension
npx tsc --noEmit 2>&1 | head -20
```

Expected: clean. Fix any remaining import errors.

- [ ] **Step 4: Commit**

```bash
git add extension/src/app/components
git commit -m "feat(extension): port React components with rewritten import paths"
```

---

### Task 8: Port routes (Watchlist, Settings, Help) — non-platform-dependent first

**Files:**
- Create: `extension/src/app/routes/{Watchlist,Settings,Help}.tsx`
- Modify: `extension/src/app/App.tsx` (wire real routes)

`Channel.tsx` and `VideoAnalysis.tsx` depend on platform adapters which need transcript-bridge wiring (Tasks 9-12). Port them AFTER the bridge exists.

- [ ] **Step 1: Copy 3 routes**

```bash
mkdir -p extension/src/app/routes
cp archive/app/src/routes/Watchlist.tsx extension/src/app/routes/Watchlist.tsx
cp archive/app/src/routes/Settings.tsx extension/src/app/routes/Settings.tsx
cp archive/app/src/routes/Help.tsx extension/src/app/routes/Help.tsx
```

- [ ] **Step 2: Fix imports**

```bash
cd extension
sed -i "s|'../components/|'~/app/components/|g" src/app/routes/*.tsx
sed -i "s|'../lib/|'~/lib/|g" src/app/routes/*.tsx
sed -i "s|'../types'|'~/types'|g" src/app/routes/*.tsx
```

`Watchlist.tsx` calls `getAdapter(platform).resolveChannel(input)` — depends on platform module (Task 11). For now, leave the broken import; will resolve in Task 11. Mark with TODO comment if compile fails:

If `tsc --noEmit` fails on `'~/lib/platforms'`, defer the platform-import line and stub:

In `Watchlist.tsx` temporarily replace:
```ts
import { getAdapter } from '~/lib/platforms';
```
with:
```ts
// TEMP: platform adapter wired in Task 11
const getAdapter = (_p: string) => ({ resolveChannel: async (_x: string): Promise<never> => { throw new Error('platforms not wired yet'); } });
```

This unblocks compile; Task 11 restores the real import.

- [ ] **Step 3: Convert sync storage calls to async where needed**

Watchlist + Settings call `storage.getLLMKey()` — still sync (cache read). But `addToWatchlist` and `setLLMKey` are now async (write-through). Existing callers don't `await` them. Add `await` where return value matters; otherwise leave (fire-and-forget OK for save-on-click).

In `Watchlist.tsx` find `storage.addToWatchlist(channel);` → `await storage.addToWatchlist(channel);`. Wrap caller in async closure if needed.

In `Settings.tsx` `save()` already calls `storage.setLLMKey(...)` etc. Mark `save` as `async` and `await` each `set*` call.

- [ ] **Step 4: Update `App.tsx` to use real routes + hydrate on boot**

```tsx
import { useEffect, useState } from 'react';
import { Link, NavLink, Routes, Route } from 'react-router-dom';
import Watchlist from '~/app/routes/Watchlist';
import Settings from '~/app/routes/Settings';
import Help from '~/app/routes/Help';
import { storage } from '~/lib/storage';

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    storage.hydrate().then(() => setReady(true));
  }, []);

  if (!ready) {
    return <div className="p-6 text-sm text-slate-500">loading…</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-pink-50 text-slate-900">
      <header className="px-4 py-3 border-b border-sky-100 flex items-center gap-3">
        <Link to="/" className="font-display text-lg font-bold bg-gradient-to-r from-koko-sky to-koko-pink-deep bg-clip-text text-transparent">
          kokocastles
        </Link>
      </header>
      <nav className="px-4 py-2 flex gap-3 text-xs border-b border-sky-100">
        <NavLink to="/" end className={({isActive}) => isActive ? 'text-koko-pink-deep font-semibold' : 'text-slate-600'}>watchlist</NavLink>
        <NavLink to="/settings" className={({isActive}) => isActive ? 'text-koko-pink-deep font-semibold' : 'text-slate-600'}>settings</NavLink>
        <NavLink to="/help" className={({isActive}) => isActive ? 'text-koko-pink-deep font-semibold' : 'text-slate-600'}>help</NavLink>
      </nav>
      <main className="p-4">
        <Routes>
          <Route path="/" element={<Watchlist />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/help" element={<Help />} />
        </Routes>
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Build + sideload + smoke**

```bash
cd extension
npx wxt build -b firefox
npx web-ext run --source-dir=.output/firefox-mv3
```

Sidebar opens. Watchlist (empty), Settings (paste fake LLM key, see provider dropdown), Help (12 providers listed). Settings save persists across sidebar reload (close + reopen sidebar — keys still there from `browser.storage.local`).

- [ ] **Step 6: Commit**

```bash
git add extension/src/app/routes extension/src/app/App.tsx
git commit -m "feat(extension): port Watchlist, Settings, Help routes; hydrate on boot"
```

---

### Task 9: Background service worker — message router

**Files:**
- Create: `extension/entrypoints/background.ts`, `extension/src/lib/messaging.ts`

- [ ] **Step 1: Create `extension/src/lib/messaging.ts` (typed message contract)**

```ts
import type { TranscriptSegment } from '~/types';

export type SidebarToBg =
  | { type: 'fetch-transcript'; videoId: string }
  | { type: 'ping' };

export type BgToSidebar =
  | { type: 'transcript-ok'; segments: TranscriptSegment[] }
  | { type: 'transcript-err'; message: string }
  | { type: 'pong' };

export type ContentToBg =
  | { type: 'transcript-payload'; videoId: string; segments: TranscriptSegment[] }
  | { type: 'transcript-error'; videoId: string; message: string };

export type AnyMessage = SidebarToBg | BgToSidebar | ContentToBg;
```

- [ ] **Step 2: Create `extension/entrypoints/background.ts`**

```ts
import { defineBackground } from 'wxt/sandbox';
import type { ContentToBg, SidebarToBg } from '~/lib/messaging';
import type { TranscriptSegment } from '~/types';

interface Pending {
  resolve: (segments: TranscriptSegment[]) => void;
  reject: (msg: string) => void;
  tabId: number;
  timer: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, Pending>(); // videoId → resolver

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const msg = message as SidebarToBg | ContentToBg;

    if (msg.type === 'ping') {
      sendResponse({ type: 'pong' });
      return false;
    }

    if (msg.type === 'fetch-transcript') {
      handleFetchTranscript(msg.videoId).then(
        (segments) => sendResponse({ type: 'transcript-ok', segments }),
        (errMsg) => sendResponse({ type: 'transcript-err', message: errMsg })
      );
      return true; // async response
    }

    if (msg.type === 'transcript-payload') {
      const p = pending.get(msg.videoId);
      if (p) {
        clearTimeout(p.timer);
        pending.delete(msg.videoId);
        browser.tabs.remove(p.tabId).catch(() => {});
        p.resolve(msg.segments);
      }
      return false;
    }

    if (msg.type === 'transcript-error') {
      const p = pending.get(msg.videoId);
      if (p) {
        clearTimeout(p.timer);
        pending.delete(msg.videoId);
        browser.tabs.remove(p.tabId).catch(() => {});
        p.reject(msg.message);
      }
      return false;
    }

    return false;
  });
});

async function handleFetchTranscript(videoId: string): Promise<TranscriptSegment[]> {
  if (pending.has(videoId)) {
    return new Promise((resolve, reject) => {
      const existing = pending.get(videoId)!;
      const origResolve = existing.resolve;
      const origReject = existing.reject;
      existing.resolve = (s) => { origResolve(s); resolve(s); };
      existing.reject = (e) => { origReject(e); reject(e); };
    });
  }

  const tab = await browser.tabs.create({
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
    active: false,
  });
  if (tab.id == null) throw new Error('failed to open hidden tab');

  return new Promise<TranscriptSegment[]>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(videoId);
      browser.tabs.remove(tab.id!).catch(() => {});
      reject('timeout: content script did not respond within 15s');
    }, 15_000);
    pending.set(videoId, { resolve, reject, tabId: tab.id!, timer });
  });
}
```

Note: `browser` global is provided by wxt at runtime. Type comes from `webextension-polyfill` types pulled by wxt.

- [ ] **Step 3: Compile-check**

```bash
cd extension
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add extension/entrypoints/background.ts extension/src/lib/messaging.ts
git commit -m "feat(extension): background SW with transcript-fetch message router + hidden-tab orchestration"
```

---

### Task 10: YouTube content script — scrape ytInitialPlayerResponse

**Files:**
- Create: `extension/entrypoints/youtube.content.ts`

- [ ] **Step 1: Create `extension/entrypoints/youtube.content.ts`**

```ts
import { defineContentScript } from 'wxt/sandbox';
import type { ContentToBg } from '~/lib/messaging';
import type { TranscriptSegment } from '~/types';

export default defineContentScript({
  matches: ['https://www.youtube.com/*', 'https://m.youtube.com/*'],
  runAt: 'document_idle',
  async main() {
    const url = new URL(window.location.href);
    if (url.pathname !== '/watch') return;
    const videoId = url.searchParams.get('v');
    if (!videoId) return;

    try {
      const segments = await scrapeCaptions(videoId);
      const msg: ContentToBg = { type: 'transcript-payload', videoId, segments };
      browser.runtime.sendMessage(msg).catch(() => {});
    } catch (e) {
      const msg: ContentToBg = {
        type: 'transcript-error',
        videoId,
        message: e instanceof Error ? e.message : String(e),
      };
      browser.runtime.sendMessage(msg).catch(() => {});
    }
  },
});

interface CaptionTrack { baseUrl: string; languageCode: string; kind?: string }
interface PlayerResponse {
  captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } };
}

async function scrapeCaptions(videoId: string): Promise<TranscriptSegment[]> {
  const player = readPlayerResponse();
  const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks || tracks.length === 0) {
    throw new Error('no captionTracks on this video');
  }
  const track =
    tracks.find((t) => t.languageCode === 'en' && !t.kind) ||
    tracks.find((t) => t.languageCode === 'en') ||
    tracks.find((t) => !t.kind) ||
    tracks[0];
  const url = track.baseUrl.includes('fmt=') ? track.baseUrl : `${track.baseUrl}&fmt=json3`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`captions http ${res.status}`);
  const body = await res.text();
  if (url.includes('fmt=json3')) return parseJson3(body);
  return parseTimedTextXml(body);
}

function readPlayerResponse(): PlayerResponse | null {
  // Inject a script into page world to read window.ytInitialPlayerResponse,
  // then deliver via custom event because content scripts run in isolated world.
  return new Promise<PlayerResponse | null>((resolve) => {
    const eventName = `koko-player-${Math.random().toString(36).slice(2)}`;
    const onEvent = (ev: Event) => {
      window.removeEventListener(eventName, onEvent);
      const detail = (ev as CustomEvent).detail;
      resolve(detail ?? null);
    };
    window.addEventListener(eventName, onEvent);

    const script = document.createElement('script');
    script.textContent = `
      (function() {
        try {
          var p = window.ytInitialPlayerResponse || null;
          window.dispatchEvent(new CustomEvent(${JSON.stringify(eventName)}, { detail: p }));
        } catch (e) {
          window.dispatchEvent(new CustomEvent(${JSON.stringify(eventName)}, { detail: null }));
        }
      })();
    `;
    document.documentElement.appendChild(script);
    script.remove();
    setTimeout(() => {
      window.removeEventListener(eventName, onEvent);
      resolve(null);
    }, 3000);
  }) as unknown as PlayerResponse | null;
}

interface Json3Event { tStartMs?: number; dDurationMs?: number; segs?: { utf8?: string }[] }
function parseJson3(body: string): TranscriptSegment[] {
  const data = JSON.parse(body) as { events?: Json3Event[] };
  const out: TranscriptSegment[] = [];
  for (const ev of data.events ?? []) {
    if (ev.tStartMs == null || ev.dDurationMs == null || !ev.segs) continue;
    const text = ev.segs.map((s) => s.utf8 ?? '').join('').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    out.push({ start: ev.tStartMs / 1000, dur: ev.dDurationMs / 1000, text });
  }
  return out;
}

function parseTimedTextXml(xml: string): TranscriptSegment[] {
  const segs: TranscriptSegment[] = [];
  const re = /<text[^>]*\bstart="([\d.]+)"[^>]*\bdur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    segs.push({
      start: Number(m[1]),
      dur: Number(m[2]),
      text: decodeEntities(m[3]).replace(/\s+/g, ' ').trim(),
    });
  }
  return segs;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
```

The `readPlayerResponse` function is async-ish (returns `PlayerResponse | null` — fix the cast: it returns a Promise in reality, the surrounding `await` is missing). Correct it:

Replace the `readPlayerResponse` function signature to return `Promise<PlayerResponse | null>` and remove the broken cast:

```ts
function readPlayerResponse(): Promise<PlayerResponse | null> {
  return new Promise((resolve) => {
    // ... same body as above, just no outer cast ...
  });
}
```

And in `scrapeCaptions`:
```ts
const player = await readPlayerResponse();
```

- [ ] **Step 2: Compile-check**

```bash
cd extension
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Build + smoke**

```bash
cd extension
npx wxt build -b firefox
npx web-ext run --source-dir=.output/firefox-mv3 --start-url=https://www.youtube.com/watch?v=jNQXAC9IVRw
```

In Firefox, open about:debugging → kokocastles → "Inspect" on its background. Console should show no errors. Open DevTools on the YT tab → Console: should see no errors from the content script (silently posts to BG). Network tab on YT page should show a fetch to `youtube.com/api/timedtext` (the `baseUrl` from playerResponse). Close.

- [ ] **Step 4: Commit**

```bash
git add extension/entrypoints/youtube.content.ts
git commit -m "feat(extension): YT content script — scrape ytInitialPlayerResponse for captions"
```

---

### Task 11: Port platform adapters with extension-aware transcript

**Files:**
- Create: `extension/src/lib/platforms/{index,youtube,tiktok,instagram}.ts`
- Create: `extension/src/lib/transcript-bridge.ts`
- Create: `extension/src/lib/concurrency.ts`
- Create: `extension/src/lib/platforms/__tests__/youtube.test.ts`

- [ ] **Step 1: Create transcript bridge**

`extension/src/lib/transcript-bridge.ts`:

```ts
import type { BgToSidebar, SidebarToBg } from './messaging';
import type { TranscriptSegment } from '~/types';

declare const browser: {
  runtime: {
    sendMessage: (msg: unknown) => Promise<unknown>;
  };
};

export async function fetchTranscriptViaBackground(videoId: string): Promise<TranscriptSegment[]> {
  const req: SidebarToBg = { type: 'fetch-transcript', videoId };
  const reply = (await browser.runtime.sendMessage(req)) as BgToSidebar;
  if (reply.type === 'transcript-ok') return reply.segments;
  if (reply.type === 'transcript-err') throw new Error(reply.message);
  throw new Error('unexpected reply from background');
}
```

- [ ] **Step 2: Port concurrency lib**

```bash
cp archive/app/src/lib/concurrency.ts extension/src/lib/concurrency.ts
```

No edits — pure utility.

- [ ] **Step 3: Port platform adapters**

```bash
mkdir -p extension/src/lib/platforms/__tests__
cp archive/app/src/lib/platforms/index.ts extension/src/lib/platforms/index.ts
cp archive/app/src/lib/platforms/youtube.ts extension/src/lib/platforms/youtube.ts
cp archive/app/src/lib/platforms/tiktok.ts extension/src/lib/platforms/tiktok.ts 2>/dev/null || true
cp archive/app/src/lib/platforms/instagram.ts extension/src/lib/platforms/instagram.ts 2>/dev/null || true
cp archive/app/src/lib/platforms/youtube.test.ts extension/src/lib/platforms/__tests__/youtube.test.ts
```

If tiktok / instagram adapters don't exist in archive (likely just stubs), skip — extension-only YT for now.

- [ ] **Step 4: Replace YT transcript path**

In `extension/src/lib/platforms/youtube.ts` find:
```ts
import { fetchTranscript } from '../transcript';
```
and the `transcript(videoId)` method body:
```ts
async transcript(videoId): Promise<TranscriptSegment[]> {
  return fetchTranscript('youtube', videoId);
}
```

Replace with:
```ts
import { fetchTranscriptViaBackground } from '../transcript-bridge';

// ... in adapter object:
async transcript(videoId): Promise<TranscriptSegment[]> {
  return fetchTranscriptViaBackground(videoId);
}
```

- [ ] **Step 5: Restore platform import in Watchlist.tsx**

Edit `extension/src/app/routes/Watchlist.tsx` — remove the TEMP stub from Task 8 Step 2, restore:
```ts
import { getAdapter } from '~/lib/platforms';
```

- [ ] **Step 6: Run tests**

```bash
cd extension
npm test
```

Expected: 24 LLM tests + 5 storage tests + 6 youtube adapter tests = 35+ pass.

- [ ] **Step 7: Compile-check**

```bash
cd extension
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add extension/src/lib/platforms extension/src/lib/transcript-bridge.ts extension/src/lib/concurrency.ts extension/src/app/routes/Watchlist.tsx
git commit -m "feat(extension): platform adapters; YT transcript routes through background+content script"
```

---

### Task 12: Port Channel + VideoAnalysis routes

**Files:**
- Create: `extension/src/app/routes/Channel.tsx`, `extension/src/app/routes/VideoAnalysis.tsx`
- Modify: `extension/src/app/App.tsx` (add routes)

- [ ] **Step 1: Copy routes**

```bash
cp archive/app/src/routes/Channel.tsx extension/src/app/routes/Channel.tsx
cp archive/app/src/routes/VideoAnalysis.tsx extension/src/app/routes/VideoAnalysis.tsx
```

- [ ] **Step 2: Fix imports**

```bash
cd extension
sed -i "s|'../components/|'~/app/components/|g" src/app/routes/Channel.tsx src/app/routes/VideoAnalysis.tsx
sed -i "s|'../lib/|'~/lib/|g" src/app/routes/Channel.tsx src/app/routes/VideoAnalysis.tsx
sed -i "s|'../types'|'~/types'|g" src/app/routes/Channel.tsx src/app/routes/VideoAnalysis.tsx
```

- [ ] **Step 3: Async-ify storage calls**

Both files call `storage.getDeep(...)` and `storage.getTriage(...)` which are now async. Wrap callers in async, await.

In `Channel.tsx → handleAnalyze` change:
```ts
if (storage.getDeep(v.platform, v.videoId)) return;
```
to:
```ts
if (await storage.getDeep(v.platform, v.videoId)) return;
```

Same in `runTriage`:
```ts
if (storage.getTriage(v.platform, v.videoId)) return;
```
to:
```ts
if (await storage.getTriage(v.platform, v.videoId)) return;
```

In the `useEffect` that hydrates triage cache:
```ts
v.forEach((vid) => {
  const c = storage.getTriage(vid.platform, vid.videoId);
  if (c) cached[vid.videoId] = c;
});
```
becomes:
```ts
for (const vid of v) {
  const c = await storage.getTriage(vid.platform, vid.videoId);
  if (c) cached[vid.videoId] = c;
}
```

The enclosing `.then((v) => { ... })` needs to be `.then(async (v) => { ... })`.

In `VideoAnalysis.tsx`, similar treatment for any `getDeep` calls.

- [ ] **Step 4: Wire routes in App.tsx**

```tsx
import Channel from '~/app/routes/Channel';
import VideoAnalysis from '~/app/routes/VideoAnalysis';

// in <Routes>:
<Route path="/channel/:platform/:channelId" element={<Channel />} />
<Route path="/video/:platform/:videoId" element={<VideoAnalysis />} />
```

- [ ] **Step 5: Compile + build**

```bash
cd extension
npx tsc --noEmit
npx wxt build -b firefox
```

Expected: clean.

- [ ] **Step 6: Smoke test full flow**

```bash
cd extension
npx web-ext run --source-dir=.output/firefox-mv3
```

In sidebar: Settings → paste valid Anthropic key + valid YouTube Data API key. Save. Watchlist → add `@MrBeast` → click channel → Channel page lists 30 videos. Click Triage hooks → wait. Click a video → VideoAnalysis page → Analyze button → wait. Hook + Structure panels render. Caption transcript loaded automatically (from content script).

If caption fetch fails (e.g. video has no captions), see "Paste transcript (fallback)" textarea. Manual paste still works.

- [ ] **Step 7: Commit**

```bash
git add extension/src/app/routes/Channel.tsx extension/src/app/routes/VideoAnalysis.tsx extension/src/app/App.tsx
git commit -m "feat(extension): port Channel + VideoAnalysis routes; async storage callers"
```

---

### Task 13: Popup (toolbar action) — opens sidebar

**Files:**
- Create: `extension/entrypoints/popup/index.html`, `extension/entrypoints/popup/main.tsx`

The toolbar icon should open the sidebar when clicked. Firefox MV3 uses `browser_action` for the toolbar; it can either show a popup or trigger an event. Sidebar opens via `browser.sidebarAction.open()` which requires a user gesture (i.e. the popup click).

- [ ] **Step 1: Create popup HTML**

`extension/entrypoints/popup/index.html`:
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>kokocastles</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 12px; min-width: 220px; }
    button { width: 100%; padding: 8px; border-radius: 8px; border: 1px solid #BAE6FD; background: #FBCFE8; cursor: pointer; }
  </style>
</head>
<body>
  <button id="open">Open kokocastles sidebar</button>
  <script type="module" src="./main.tsx"></script>
</body>
</html>
```

- [ ] **Step 2: Create popup main.tsx**

```tsx
declare const browser: { sidebarAction?: { open: () => Promise<void> } };

document.getElementById('open')?.addEventListener('click', async () => {
  if (browser.sidebarAction?.open) {
    await browser.sidebarAction.open();
    window.close();
  }
});
```

- [ ] **Step 3: Update wxt.config.ts manifest**

Replace the manifest block adding browser_action:
```ts
browser_action: {
  default_title: 'kokocastles',
  default_popup: 'popup.html',
  default_icon: { '48': 'icons/icon-48.png' },
},
```

Keep `sidebar_action` block as-is.

- [ ] **Step 4: Build + smoke**

```bash
cd extension
npx wxt build -b firefox
npx web-ext run --source-dir=.output/firefox-mv3
```

Click toolbar icon → small popup → "Open sidebar" → sidebar appears.

- [ ] **Step 5: Commit**

```bash
git add extension/entrypoints/popup extension/wxt.config.ts
git commit -m "feat(extension): toolbar popup that opens sidebar via sidebarAction.open"
```

---

### Task 14: Icons

**Files:**
- Create: `extension/public/icons/{icon-16.png, icon-48.png, icon-128.png}`

- [ ] **Step 1: Generate placeholder icons**

If a logo PNG exists in `archive/app/public/`, copy and resize. Otherwise generate placeholder via ImageMagick:

```bash
mkdir -p extension/public/icons
for size in 16 48 128; do
  convert -size ${size}x${size} \
    gradient:'#BAE6FD-#FBCFE8' \
    -gravity center -pointsize $((size / 3)) \
    -fill '#DB2777' -font 'DejaVu-Sans-Bold' \
    -annotate +0+0 'k' \
    extension/public/icons/icon-${size}.png
done
```

If ImageMagick not installed: run `sudo pacman -S imagemagick` (Arch) or apt equivalent. Or skip — manifest icon paths can be omitted; Firefox uses default.

- [ ] **Step 2: Verify icons load**

```bash
cd extension
ls public/icons/
npx wxt build -b firefox
```

Inspect `.output/firefox-mv3/icons/` — all three files present.

- [ ] **Step 3: Commit**

```bash
git add extension/public/icons
git commit -m "feat(extension): add icon set (16, 48, 128)"
```

---

### Task 15: Top-level README rewrite

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace root README**

```markdown
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
the sidebar.

## Architecture

- `extension/` — Firefox MV3 extension (wxt + React + Tailwind)
  - Sidebar UI: full app
  - Background SW: message router, transcript orchestration
  - YouTube content script: scrapes captions from page context
- `archive/` — original web app + Cloudflare Worker (no longer maintained)
- `docs/superpowers/plans/` — implementation plans

## Status

YouTube only. Instagram, TikTok planned. AI chat option planned.

See `docs/superpowers/plans/2026-05-02-firefox-extension-pivot.md` for
the migration history.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README points at extension/ as primary product"
```

---

### Task 16: CI hygiene + final test sweep

**Files:**
- Modify: `extension/package.json` (verify scripts), `.github/workflows/*.yml` if present

- [ ] **Step 1: Run full test suite**

```bash
cd extension
npm test
npx tsc --noEmit
npx wxt build -b firefox
```

Expected: tests pass, compile clean, build succeeds.

- [ ] **Step 2: If `.github/workflows/` exists at repo root**

Update CI to run extension tests:
- Replace any `npm install && npm test` referring to old root with `cd extension && npm install && npm test`.

If no CI yet, skip.

- [ ] **Step 3: Commit (only if changes)**

```bash
git add .github
git commit -m "ci: run extension test suite"
```

---

### Task 17: Self-host XPI build

**Files:**
- Create: `extension/scripts/build-xpi.sh`

- [ ] **Step 1: Create build script**

`extension/scripts/build-xpi.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
npm run zip
echo
echo "XPI ready at .output/kokocastles-firefox.zip"
echo "To install: open Firefox → about:debugging → This Firefox → Load Temporary Add-on → pick the .zip"
echo
echo "For permanent install, the XPI must be signed via AMO. Self-distribution"
echo "without signing only loads as a temporary add-on (cleared on Firefox restart)."
```

```bash
chmod +x extension/scripts/build-xpi.sh
```

- [ ] **Step 2: Run build**

```bash
cd extension
./scripts/build-xpi.sh
```

Expected: `.output/kokocastles-firefox.zip` exists.

- [ ] **Step 3: Manual install test**

Open Firefox → `about:debugging` → "This Firefox" → "Load Temporary Add-on" → pick the zip → confirm extension appears with sidebar action.

- [ ] **Step 4: Commit**

```bash
git add extension/scripts/build-xpi.sh
git commit -m "feat(extension): build-xpi.sh helper for self-hosted Firefox install"
```

---

### Task 18: Final verification

- [ ] **Step 1: End-to-end smoke**

```bash
cd extension
npm run dev
```

In Firefox sidebar:
1. Settings → paste Anthropic key + YouTube Data API key → save
2. Watchlist → add `@MrBeast` (or any channel)
3. Channel page loads 30 videos
4. Triage hooks → confirm captions actually fetched (Hook column populated for at least some videos)
5. Open one video → Analyze → confirm transcript-derived analysis (not "thumbnail-only" speculative banner)
6. Export panel → tick top 3 → Analyze top 3 → Export top 3 XLSX → confirm download has populated hook/main_idea/cta/formats columns
7. Restart Firefox → reopen sidebar → keys + watchlist restored from `browser.storage.local`

- [ ] **Step 2: Test failures captured**

If any step fails, file the failure as a follow-up task (don't fix in this plan — this is verification).

- [ ] **Step 3: Final commit if cleanup needed**

```bash
git status
# if anything outstanding:
git add -A && git commit -m "chore(extension): final verification cleanup"
```

- [ ] **Step 4: Push**

```bash
git push
```

---

## Notes

- **Why HashRouter, not BrowserRouter:** sidebar URL is fixed at `moz-extension://.../sidebar.html`. BrowserRouter would mutate this URL on navigation, which the sidebar context doesn't support. HashRouter keeps `#/path` in URL fragment — works everywhere.

- **Why content script + hidden tab, not direct `fetch` from background:** YouTube blocks server-side caption fetch from datacenter IPs. The content script runs in the page context with PoToken-bearing INNERTUBE state already initialized, so `baseUrl` URLs resolve correctly. Hidden tab approach: open tab in background, content script auto-runs at document_idle, scrapes, posts to background, tab closed.

- **Why no transcript caching in storage:** captions are stable per video; could cache. Skipped this pass to keep diff small. Future: add `koko.transcript.<platform>.<videoId>` cache pattern parallel to triage/deep cache.

- **Why drop `--browser chrome` testing:** plan is Firefox-first. wxt config already supports `wxt build -b chrome`; future Chrome port primarily needs `sidebar_action` → `side_panel` API swap. Track as a separate plan.

- **Why no AMO submission:** self-hosted XPI is "temporary add-on" only — clears on Firefox restart. For permanent install user must either submit to AMO (signed) or use Firefox Developer Edition / Nightly with `xpinstall.signatures.required = false`. Personal use: temp install + reload after restart is the simplest workflow until AMO submission later.

- **Multi-platform (Instagram, TikTok):** future plan. Each platform = (a) new content script with platform-specific scrape logic, (b) new platform adapter under `src/lib/platforms/`, (c) detection in Watchlist input parser. Architecture supports it cleanly.

- **AI chat option:** future plan. Sidebar would gain `/chat` route with conversation history persisted in `browser.storage.local`, callLLM stream support, system prompt that has access to current channel/video analysis cache.

- **DB / sync:** future. Browser.storage.local is local-only, ~10MB cap. For multi-device sync, options: sync via `browser.storage.sync` (small, rate-limited), or external DB (Supabase / SQLite-on-Cloudflare-D1) gated behind user OAuth login. Out of scope.
