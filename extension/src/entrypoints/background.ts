import { defineBackground } from 'wxt/utils/define-background';
import type { ActiveTabInfo, ContentToBg, ScrapeResult, SidebarToBg } from '~/lib/messaging';
import type { TranscriptSegment } from '~/types';

interface Pending {
  resolve: (segments: TranscriptSegment[]) => void;
  reject: (msg: string) => void;
  tabId: number;
  timer: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, Pending>();

const ACTIVE_TAB_KEY = 'koko.activeTab';

function classifyUrl(url: string, title: string, tabId: number): ActiveTabInfo | null {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return null; }
  if (!parsed.hostname.endsWith('youtube.com')) return null;
  const path = parsed.pathname;
  const handleMatch = path.match(/^\/@([^/]+)/);
  if (handleMatch) return { kind: 'channel', identifier: '@' + handleMatch[1], url, title, tabId };
  const channelMatch = path.match(/^\/channel\/([^/]+)/);
  if (channelMatch) return { kind: 'channel', identifier: channelMatch[1], url, title, tabId };
  const altMatch = path.match(/^\/(?:c|user)\/([^/]+)/);
  if (altMatch) return { kind: 'channel', identifier: altMatch[1], url, title, tabId };
  if (path === '/results') {
    const q = parsed.searchParams.get('search_query') ?? '';
    if (q) return { kind: 'search', identifier: q, url, title, tabId };
  }
  if (path === '/watch') {
    const v = parsed.searchParams.get('v');
    if (v) return { kind: 'video', identifier: v, url, title, tabId };
  }
  return null;
}

async function refreshActiveTab(): Promise<void> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || tab.id == null || !tab.url) {
    await browser.storage.local.set({ [ACTIVE_TAB_KEY]: null });
    return;
  }
  const info = classifyUrl(tab.url, tab.title ?? '', tab.id);
  await browser.storage.local.set({ [ACTIVE_TAB_KEY]: info });
}

async function handleScrapeActiveTab(): Promise<ScrapeResult> {
  const r = await browser.storage.local.get(ACTIVE_TAB_KEY);
  const info = (r[ACTIVE_TAB_KEY] as ActiveTabInfo | null) ?? null;
  if (!info || info.kind === 'unknown' || info.kind === 'video') {
    throw new Error('active tab is not a YouTube channel or search page');
  }
  let reply: ContentToBg;
  try {
    reply = (await browser.tabs.sendMessage(info.tabId, {
      type: 'scrape',
      kind: info.kind,
    })) as ContentToBg;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `content script did not respond (${msg}). Reload the YouTube tab if you installed/updated the extension after opening it.`,
    );
  }
  if (reply?.type === 'scraped-channel') {
    return { kind: 'channel', videos: reply.videos, channelTitle: reply.channelTitle, channelId: reply.channelId };
  }
  if (reply?.type === 'scraped-search') {
    return { kind: 'search', results: reply.results, query: reply.query };
  }
  if (reply?.type === 'scrape-failed') {
    throw new Error(reply.message);
  }
  throw new Error('unexpected reply from content script');
}

async function handleScrapeUrl(url: string, kind: 'channel' | 'search'): Promise<ScrapeResult> {
  const tab = await browser.tabs.create({ url, active: false });
  if (tab.id == null) throw new Error('failed to open hidden tab');
  const tabId = tab.id;

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      reject(new Error('tab load timeout (15s) — YouTube did not finish loading. Slow network or CAPTCHA gate?'));
    }, 15_000);
    function listener(updatedId: number, change: { status?: string }) {
      if (updatedId === tabId && change.status === 'complete') {
        clearTimeout(timer);
        browser.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    browser.tabs.onUpdated.addListener(listener);
  });

  await new Promise((r) => setTimeout(r, 200));

  let reply: ContentToBg;
  try {
    reply = (await browser.tabs.sendMessage(tabId, { type: 'scrape', kind })) as ContentToBg;
  } catch (e) {
    browser.tabs.remove(tabId).catch(() => {});
    throw new Error(`content script did not respond (${e instanceof Error ? e.message : String(e)})`);
  }
  browser.tabs.remove(tabId).catch(() => {});

  if (reply?.type === 'scraped-channel') {
    return { kind: 'channel', videos: reply.videos, channelTitle: reply.channelTitle, channelId: reply.channelId };
  }
  if (reply?.type === 'scraped-search') {
    return { kind: 'search', results: reply.results, query: reply.query };
  }
  if (reply?.type === 'scrape-failed') {
    throw new Error(reply.message);
  }
  throw new Error('unexpected reply from content script');
}

export default defineBackground(() => {
  browser.tabs.onActivated.addListener(() => { void refreshActiveTab(); });
  browser.tabs.onUpdated.addListener((_id, change) => {
    if (change.url || change.title) void refreshActiveTab();
  });
  void refreshActiveTab();

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

    if (msg.type === 'get-active-tab') {
      refreshActiveTab().then(() =>
        browser.storage.local.get(ACTIVE_TAB_KEY).then((r) =>
          sendResponse({ type: 'active-tab', info: (r[ACTIVE_TAB_KEY] as ActiveTabInfo | null) ?? null }),
        ),
      );
      return true;
    }

    if (msg.type === 'scrape-active-tab') {
      handleScrapeActiveTab().then(
        (payload) => sendResponse({ type: 'scrape-result', payload }),
        (err: unknown) => sendResponse({
          type: 'scrape-error',
          message: err instanceof Error ? err.message : String(err),
        }),
      );
      return true;
    }

    if (msg.type === 'scrape-url') {
      handleScrapeUrl(msg.url, msg.kind).then(
        (payload) => sendResponse({ type: 'scrape-result', payload }),
        (err: Error) => sendResponse({ type: 'scrape-error', message: err?.message ?? String(err) }),
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
