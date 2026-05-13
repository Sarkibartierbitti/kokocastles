import type { PlatformAdapter } from './types';
import type { ScrapedVideo } from '../messaging';

export interface TikTokScrapeResult {
  channelId: string;
  channelTitle: string;
  videos: ScrapedVideo[];
}

interface TikTokItem {
  id?: string;
  desc?: string;
  createTime?: number;
  author?: { uniqueId?: string; nickname?: string };
  stats?: { playCount?: number };
  video?: { cover?: string; duration?: number };
}

function extractDataBlob(html: string): unknown | null {
  const m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

export function parseTikTokProfile(html: string): TikTokScrapeResult {
  const blob = extractDataBlob(html) as {
    __DEFAULT_SCOPE__?: {
      'webapp.user-detail'?: {
        userInfo?: { user?: { uniqueId?: string; nickname?: string }; itemList?: TikTokItem[] };
        itemList?: TikTokItem[];
      };
    };
  } | null;

  if (!blob) {
    return { channelId: '', channelTitle: '', videos: [] };
  }
  const scope = blob.__DEFAULT_SCOPE__?.['webapp.user-detail'];
  const user = scope?.userInfo?.user;
  const items = scope?.userInfo?.itemList ?? scope?.itemList ?? [];
  const channelId = user?.uniqueId ?? '';
  const channelTitle = user?.nickname ?? channelId;

  const videos: ScrapedVideo[] = (Array.isArray(items) ? items : []).slice(0, 30).map((it) => ({
    videoId: String(it.id ?? ''),
    title: String(it.desc ?? ''),
    viewCount: Number(it.stats?.playCount ?? 0) || null,
    publishedAtRelative: it.createTime ? new Date(it.createTime * 1000).toISOString() : '',
    thumbnailUrl: String(it.video?.cover ?? ''),
    durationSec: typeof it.video?.duration === 'number' ? it.video.duration : null,
  }));
  return { channelId, channelTitle, videos };
}

export function parseHandleFromUrl(input: string): string {
  try {
    const u = new URL(input);
    const seg = u.pathname.split('/').filter(Boolean)[0] ?? '';
    return seg.startsWith('@') ? seg : `@${seg}`;
  } catch {
    return input.startsWith('@') ? input : `@${input}`;
  }
}

export const tiktokAdapter: PlatformAdapter = {
  id: 'tiktok',
  async resolveChannel(urlOrHandle) {
    const handle = parseHandleFromUrl(urlOrHandle);
    return {
      platform: 'tiktok',
      channelId: handle,
      handle,
      title: handle,
    };
  },
  async recentUploads() {
    throw new Error('tiktok.recentUploads requires active-tab scrape bridge — open the profile page and use Refresh.');
  },
  async videoDetails() {
    return [];
  },
  async transcript() {
    throw new Error('tiktok.transcript not supported in v1');
  },
  thumbnail() {
    return '';
  },
};
