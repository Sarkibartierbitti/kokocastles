import { storage } from './storage';
import { refreshOwnChannel } from './ownChannel';

export const OWN_CHANNEL_ALARM = 'koko.ownChannelRefresh';

interface AlarmsLike {
  create: (name: string, opts: { periodInMinutes: number }) => void;
  clear: (name: string) => Promise<boolean>;
  onAlarm: { addListener: (cb: (a: { name: string }) => void) => void };
}

interface BrowserLike {
  alarms?: AlarmsLike;
}

declare const browser: BrowserLike;

let listenerRegistered = false;

export async function setupOwnChannelAlarm(): Promise<void> {
  if (!browser.alarms) return; // not supported (e.g. test env without stub)
  await browser.alarms.clear(OWN_CHANNEL_ALARM);
  if (!storage.getOwnChannel()) return;
  const hours = storage.getRefreshIntervalHours();
  const periodInMinutes = Math.max(15, hours * 60);
  browser.alarms.create(OWN_CHANNEL_ALARM, { periodInMinutes });
  if (!listenerRegistered) {
    browser.alarms.onAlarm.addListener((a) => {
      if (a.name !== OWN_CHANNEL_ALARM) return;
      refreshOwnChannel().catch(() => {
        // swallow — surfaced on next manual refresh
      });
    });
    listenerRegistered = true;
  }
}
