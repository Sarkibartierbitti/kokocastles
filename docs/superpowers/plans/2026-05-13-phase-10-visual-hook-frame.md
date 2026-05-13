# Phase 10 — Visual Hook Frame Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the thumbnail-only visual hook on the Hooks sub-page with a captured **in-video frame at t=2s** for each analyzed video. Strictly opt-in via a feature flag, executed via a hidden-tab → `<video>.currentTime` → `<canvas>` → dataURL pipeline. Frames cache per `(platform, videoId)` and persist across sessions. Background runs a max-1-concurrent queue.

**Architecture:**
- `koko.framesEnabled: boolean` (default `false`) — surfaced in Settings under the "Experimental platforms" section already shipped in Phase 9.
- `koko.frame.<platform>.<videoId>: string` — base64 data URL (or empty string on failure).
- New content script `entrypoints/youtube-frame.content.ts` matched on `youtube.com/watch` URLs. On receipt of `{ type: 'capture-frame', t: number }`, it locates `<video>`, seeks to `t`, waits for `seeked`, draws to an offscreen canvas, returns `dataUrl`.
- New `lib/frameQueue.ts`: an in-memory promise-chain queue with concurrency=1. Each `enqueueFrameCapture(platform, videoId)` opens a hidden tab to the video URL, messages the content script, persists the dataURL to storage, removes the tab.
- `HookCard` renders the cached frame above (or replacing) the existing visualFormat label when present.
- `HooksSubPage` on mount: if flag on, enumerate analyzed videos without a cached frame and call `enqueueFrameCapture(...)` — fire-and-forget; UI re-reads cache on focus.
- Two pure helpers extracted for test: `frameStorageKey(platform, videoId)` (string) and `decideShouldCapture(framesEnabled, hasCache): boolean`.

**Tech Stack:** Same as Phases 1–9.

**Source spec:** `docs/superpowers/specs/2026-05-07-full-product-feasibility-and-design.md` §3.1 + §4 Phase 10.

**Prerequisites:** Phases 1–9. Hooks sub-page already exists; flag block already in Settings.

---

## File Structure

**New files:**
- `extension/src/lib/frameQueue.ts`
- `extension/src/lib/__tests__/frameQueue.test.ts`
- `extension/src/entrypoints/youtube-frame.content.ts`

**Modified files:**
- `extension/src/lib/storage.ts` — `framesEnabled` toggle + per-video frame data URL accessors
- `extension/src/app/routes/Settings.tsx` — third toggle in Experimental section
- `extension/src/app/components/HookCard.tsx` — render cached frame if present
- `extension/src/app/routes/HooksSubPage.tsx` — enqueue capture on mount when flag on

---

## Task 1: Storage flag + frame data accessors + tests

`KEY`:
```
framesEnabled: 'koko.framesEnabled',
framePrefix: 'koko.frame.',
```

Accessors:
```typescript
getFramesEnabled: () => getCached<boolean>(KEY.framesEnabled, false),
setFramesEnabled: (v: boolean) => writeThrough(KEY.framesEnabled, v),

getFrame: (p: PlatformId, id: string) =>
  getCached<string>(`${KEY.framePrefix}${p}.${id}`, ''),
setFrame: (p: PlatformId, id: string, dataUrl: string) =>
  writeThrough(`${KEY.framePrefix}${p}.${id}`, dataUrl),

getAllFrames: (): Map<string, string> => { /* scan */ },
```

Tests:
- default off
- toggle round-trip
- frame round-trip + getAllFrames collects under prefix

~3 cases.

---

## Task 2: Pure helpers + queue tests

`frameQueue.ts`:

```typescript
import { storage } from './storage';
import type { PlatformId } from '../types';

export function frameStorageKey(p: PlatformId, id: string): string {
  return `koko.frame.${p}.${id}`;
}

export function decideShouldCapture(framesEnabled: boolean, hasCache: boolean): boolean {
  return framesEnabled && !hasCache;
}

let chain: Promise<void> = Promise.resolve();
const inFlight = new Set<string>();

export function enqueueFrameCapture(
  platform: PlatformId,
  videoId: string,
  capture: (videoId: string) => Promise<string>
): Promise<string | null> {
  const key = `${platform}::${videoId}`;
  if (inFlight.has(key)) return Promise.resolve(null);
  inFlight.add(key);
  const job = chain
    .then(() => capture(videoId))
    .then(async (dataUrl) => {
      if (dataUrl) await storage.setFrame(platform, videoId, dataUrl);
      return dataUrl;
    })
    .catch(() => null)
    .finally(() => inFlight.delete(key));
  chain = job.then(() => undefined);
  return job;
}
```

Tests:
- `frameStorageKey` shape
- `decideShouldCapture` truth table
- `enqueueFrameCapture` serializes (call B starts only after call A resolves)
- Duplicate enqueue of same key returns null
- Writes to storage on success

~5 cases.

---

## Task 3: Content script

`entrypoints/youtube-frame.content.ts`:

```typescript
import { defineContentScript } from 'wxt/utils/define-content-script';

export default defineContentScript({
  matches: ['https://www.youtube.com/watch*'],
  runAt: 'document_idle',
  main() {
    browser.runtime.onMessage.addListener((message) => {
      const msg = message as { type?: string; t?: number };
      if (msg.type !== 'capture-frame') return undefined;
      const t = Math.max(0, msg.t ?? 2);
      return new Promise<{ ok: true; dataUrl: string } | { ok: false; message: string }>(
        (resolve) => {
          const video = document.querySelector('video') as HTMLVideoElement | null;
          if (!video) return resolve({ ok: false, message: 'no <video> element on page' });
          const timeoutMs = 8000;
          const timer = setTimeout(() => {
            video.removeEventListener('seeked', onSeeked);
            resolve({ ok: false, message: 'seek timeout' });
          }, timeoutMs);
          function onSeeked() {
            clearTimeout(timer);
            video!.removeEventListener('seeked', onSeeked);
            try {
              const canvas = document.createElement('canvas');
              canvas.width = video!.videoWidth;
              canvas.height = video!.videoHeight;
              const ctx = canvas.getContext('2d');
              if (!ctx) return resolve({ ok: false, message: 'no 2d context' });
              ctx.drawImage(video!, 0, 0);
              const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
              resolve({ ok: true, dataUrl });
            } catch (e) {
              resolve({ ok: false, message: e instanceof Error ? e.message : String(e) });
            }
          }
          video.addEventListener('seeked', onSeeked, { once: true });
          try {
            video.muted = true; // tainted-cors-prevention; muted videos still autoplay enough
            video.currentTime = t;
          } catch (e) {
            clearTimeout(timer);
            resolve({ ok: false, message: `currentTime set failed: ${e instanceof Error ? e.message : String(e)}` });
          }
        }
      );
    });
  },
});
```

Known fragility: YT serves DRM-protected video for some channels; canvas draw will throw `SecurityError`. The `try/catch` in `onSeeked` resolves `{ ok: false }` and the queue stores no frame. Document this in the warn banner copy.

---

## Task 4: Background dispatcher for capture

Add a `handleCaptureFrame(videoId): Promise<string>` to background. Opens a hidden tab to `https://www.youtube.com/watch?v=<id>&mute=1`, waits for `complete`, messages `capture-frame` with `t=2`, returns the dataUrl. Reuse the pattern in `handleFetchTranscript` for tab lifecycle.

Wire to `frameQueue`'s `capture` callback via the lazy import the route uses to enqueue.

---

## Task 5: UI integration

`HooksSubPage` (after computing `hooks`):

```typescript
useEffect(() => {
  if (!storage.getFramesEnabled()) return;
  const missing = hooks.filter((h) => h.platform === 'youtube' && !storage.getFrame(h.platform, h.videoId));
  if (missing.length === 0) return;
  (async () => {
    const { enqueueFrameCapture } = await import('~/lib/frameQueue');
    const bg = await import('~/lib/frameBridge');
    for (const h of missing) {
      enqueueFrameCapture(h.platform, h.videoId, bg.captureFrameViaBackground);
    }
  })();
}, [hooks.length]);
```

`HookCard` renders the cached frame if present:

```tsx
const frame = storage.getFrame(entry.platform, entry.videoId);
{frame ? <img src={frame} alt="" className="rounded w-full" /> : null}
```

Add `lib/frameBridge.ts` — thin wrapper sending `{ type: 'capture-frame-bg', videoId }` to background and returning the dataUrl. (Background opens hidden tab, dispatches to content script, returns dataUrl.)

---

## Task 6: Settings toggle

Add a third checkbox to the Experimental section: "Capture visual hook frames (slow, opt-in)". Bind to `storage.setFramesEnabled`.

---

## Task 7: Verify + commit

Targets:
- tsc clean
- ~245 tests green (239 + 3 storage + 5 queue)
- Build clean (adds the new content script to outputs)

Commit:
```
feat(extension): Phase 10 visual hook frame capture (opt-in)

- koko.framesEnabled flag + per-video koko.frame.<platform>.<videoId> data URL cache
- frameQueue.ts: concurrency=1 promise chain + dedupe
- youtube-frame.content.ts: <video>.currentTime → canvas draw → JPEG dataUrl
- background hidden-tab dispatcher mirrors transcript pipeline
- HookCard renders cached frame when available
- HooksSubPage auto-enqueues missing frames when flag on
- 8 new tests; tsc + build clean
```

## Out of scope (later)
- IG/TT frame capture — different selectors per platform, different DRM rules.
- Custom seek time per video (always t=2s).
- Frame re-capture if user disagrees with the chosen frame.
- LRU eviction on `koko.frame.*` (DataURLs are ~30–80 KB each; 500 hooks ≈ 30 MB. With `unlimitedStorage` it's fine; add eviction in a follow-up if quota becomes an issue).

## Known fragility
- DRM-protected video → `canvas.toDataURL()` throws `SecurityError` → empty cache.
- Consent banners on first YT visit may block `<video>` load → seek timeout → empty cache.
- Hidden-tab autoplay is policy-restricted on Firefox; muted + currentTime set should suffice but may need user-gesture follow-up in v1.1.
