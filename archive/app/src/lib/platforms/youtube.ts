import type { Channel, TranscriptSegment, Video } from '../../types';
import { storage } from '../storage';
import { fetchTranscript } from '../transcript';
import type { PlatformAdapter } from './types';

const API = 'https://www.googleapis.com/youtube/v3';

function key(): string {
  const k = storage.getYoutubeKey();
  if (!k) throw new Error('YouTube Data API key missing — set in Settings');
  return k;
}

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ ...params, key: key() }).toString();
  const res = await fetch(`${API}/${path}?${qs}`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`YouTube ${res.status}: ${body || res.statusText}`);
  }
  return (await res.json()) as T;
}

export function parseChannelInput(input: string): { kind: 'id' | 'handle' | 'username'; value: string } {
  const trimmed = input.trim();
  const u = (() => {
    try { return new URL(trimmed); } catch { return null; }
  })();
  if (u && (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be'))) {
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0]?.startsWith('@')) return { kind: 'handle', value: parts[0].slice(1) };
    if (parts[0] === 'channel' && parts[1]) return { kind: 'id', value: parts[1] };
    if (parts[0] === 'c' && parts[1]) return { kind: 'username', value: parts[1] };
    if (parts[0] === 'user' && parts[1]) return { kind: 'username', value: parts[1] };
  }
  if (trimmed.startsWith('@')) return { kind: 'handle', value: trimmed.slice(1) };
  if (/^UC[\w-]{20,}$/.test(trimmed)) return { kind: 'id', value: trimmed };
  return { kind: 'handle', value: trimmed };
}

interface ChannelListResp {
  items?: {
    id: string;
    snippet: { title: string; customUrl?: string; thumbnails?: { default?: { url: string } } };
    statistics: { subscriberCount?: string };
    contentDetails: { relatedPlaylists: { uploads: string } };
  }[];
}

interface PlaylistItemsResp {
  items?: {
    contentDetails: { videoId: string; videoPublishedAt?: string };
    snippet: { title: string; channelId: string; channelTitle: string };
  }[];
  nextPageToken?: string;
}

interface VideosResp {
  items?: {
    id: string;
    snippet: { title: string; channelId: string; channelTitle: string; publishedAt: string; thumbnails?: { high?: { url: string }; maxres?: { url: string } } };
    statistics: { viewCount?: string; likeCount?: string };
    contentDetails: { duration: string };
  }[];
}

function isoDurationToSec(iso: string): number {
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
}

async function resolveByHandle(handle: string) {
  return get<ChannelListResp>('channels', { part: 'snippet,statistics,contentDetails', forHandle: `@${handle}` });
}

async function resolveByUsername(username: string) {
  return get<ChannelListResp>('channels', { part: 'snippet,statistics,contentDetails', forUsername: username });
}

async function resolveById(id: string) {
  return get<ChannelListResp>('channels', { part: 'snippet,statistics,contentDetails', id });
}

async function uploadsPlaylistId(channelId: string): Promise<string> {
  const r = await resolveById(channelId);
  const item = r.items?.[0];
  if (!item) throw new Error(`channel ${channelId} not found`);
  return item.contentDetails.relatedPlaylists.uploads;
}

export const youtubeAdapter: PlatformAdapter = {
  id: 'youtube',

  async resolveChannel(input) {
    const parsed = parseChannelInput(input);
    let resp: ChannelListResp;
    if (parsed.kind === 'id') resp = await resolveById(parsed.value);
    else if (parsed.kind === 'handle') resp = await resolveByHandle(parsed.value);
    else resp = await resolveByUsername(parsed.value);
    const item = resp.items?.[0];
    if (!item) throw new Error(`channel not found: ${input}`);
    return {
      platform: 'youtube',
      channelId: item.id,
      handle: item.snippet.customUrl,
      title: item.snippet.title,
      subscriberCount: item.statistics.subscriberCount ? Number(item.statistics.subscriberCount) : undefined,
      thumbnailUrl: item.snippet.thumbnails?.default?.url,
    } satisfies Channel;
  },

  async recentUploads(channelId, n) {
    const playlistId = await uploadsPlaylistId(channelId);
    const ids: string[] = [];
    let pageToken: string | undefined;
    while (ids.length < n) {
      const r: PlaylistItemsResp = await get('playlistItems', {
        part: 'contentDetails,snippet',
        playlistId,
        maxResults: String(Math.min(50, n - ids.length)),
        ...(pageToken ? { pageToken } : {}),
      });
      r.items?.forEach((it) => ids.push(it.contentDetails.videoId));
      if (!r.nextPageToken || ids.length >= n) break;
      pageToken = r.nextPageToken;
    }
    return this.videoDetails(ids.slice(0, n));
  },

  async videoDetails(videoIds) {
    const out: Video[] = [];
    for (let i = 0; i < videoIds.length; i += 50) {
      const batch = videoIds.slice(i, i + 50);
      const r: VideosResp = await get('videos', {
        part: 'snippet,statistics,contentDetails',
        id: batch.join(','),
      });
      r.items?.forEach((it) => {
        out.push({
          platform: 'youtube',
          videoId: it.id,
          channelId: it.snippet.channelId,
          channelTitle: it.snippet.channelTitle,
          title: it.snippet.title,
          publishedAt: it.snippet.publishedAt,
          durationSec: isoDurationToSec(it.contentDetails.duration),
          viewCount: it.statistics.viewCount ? Number(it.statistics.viewCount) : 0,
          likeCount: it.statistics.likeCount ? Number(it.statistics.likeCount) : undefined,
          thumbnailUrl: it.snippet.thumbnails?.maxres?.url || it.snippet.thumbnails?.high?.url || `https://img.youtube.com/vi/${it.id}/hqdefault.jpg`,
        });
      });
    }
    return out;
  },

  async transcript(videoId): Promise<TranscriptSegment[]> {
    return fetchTranscript('youtube', videoId);
  },

  thumbnail(videoId) {
    return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  },
};
