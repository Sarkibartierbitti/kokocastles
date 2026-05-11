import { defineContentScript } from 'wxt/utils/define-content-script';
import type { ContentToBg, ScrapedSearchResult } from '~/lib/messaging';

export default defineContentScript({
  matches: ['https://www.youtube.com/results*'],
  runAt: 'document_idle',
  main() {
    // Firefox MV2: return a Promise from the listener. See
    // youtube-channel.content.ts for the rationale — same bug.
    browser.runtime.onMessage.addListener((message) => {
      const msg = message as { type?: string; kind?: string };
      if (msg.type !== 'scrape' || msg.kind !== 'search') return undefined;
      console.log('[koko search-scrape] received scrape request');
      return scrapeSearch().then(
        (data): ContentToBg => {
          console.log('[koko search-scrape] success:', data.query, data.results.length, 'results');
          return { type: 'scraped-search', query: data.query, results: data.results };
        },
        (err: unknown): ContentToBg => {
          const message = err instanceof Error ? err.message : String(err);
          console.error('[koko search-scrape] failed:', message);
          return { type: 'scrape-failed', message };
        },
      );
    });
  },
});

interface SearchData { query: string; results: ScrapedSearchResult[] }

async function scrapeSearch(): Promise<SearchData> {
  const data = await readYtInitialData();
  if (!data) throw new Error('ytInitialData missing');

  const params = new URL(window.location.href).searchParams;
  const query = params.get('search_query') ?? '';

  const sections = (data?.contents as Record<string, unknown> | undefined)?.twoColumnSearchResultsRenderer ?? null;
  if (!sections) throw new Error('no search results renderer');

  const collected: ScrapedSearchResult[] = [];
  function walk(node: unknown) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const obj = node as Record<string, unknown>;
    if (obj.videoRenderer) {
      const r = obj.videoRenderer as Record<string, unknown>;
      const videoId = r.videoId as string | undefined;
      if (videoId) {
        const title = (((r.title as { runs?: { text: string }[] } | undefined)?.runs ?? [])[0]?.text) ?? '';
        const channelTitle = (((r.ownerText as { runs?: { text: string }[] } | undefined)?.runs ?? [])[0]?.text)
          ?? (((r.longBylineText as { runs?: { text: string }[] } | undefined)?.runs ?? [])[0]?.text)
          ?? '';
        const channelId =
          (((r.ownerText as { runs?: { navigationEndpoint?: { browseEndpoint?: { browseId?: string } } }[] } | undefined)?.runs ?? [])[0]?.navigationEndpoint?.browseEndpoint?.browseId)
          ?? null;
        const thumbnailUrl = ((r.thumbnail as { thumbnails?: { url: string }[] } | undefined)?.thumbnails ?? []).at(-1)?.url ?? '';
        collected.push({ videoId, channelId, channelTitle, title, thumbnailUrl });
      }
    }
    for (const v of Object.values(obj)) walk(v);
  }
  walk(sections);

  return { query, results: collected.slice(0, 50) };
}

function readYtInitialData(): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const eventName = `koko-yt-search-${Math.random().toString(36).slice(2)}`;
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
