import { defineContentScript } from 'wxt/utils/define-content-script';
import type { ContentToBg, ScrapedVideo } from '~/lib/messaging';

export default defineContentScript({
  matches: [
    'https://www.youtube.com/@*',
    'https://www.youtube.com/channel/*',
    'https://www.youtube.com/c/*',
    'https://www.youtube.com/user/*',
  ],
  runAt: 'document_idle',
  main() {
    // Firefox MV2: return a Promise from the listener. The resolved value
    // becomes the response. The Chrome-style "return true + async
    // sendResponse" pattern is unreliable on Firefox and produces
    // "unexpected reply from content script" failures upstream.
    browser.runtime.onMessage.addListener((message) => {
      const msg = message as { type?: string; kind?: string };
      if (msg.type !== 'scrape' || msg.kind !== 'channel') return undefined;
      console.log('[koko channel-scrape] received scrape request');
      return scrapeChannel().then(
        (data): ContentToBg => {
          console.log('[koko channel-scrape] success:', data.channelId, data.videos.length, 'videos');
          return {
            type: 'scraped-channel',
            channelId: data.channelId,
            channelTitle: data.channelTitle,
            videos: data.videos,
          };
        },
        (err: unknown): ContentToBg => {
          const message = err instanceof Error ? err.message : String(err);
          console.error('[koko channel-scrape] failed:', message);
          return { type: 'scrape-failed', message };
        },
      );
    });
  },
});

interface ChannelData { channelId: string; channelTitle: string; videos: ScrapedVideo[] }

async function scrapeChannel(): Promise<ChannelData> {
  const data = await readYtInitialData();
  if (!data) throw new Error('ytInitialData missing on this page');

  const meta = (data.metadata as Record<string, unknown> | undefined)?.channelMetadataRenderer as Record<string, unknown> | undefined;
  const header = (data.header as Record<string, unknown> | undefined)?.c4TabbedHeaderRenderer as Record<string, unknown> | undefined;
  const channelId = (meta?.externalId as string | undefined) ?? (header?.channelId as string | undefined) ?? '';
  const channelTitle = (meta?.title as string | undefined) ?? (header?.title as string | undefined) ?? '';
  if (!channelId) throw new Error('could not extract channelId');

  const tabs = ((data.contents as Record<string, unknown> | undefined)
    ?.twoColumnBrowseResultsRenderer as Record<string, unknown> | undefined)
    ?.tabs as unknown[] ?? [];
  // Match the Videos tab by its endpoint URL (locale-agnostic), then by
  // selected=true (the tab the URL landed on — should be /videos if we hit
  // /channel/<id>/videos), then by title in any localized form, then by
  // first tab with content. Title-only match used to fail on localized YT.
  let videoTab: unknown = null;
  for (const t of tabs) {
    const ttl = (t as Record<string, unknown>)?.tabRenderer as Record<string, unknown> | undefined;
    if (!ttl) continue;
    const ep = ttl.endpoint as { commandMetadata?: { webCommandMetadata?: { url?: string } } } | undefined;
    const url = ep?.commandMetadata?.webCommandMetadata?.url ?? '';
    if (url.endsWith('/videos')) { videoTab = ttl; break; }
  }
  if (!videoTab) {
    for (const t of tabs) {
      const ttl = (t as Record<string, unknown>)?.tabRenderer as Record<string, unknown> | undefined;
      if (ttl && (ttl as { selected?: boolean }).selected === true) { videoTab = ttl; break; }
    }
  }
  if (!videoTab) {
    for (const t of tabs) {
      const ttl = (t as Record<string, unknown>)?.tabRenderer as Record<string, unknown> | undefined;
      if (ttl && /^(Videos|Видео|Vídeos|Vidéos|Videók|动画|動画|동영상|فيديوهات)$/i.test((ttl as { title?: string }).title ?? '')) {
        videoTab = ttl;
        break;
      }
    }
  }
  if (!videoTab) {
    for (const t of tabs) {
      const ttl = (t as Record<string, unknown>)?.tabRenderer as Record<string, unknown> | undefined;
      if (ttl?.content) { videoTab = ttl; break; }
    }
  }
  if (!videoTab) throw new Error('no videos tab found in channel page');

  const items = extractVideoItems(videoTab);
  const videos: ScrapedVideo[] = items
    .map(parseVideoRenderer)
    .filter((v): v is ScrapedVideo => v !== null);
  return { channelId, channelTitle, videos };
}

function readYtInitialData(): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const eventName = `koko-yt-initial-${Math.random().toString(36).slice(2)}`;
    const onEvent = (ev: Event) => {
      window.removeEventListener(eventName, onEvent);
      resolve(((ev as CustomEvent).detail as Record<string, unknown> | null) ?? null);
    };
    window.addEventListener(eventName, onEvent);
    const script = document.createElement('script');
    script.textContent = `(function(){try{window.dispatchEvent(new CustomEvent(${JSON.stringify(eventName)},{detail:window.ytInitialData||null}));}catch(e){window.dispatchEvent(new CustomEvent(${JSON.stringify(eventName)},{detail:null}));}})();`;
    document.documentElement.appendChild(script);
    script.remove();
    setTimeout(() => { window.removeEventListener(eventName, onEvent); resolve(null); }, 8000);
  });
}

function extractVideoItems(videoTab: unknown): unknown[] {
  const collected: unknown[] = [];
  function walk(node: unknown) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const obj = node as Record<string, unknown>;
    if (obj.richItemRenderer || obj.gridVideoRenderer || obj.videoRenderer) {
      collected.push(obj);
    }
    for (const v of Object.values(obj)) walk(v);
  }
  walk(videoTab);
  return collected;
}

function parseVideoRenderer(item: unknown): ScrapedVideo | null {
  const obj = item as Record<string, unknown>;
  const r =
    (obj.videoRenderer as Record<string, unknown> | undefined) ??
    (obj.gridVideoRenderer as Record<string, unknown> | undefined) ??
    ((obj.richItemRenderer as { content?: { videoRenderer?: Record<string, unknown> } } | undefined)?.content?.videoRenderer as Record<string, unknown> | undefined);
  if (!r) return null;
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

function parseViewCount(s: string): number | null {
  const m = s.replace(/,/g, '').match(/([\d.]+)\s*([KMB]?)/i);
  if (!m) return null;
  const n = Number(m[1]);
  const mult = m[2].toUpperCase() === 'B' ? 1e9 : m[2].toUpperCase() === 'M' ? 1e6 : m[2].toUpperCase() === 'K' ? 1e3 : 1;
  return Math.round(n * mult);
}

function parseDuration(s: string): number | null {
  const parts = s.split(':').map((p) => Number(p));
  if (parts.some(Number.isNaN)) return null;
  let total = 0;
  for (const p of parts) total = total * 60 + p;
  return total > 0 ? total : null;
}

export { parseVideoRenderer, extractVideoItems };
