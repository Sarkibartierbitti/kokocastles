import { defineBackground } from 'wxt/utils/define-background';
import type { ContentToBg, SidebarToBg } from '~/lib/messaging';
import type { TranscriptSegment } from '~/types';

interface Pending {
  resolve: (segments: TranscriptSegment[]) => void;
  reject: (msg: string) => void;
  tabId: number;
  timer: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, Pending>();

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const msg = message as SidebarToBg | ContentToBg;

    if (msg.type === 'ping') {
      sendResponse({ type: 'pong' });
      return false;
    }

    if (msg.type === 'fetch-transcript') {
      handleFetchTranscript(msg.videoId).then(
        (segments) => sendResponse({ type: 'transcript-ok', segments }),
        (errMsg: string) => sendResponse({ type: 'transcript-err', message: errMsg }),
      );
      return true;
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
