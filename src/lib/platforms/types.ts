import type { Channel, PlatformId, TranscriptSegment, Video } from '../../types';

export interface PlatformAdapter {
  id: PlatformId;
  resolveChannel(urlOrHandle: string): Promise<Channel>;
  recentUploads(channelId: string, n: number): Promise<Video[]>;
  videoDetails(videoIds: string[]): Promise<Video[]>;
  transcript(videoId: string): Promise<TranscriptSegment[]>;
  thumbnail(videoId: string): string;
}
