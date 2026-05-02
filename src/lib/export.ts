import type { DeepAnalysis, PlatformId, Video } from '../types';

export type ExportFormat = 'csv' | 'xlsx';

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

const EXPORT_HEADER = [
  'channel',
  'video_url',
  'views',
  'upload_date',
  'hook',
  'main_idea',
  'cta',
  'formats',
];

export function videosToCSV(videos: Video[], analyses: Map<string, DeepAnalysis>): string {
  const rows = videos.map((v) => rowFor(v, analyses.get(v.videoId) ?? null));
  return [EXPORT_HEADER, ...rows].map((row) => row.map(csvField).join(',')).join('\n');
}

export async function videosToXLSX(
  videos: Video[],
  analyses: Map<string, DeepAnalysis>
): Promise<ArrayBuffer> {
  const XLSX = await import('xlsx');
  const rows = videos.map((v) => rowFor(v, analyses.get(v.videoId) ?? null));
  const aoa = [EXPORT_HEADER, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Auto-set column widths based on header + content max length, capped at 60.
  const colWidths = EXPORT_HEADER.map((h, i) => {
    const maxLen = Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length));
    return { wch: Math.min(60, Math.max(10, maxLen + 2)) };
  });
  ws['!cols'] = colWidths;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'videos');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

export function triggerDownload(
  filename: string,
  content: string | ArrayBuffer,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
