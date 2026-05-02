import type { TranscriptSegment } from '~/types';

export type ActiveTabKind = 'channel' | 'search' | 'video' | 'unknown';

export interface ActiveTabInfo {
  kind: ActiveTabKind;
  url: string;
  title: string;
  identifier: string;
  tabId: number;
}

export interface ScrapedVideo {
  videoId: string;
  title: string;
  viewCount: number | null;
  publishedAtRelative: string;
  thumbnailUrl: string;
  durationSec: number | null;
}

export interface ScrapedSearchResult {
  videoId: string;
  channelId: string | null;
  channelTitle: string;
  title: string;
  thumbnailUrl: string;
}

export type ScrapeResult =
  | { kind: 'channel'; videos: ScrapedVideo[]; channelTitle: string; channelId: string }
  | { kind: 'search'; results: ScrapedSearchResult[]; query: string };

export type SidebarToBg =
  | { type: 'fetch-transcript'; videoId: string }
  | { type: 'get-active-tab' }
  | { type: 'scrape-active-tab' }
  | { type: 'ping' };

export type BgToSidebar =
  | { type: 'transcript-ok'; segments: TranscriptSegment[] }
  | { type: 'transcript-err'; message: string }
  | { type: 'active-tab'; info: ActiveTabInfo | null }
  | { type: 'scrape-result'; payload: ScrapeResult }
  | { type: 'scrape-error'; message: string }
  | { type: 'pong' };

export type ContentToBg =
  | { type: 'transcript-payload'; videoId: string; segments: TranscriptSegment[] }
  | { type: 'transcript-error'; videoId: string; message: string }
  | { type: 'scraped-channel'; channelId: string; channelTitle: string; videos: ScrapedVideo[] }
  | { type: 'scraped-search'; query: string; results: ScrapedSearchResult[] }
  | { type: 'scrape-failed'; message: string };

export type AnyMessage = SidebarToBg | BgToSidebar | ContentToBg;
