import { storage } from './storage';
import type { PlatformId } from '../types';

export function frameStorageKey(p: PlatformId, id: string): string {
  return `koko.frame.${p}.${id}`;
}

export function decideShouldCapture(framesEnabled: boolean, hasCache: boolean): boolean {
  return framesEnabled && !hasCache;
}

let chain: Promise<unknown> = Promise.resolve();
const inFlight = new Set<string>();

export function enqueueFrameCapture(
  platform: PlatformId,
  videoId: string,
  capture: (videoId: string) => Promise<string>
): Promise<string | null> {
  const key = `${platform}::${videoId}`;
  if (inFlight.has(key)) return Promise.resolve(null);
  inFlight.add(key);
  const job: Promise<string | null> = chain
    .then(() => capture(videoId))
    .then(async (dataUrl: string) => {
      if (dataUrl) await storage.setFrame(platform, videoId, dataUrl);
      return dataUrl || null;
    })
    .catch(() => null)
    .finally(() => {
      inFlight.delete(key);
    });
  chain = job;
  return job;
}

/** Test-only — reset the internal serialization chain. */
export function __resetQueueForTests(): void {
  chain = Promise.resolve();
  inFlight.clear();
}
