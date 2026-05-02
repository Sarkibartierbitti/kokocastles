import type { PlatformId, TranscriptSegment } from '../types';

const PROXY = import.meta.env.VITE_PROXY_URL;

export async function fetchTranscript(platform: PlatformId, videoId: string): Promise<TranscriptSegment[]> {
  if (!PROXY) throw new Error('VITE_PROXY_URL not configured');
  const url = `${PROXY}/transcript?platform=${encodeURIComponent(platform)}&id=${encodeURIComponent(videoId)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`transcript proxy ${res.status}: ${body || res.statusText}`);
  }
  const data = (await res.json()) as TranscriptSegment[];
  return data;
}

export function sliceByTime(transcript: TranscriptSegment[], fromSec: number, toSec: number): string {
  return transcript
    .filter((s) => s.start + s.dur >= fromSec && s.start <= toSec)
    .map((s) => s.text)
    .join(' ')
    .trim();
}

export function fullText(transcript: TranscriptSegment[]): string {
  return transcript.map((s) => s.text).join(' ').trim();
}
