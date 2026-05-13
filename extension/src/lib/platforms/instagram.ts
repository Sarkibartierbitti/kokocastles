import type { PlatformAdapter } from './types';
import type { ScrapedVideo } from '../messaging';

export interface InstagramScrapeResult {
  channelId: string;
  channelTitle: string;
  videos: ScrapedVideo[];
}

function extractIgId(url: string): string {
  const m = url.match(/\/(?:reel|p|tv)\/([^/?]+)/);
  return m ? m[1] : url;
}

export function parseInstagramProfile(html: string): InstagramScrapeResult {
  const handle =
    html.match(/<meta property="og:url" content="https:\/\/www\.instagram\.com\/([^/?"]+)/)?.[1] ?? '';
  const title =
    html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ?? handle;

  const videos: ScrapedVideo[] = [];
  const blobs = Array.from(html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g));
  for (const b of blobs) {
    try {
      const j = JSON.parse(b[1]);
      const arr = Array.isArray(j?.video) ? j.video : [];
      for (const v of arr) {
        const url: string = (v?.url ?? v?.contentUrl ?? '') as string;
        if (!url) continue;
        videos.push({
          videoId: extractIgId(url),
          title: String(v?.description ?? v?.name ?? '(untitled reel)'),
          viewCount: Number(v?.interactionStatistic?.userInteractionCount ?? 0) || null,
          publishedAtRelative: String(v?.uploadDate ?? ''),
          thumbnailUrl: String(v?.thumbnailUrl ?? ''),
          durationSec: null,
        });
      }
    } catch {
      // malformed json — skip
    }
  }
  return { channelId: handle, channelTitle: title, videos };
}

export function parseHandleFromUrl(input: string): string {
  try {
    const u = new URL(input);
    const seg = u.pathname.split('/').filter(Boolean)[0];
    return seg ?? input;
  } catch {
    return input.replace(/^@/, '');
  }
}

export const instagramAdapter: PlatformAdapter = {
  id: 'instagram',
  async resolveChannel(urlOrHandle) {
    const handle = parseHandleFromUrl(urlOrHandle);
    return {
      platform: 'instagram',
      channelId: handle,
      handle,
      title: handle,
    };
  },
  async recentUploads() {
    throw new Error('instagram.recentUploads requires active-tab scrape bridge — open the profile page and use Refresh.');
  },
  async videoDetails() {
    return [];
  },
  async transcript() {
    throw new Error('instagram.transcript not supported in v1');
  },
  thumbnail() {
    return '';
  },
};
