import type { TranscriptSegment } from '~/types';

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
