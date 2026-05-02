import type { BgToSidebar, SidebarToBg } from './messaging';
import type { TranscriptSegment } from '~/types';

export async function fetchTranscriptViaBackground(videoId: string): Promise<TranscriptSegment[]> {
  const req: SidebarToBg = { type: 'fetch-transcript', videoId };
  const reply = (await browser.runtime.sendMessage(req)) as BgToSidebar;
  if (reply.type === 'transcript-ok') return reply.segments;
  if (reply.type === 'transcript-err') throw new Error(reply.message);
  throw new Error('unexpected reply from background');
}
