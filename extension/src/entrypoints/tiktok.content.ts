import { defineContentScript } from 'wxt/utils/define-content-script';
import { parseTikTokProfile } from '~/lib/platforms/tiktok';
import type { ContentToBg } from '~/lib/messaging';

export default defineContentScript({
  matches: ['https://www.tiktok.com/*'],
  runAt: 'document_idle',
  main() {
    browser.runtime.onMessage.addListener((message) => {
      const msg = message as { type?: string; kind?: string };
      if (msg.type !== 'scrape' || msg.kind !== 'channel') return undefined;
      console.log('[koko tt-scrape] received scrape request');
      try {
        const html = document.documentElement.outerHTML;
        const r = parseTikTokProfile(html);
        console.log('[koko tt-scrape] success:', r.channelId, r.videos.length, 'videos');
        const result: ContentToBg = {
          type: 'scraped-channel',
          channelId: r.channelId,
          channelTitle: r.channelTitle,
          videos: r.videos,
        };
        return Promise.resolve(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[koko tt-scrape] failed:', message);
        const out: ContentToBg = { type: 'scrape-failed', message };
        return Promise.resolve(out);
      }
    });
  },
});
