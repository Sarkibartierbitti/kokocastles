interface Segment { start: number; dur: number; text: string }

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

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
  const watch = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=en`, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; kokocastles/0.1)' },
  });
  if (!watch.ok) throw new Error(`watch page ${watch.status}`);
  const html = await watch.text();

  const m = html.match(/"captionTracks":(\[.*?\])/);
  if (!m) throw new Error('no captions on this video');
  const tracks: { baseUrl: string; languageCode: string; kind?: string }[] = JSON.parse(m[1]);
  if (tracks.length === 0) throw new Error('no captions on this video');

  const preferred =
    tracks.find((t) => t.languageCode === 'en' && !t.kind) ||
    tracks.find((t) => t.languageCode === 'en') ||
    tracks.find((t) => !t.kind) ||
    tracks[0];

  const xmlUrl = preferred.baseUrl.replace(/\\u0026/g, '&');
  const xmlRes = await fetch(xmlUrl);
  if (!xmlRes.ok) throw new Error(`captions ${xmlRes.status}`);
  const xml = await xmlRes.text();
  return parseTimedTextXml(xml);
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
