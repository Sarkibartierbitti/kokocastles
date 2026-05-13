import { defineContentScript } from 'wxt/utils/define-content-script';
import { parseInstagramProfile } from '~/lib/platforms/instagram';
import type { ContentToBg } from '~/lib/messaging';

export default defineContentScript({
  matches: ['https://www.instagram.com/*'],
  runAt: 'document_idle',
  main() {
    browser.runtime.onMessage.addListener((message) => {
      const msg = message as { type?: string; kind?: string };
      if (msg.type !== 'scrape' || msg.kind !== 'channel') return undefined;
      console.log('[koko ig-scrape] received scrape request');
      try {
        const html = document.documentElement.outerHTML;
        const r = parseInstagramProfile(html);
        console.log('[koko ig-scrape] success:', r.channelId, r.videos.length, 'videos');
        const result: ContentToBg = {
          type: 'scraped-channel',
          channelId: r.channelId,
          channelTitle: r.channelTitle,
          videos: r.videos,
        };
        return Promise.resolve(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[koko ig-scrape] failed:', message);
        const out: ContentToBg = { type: 'scrape-failed', message };
        return Promise.resolve(out);
      }
    });
  },
});
