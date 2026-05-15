import type { BgToSidebar, ScrapeResult, ScrapedSearchResult, ScrapedVideo, SidebarToBg } from './messaging';
import { runBatch, type BatchResult } from './batch-queue';
import { activity } from './activity';
import { storage } from './storage';
import type { ScrapedVideoCacheEntry } from '~/types';

const SEARCH_URL = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
// Hit /videos directly. Channel home page (/channel/<id>) defaults to the
// "Featured" tab whose ytInitialData has curated sections instead of the
// uploads grid — scrapeChannel() then returns 0 videos. /channel/<id>/videos
// loads the Videos tab as the default tab, so ytInitialData contains the
// gridVideoRenderer / richItemRenderer items we need.
const CHANNEL_URL = (id: string) => `https://www.youtube.com/channel/${encodeURIComponent(id)}/videos`;

async function scrapeUrlViaBackground(url: string, kind: 'channel' | 'search'): Promise<ScrapeResult> {
  const taskName = kind === 'search' ? 'scrape-search' : 'scrape-channel';
  const id = activity.start({
    task: taskName,
    provider: 'youtube-tab',
    model: 'dom-scrape',
    detail: url,
  });
  try {
    const req: SidebarToBg = { type: 'scrape-url', url, kind };
    const reply = (await browser.runtime.sendMessage(req)) as BgToSidebar;
    if (reply?.type === 'scrape-result') {
      activity.done(id, {});
      return reply.payload;
    }
    if (reply?.type === 'scrape-error') {
      activity.error(id, reply.message);
      throw new Error(reply.message);
    }
    const msg = `unexpected reply from background: ${JSON.stringify(reply)}`;
    activity.error(id, msg);
    throw new Error(msg);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // If we already marked error above the entry status is now 'error' —
    // calling error() again is a no-op (status guarded).
    activity.error(id, msg);
    throw e;
  }
}

export async function scrapeSearchQuery(query: string): Promise<{ query: string; results: ScrapedSearchResult[] }> {
  const r = await scrapeUrlViaBackground(SEARCH_URL(query), 'search');
  if (r.kind !== 'search') throw new Error('expected search result');
  return { query: r.query, results: r.results };
}

export interface ChannelDigest {
  channelId: string;
  channelTitle: string;
  videos: ScrapedVideo[];
}

export async function scrapeChannelById(channelId: string): Promise<ChannelDigest> {
  const r = await scrapeUrlViaBackground(CHANNEL_URL(channelId), 'channel');
  if (r.kind !== 'channel') throw new Error('expected channel result');
  return { channelId: r.channelId, channelTitle: r.channelTitle, videos: r.videos };
}

export interface BatchScrapeOptions {
  concurrency?: number;
  jitterMs?: number;
  onProgress?: (completed: number, total: number) => void;
  signal?: AbortSignal;
  latestN?: number;       // 1–30, default 30
  databankId?: string;    // when set, append scraped refs to this databank
}

const MAX_LATEST = 30;

async function persistChannelResult(d: ChannelDigest, latestN: number, databankId?: string): Promise<void> {
  const n = Math.max(1, Math.min(MAX_LATEST, latestN));
  const sliced = d.videos.slice(0, n);
  const now = new Date().toISOString();
  const entries: ScrapedVideoCacheEntry[] = sliced.map((v) => ({
    platform: 'youtube',
    videoId: v.videoId,
    channelId: d.channelId,
    channelTitle: d.channelTitle,
    title: v.title,
    viewCount: v.viewCount,
    publishedAtRelative: v.publishedAtRelative,
    thumbnailUrl: v.thumbnailUrl,
    durationSec: v.durationSec,
    fetchedAt: now,
  }));
  if (entries.length > 0) await storage.setScrapedVideos(entries);
  if (databankId && entries.length > 0) {
    for (const e of entries) {
      await storage.addToDatabank(databankId, {
        platform: 'youtube',
        videoId: e.videoId,
      });
    }
  }
}

export async function batchScrapeChannels(
  channelIds: string[],
  opts: BatchScrapeOptions = {},
): Promise<BatchResult<ChannelDigest>[]> {
  const latestN = Math.max(1, Math.min(MAX_LATEST, opts.latestN ?? MAX_LATEST));
  const results = await runBatch(channelIds, (id) => scrapeChannelById(id), {
    concurrency: opts.concurrency ?? 2,
    jitterMs: opts.jitterMs ?? 2500,
    onProgress: opts.onProgress,
    signal: opts.signal,
  });
  for (const r of results) {
    if (r.ok) {
      r.value.videos = r.value.videos.slice(0, latestN);
      await persistChannelResult(r.value, latestN, opts.databankId);
    }
  }
  return results;
}

export function uniqueChannelsFromSearch(results: ScrapedSearchResult[]): { channelId: string; channelTitle: string }[] {
  const seen = new Set<string>();
  const out: { channelId: string; channelTitle: string }[] = [];
  for (const r of results) {
    if (!r.channelId) continue;
    if (seen.has(r.channelId)) continue;
    seen.add(r.channelId);
    out.push({ channelId: r.channelId, channelTitle: r.channelTitle });
  }
  return out;
}
