interface Segment { start: number; dur: number; text: string }

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

const BROWSER_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'accept':
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
};

// Public INNERTUBE_API_KEY — same key the YouTube web client embeds.
const INNERTUBE_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

// Multiple INNERTUBE client signatures. Tried in order; first one that returns
// a captionTracks array wins. None require PoToken; some videos still gate
// behind it and will fail across the board.
const INNERTUBE_CLIENTS = [
  {
    name: 'ANDROID',
    body: {
      clientName: 'ANDROID',
      clientVersion: '19.09.37',
      androidSdkVersion: 30,
      hl: 'en',
      gl: 'US',
    },
    ua: 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip',
  },
  {
    name: 'IOS',
    body: {
      clientName: 'IOS',
      clientVersion: '19.09.3',
      deviceModel: 'iPhone14,3',
      hl: 'en',
      gl: 'US',
    },
    ua: 'com.google.ios.youtube/19.09.3 (iPhone14,3; U; CPU iOS 15_6 like Mac OS X)',
  },
  {
    name: 'WEB',
    body: {
      clientName: 'WEB',
      clientVersion: '2.20240514.01.00',
      hl: 'en',
      gl: 'US',
    },
    ua: BROWSER_HEADERS['user-agent'],
  },
];

export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    const url = new URL(req.url);
    if (url.pathname !== '/transcript') {
      return json({ error: 'not found' }, 404);
    }
    const platform = url.searchParams.get('platform');
    const id = url.searchParams.get('id');
    if (!id) return json({ error: 'missing id' }, 400);

    try {
      let segs: Segment[];
      switch (platform) {
        case 'youtube':
          segs = await youtubeTranscript(id);
          break;
        default:
          return json({ error: `platform "${platform}" not supported` }, 400);
      }
      return json(segs, 200);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  },
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS },
  });
}

async function youtubeTranscript(videoId: string): Promise<Segment[]> {
  const errors: string[] = [];

  // Phase 1: try every INNERTUBE client in sequence
  for (const client of INNERTUBE_CLIENTS) {
    try {
      const baseUrl = await captionUrlViaInnertube(videoId, client);
      if (baseUrl) {
        return await fetchAndParseCaptions(baseUrl);
      }
      errors.push(`${client.name}: no captions in response`);
    } catch (e) {
      errors.push(`${client.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Phase 2: fall back to watch-page HTML scrape (often 429s from datacenter IPs)
  try {
    const baseUrl = await captionUrlViaWatchPage(videoId);
    return await fetchAndParseCaptions(baseUrl);
  } catch (e) {
    errors.push(`watch-page: ${e instanceof Error ? e.message : String(e)}`);
  }

  throw new Error(
    `transcript fetch failed (${errors.join(' | ')}). YouTube blocks server-side caption access from many datacenter IPs — paste the transcript manually as fallback.`
  );
}

async function fetchAndParseCaptions(baseUrl: string): Promise<Segment[]> {
  const finalUrl = baseUrl.includes('fmt=') ? baseUrl : `${baseUrl}&fmt=json3`;
  const res = await fetch(finalUrl, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`captions ${res.status}`);
  const body = await res.text();
  if (finalUrl.includes('fmt=json3')) return parseJson3(body);
  return parseTimedTextXml(body);
}

interface ClientSpec {
  name: string;
  body: { clientName: string; clientVersion: string; hl?: string; gl?: string; [k: string]: unknown };
  ua: string;
}

async function captionUrlViaInnertube(videoId: string, client: ClientSpec): Promise<string | null> {
  const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_API_KEY}&prettyPrint=false`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': client.ua,
      'accept-language': 'en-US,en;q=0.9',
      'origin': 'https://www.youtube.com',
      'referer': `https://www.youtube.com/watch?v=${videoId}`,
    },
    body: JSON.stringify({
      videoId,
      context: { client: client.body },
      contentCheckOk: true,
      racyCheckOk: true,
    }),
  });
  if (!res.ok) throw new Error(`innertube ${res.status}`);
  const data = (await res.json()) as InnertubePlayer;
  const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks || tracks.length === 0) return null;
  return pickTrack(tracks).baseUrl;
}

async function captionUrlViaWatchPage(videoId: string): Promise<string> {
  const watch = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=en`, {
    headers: BROWSER_HEADERS,
  });
  if (!watch.ok) throw new Error(`watch page ${watch.status}`);
  const html = await watch.text();
  const m = html.match(/"captionTracks":(\[.*?\])/);
  if (!m) throw new Error('no captionTracks in HTML');
  const tracks: CaptionTrack[] = JSON.parse(m[1]);
  if (tracks.length === 0) throw new Error('empty captionTracks');
  return pickTrack(tracks).baseUrl.replace(/\\u0026/g, '&');
}

interface CaptionTrack { baseUrl: string; languageCode: string; kind?: string }
interface InnertubePlayer {
  captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } };
}

function pickTrack(tracks: CaptionTrack[]): CaptionTrack {
  return (
    tracks.find((t) => t.languageCode === 'en' && !t.kind) ||
    tracks.find((t) => t.languageCode === 'en') ||
    tracks.find((t) => !t.kind) ||
    tracks[0]
  );
}

interface Json3Event { tStartMs?: number; dDurationMs?: number; segs?: { utf8?: string }[] }
interface Json3Body { events?: Json3Event[] }

export function parseJson3(body: string): Segment[] {
  const data = JSON.parse(body) as Json3Body;
  const out: Segment[] = [];
  for (const ev of data.events ?? []) {
    if (ev.tStartMs == null || ev.dDurationMs == null || !ev.segs) continue;
    const text = ev.segs.map((s) => s.utf8 ?? '').join('').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    out.push({ start: ev.tStartMs / 1000, dur: ev.dDurationMs / 1000, text });
  }
  return out;
}

export function parseTimedTextXml(xml: string): Segment[] {
  const segs: Segment[] = [];
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
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
