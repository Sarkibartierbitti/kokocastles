import type { DeepAnalysis, PlatformId, Video } from '../types';

export function platformVideoUrl(platform: PlatformId, videoId: string): string {
  switch (platform) {
    case 'youtube':
      return `https://www.youtube.com/watch?v=${videoId}`;
    case 'tiktok':
      return `https://www.tiktok.com/video/${videoId}`;
    case 'instagram':
      return `https://www.instagram.com/reel/${videoId}/`;
  }
}

function csvField(v: string | number | null | undefined): string {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowFor(v: Video, a: DeepAnalysis | null): string[] {
  const date = new Date(v.publishedAt).toISOString().slice(0, 10);
  if (!a) {
    return [
      v.channelTitle,
      platformVideoUrl(v.platform, v.videoId),
      String(v.viewCount),
      date,
      '',
      '',
      '',
      '',
    ];
  }
  const hook = `spoken: "${a.hook.spoken}" | on-screen: "${a.hook.onScreen}" | visual: "${a.hook.visualFormat}"`;
  const mainIdea = a.structure
    .slice(0, 2)
    .map((b) => b.beat)
    .join(' → ');
  const ctaBeat = a.structure.find((b) => /cta|call to action/i.test(b.label));
  const cta = ctaBeat ? ctaBeat.beat : '';
  const formats = `${a.hook.visualFormat} · ${a.pacing.rhythm}`;
  return [
    v.channelTitle,
    platformVideoUrl(v.platform, v.videoId),
    String(v.viewCount),
    date,
    hook,
    mainIdea,
    cta,
    formats,
  ];
}

export function videosToCSV(videos: Video[], analyses: Map<string, DeepAnalysis>): string {
  const header = ['channel', 'video_url', 'views', 'upload_date', 'hook', 'main_idea', 'cta', 'formats'];
  const rows = videos.map((v) => rowFor(v, analyses.get(v.videoId) ?? null));
  return [header, ...rows].map((row) => row.map(csvField).join(',')).join('\n');
}

export function triggerDownload(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
