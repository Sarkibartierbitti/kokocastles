import { defineContentScript } from 'wxt/utils/define-content-script';
import type { ContentToBg } from '~/lib/messaging';
import type { TranscriptSegment } from '~/types';

export default defineContentScript({
  matches: ['https://www.youtube.com/*', 'https://m.youtube.com/*'],
  runAt: 'document_idle',
  async main() {
    const url = new URL(window.location.href);
    if (url.pathname !== '/watch') return;
    const videoId = url.searchParams.get('v');
    if (!videoId) return;

    try {
      const segments = await scrapeCaptions(videoId);
      const msg: ContentToBg = { type: 'transcript-payload', videoId, segments };
      browser.runtime.sendMessage(msg).catch(() => {});
    } catch (e) {
      const msg: ContentToBg = {
        type: 'transcript-error',
        videoId,
        message: e instanceof Error ? e.message : String(e),
      };
      browser.runtime.sendMessage(msg).catch(() => {});
    }
  },
});

interface CaptionTrack { baseUrl: string; languageCode: string; kind?: string }
interface PlayerResponse {
  captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } };
}

async function scrapeCaptions(videoId: string): Promise<TranscriptSegment[]> {
  void videoId;
  const player = await readPlayerResponse();
  const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks || tracks.length === 0) {
    throw new Error('no captionTracks on this video');
  }
  const track =
    tracks.find((t) => t.languageCode === 'en' && !t.kind) ||
    tracks.find((t) => t.languageCode === 'en') ||
    tracks.find((t) => !t.kind) ||
    tracks[0];
  const trackUrl = track.baseUrl.includes('fmt=') ? track.baseUrl : `${track.baseUrl}&fmt=json3`;
  const res = await fetch(trackUrl);
  if (!res.ok) throw new Error(`captions http ${res.status}`);
  const body = await res.text();
  if (trackUrl.includes('fmt=json3')) return parseJson3(body);
  return parseTimedTextXml(body);
}

function readPlayerResponse(): Promise<PlayerResponse | null> {
  return new Promise((resolve) => {
    const eventName = `koko-player-${Math.random().toString(36).slice(2)}`;
    const onEvent = (ev: Event) => {
      window.removeEventListener(eventName, onEvent);
      const detail = (ev as CustomEvent).detail as PlayerResponse | null;
      resolve(detail ?? null);
    };
    window.addEventListener(eventName, onEvent);

    const script = document.createElement('script');
    script.textContent = `
      (function() {
        try {
          var p = window.ytInitialPlayerResponse || null;
          window.dispatchEvent(new CustomEvent(${JSON.stringify(eventName)}, { detail: p }));
        } catch (e) {
          window.dispatchEvent(new CustomEvent(${JSON.stringify(eventName)}, { detail: null }));
        }
      })();
    `;
    document.documentElement.appendChild(script);
    script.remove();
    setTimeout(() => {
      window.removeEventListener(eventName, onEvent);
      resolve(null);
    }, 3000);
  });
}

interface Json3Event { tStartMs?: number; dDurationMs?: number; segs?: { utf8?: string }[] }

function parseJson3(body: string): TranscriptSegment[] {
  const data = JSON.parse(body) as { events?: Json3Event[] };
  const out: TranscriptSegment[] = [];
  for (const ev of data.events ?? []) {
    if (ev.tStartMs == null || ev.dDurationMs == null || !ev.segs) continue;
    const text = ev.segs.map((s) => s.utf8 ?? '').join('').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    out.push({ start: ev.tStartMs / 1000, dur: ev.dDurationMs / 1000, text });
  }
  return out;
}

function parseTimedTextXml(xml: string): TranscriptSegment[] {
  const segs: TranscriptSegment[] = [];
  const re = /<text[^>]*\bstart="([\d.]+)"[^>]*\bdur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    segs.push({
      start: Number(m[1]),
      dur: Number(m[2]),
      text: decodeEntities(m[3]).replace(/\s+/g, ' ').trim(),
    });
  }
  return segs;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
