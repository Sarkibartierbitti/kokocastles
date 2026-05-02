import type { TranscriptSegment } from '~/types';

export type SidebarToBg =
  | { type: 'fetch-transcript'; videoId: string }
  | { type: 'ping' };

export type BgToSidebar =
  | { type: 'transcript-ok'; segments: TranscriptSegment[] }
  | { type: 'transcript-err'; message: string }
  | { type: 'pong' };

export type ContentToBg =
  | { type: 'transcript-payload'; videoId: string; segments: TranscriptSegment[] }
  | { type: 'transcript-error'; videoId: string; message: string };

export type AnyMessage = SidebarToBg | BgToSidebar | ContentToBg;
