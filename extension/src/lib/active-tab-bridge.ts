import type { ActiveTabInfo, BgToSidebar, ScrapeResult, SidebarToBg } from './messaging';

export async function getActiveTab(): Promise<ActiveTabInfo | null> {
  const req: SidebarToBg = { type: 'get-active-tab' };
  const reply = (await browser.runtime.sendMessage(req)) as BgToSidebar;
  if (reply.type === 'active-tab') return reply.info;
  throw new Error('unexpected reply from background');
}

export async function scrapeActiveTab(): Promise<ScrapeResult> {
  const req: SidebarToBg = { type: 'scrape-active-tab' };
  const reply = (await browser.runtime.sendMessage(req)) as BgToSidebar;
  if (reply.type === 'scrape-result') return reply.payload;
  if (reply.type === 'scrape-error') throw new Error(reply.message);
  throw new Error('unexpected reply from background');
}

const ACTIVE_TAB_KEY = 'koko.activeTab';

export function subscribeActiveTab(listener: (info: ActiveTabInfo | null) => void): () => void {
  const handler = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area !== 'local') return;
    if (ACTIVE_TAB_KEY in changes) {
      listener((changes[ACTIVE_TAB_KEY].newValue as ActiveTabInfo | null) ?? null);
    }
  };
  browser.storage.onChanged.addListener(handler);
  return () => browser.storage.onChanged.removeListener(handler);
}
