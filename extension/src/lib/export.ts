import type { DeepAnalysis, PlatformId, Video } from '../types';

export type ExportFormat = 'csv' | 'xlsx';

export const EXPORT_FIELDS = [
  'channelTitle',
  'videoUrl',
  'title',
  'date',
  'viewCount',
  'likeCount',
  'outlierRatio',
  'hookSpoken',
  'hookOnScreen',
  'visualFormat',
] as const;
export type ExportField = (typeof EXPORT_FIELDS)[number];

const FIELD_HEADER: Record<ExportField, string> = {
  channelTitle: 'channel',
  videoUrl: 'video_url',
  title: 'title',
  date: 'upload_date',
  viewCount: 'views',
  likeCount: 'likes',
  outlierRatio: 'outlier_ratio',
  hookSpoken: 'hook_spoken',
  hookOnScreen: 'hook_on_screen',
  visualFormat: 'visual_format',
};

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

function cellFor(field: ExportField, v: Video, a: DeepAnalysis | null): string {
  switch (field) {
    case 'channelTitle':
      return v.channelTitle;
    case 'videoUrl':
      return platformVideoUrl(v.platform, v.videoId);
    case 'title':
      return v.title;
    case 'date':
      return new Date(v.publishedAt).toISOString().slice(0, 10);
    case 'viewCount':
      return String(v.viewCount);
    case 'likeCount':
      return String(v.likeCount ?? '');
    case 'outlierRatio':
      return '';
    case 'hookSpoken':
      return a?.hook.spoken ?? '';
    case 'hookOnScreen':
      return a?.hook.onScreen ?? '';
    case 'visualFormat':
      return a?.hook.visualFormat ?? '';
  }
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

export function videosToCSV(
  videos: Video[],
  analyses: Map<string, DeepAnalysis>,
  fields?: ExportField[]
): string {
  if (fields && fields.length > 0) {
    const header = fields.map((f) => FIELD_HEADER[f]);
    const rows = videos.map((v) => {
      const a = analyses.get(v.videoId) ?? null;
      return fields.map((f) => cellFor(f, v, a));
    });
    return [header, ...rows].map((row) => row.map(csvField).join(',')).join('\n');
  }
  const rows = videos.map((v) => rowFor(v, analyses.get(v.videoId) ?? null));
  return [EXPORT_HEADER, ...rows].map((row) => row.map(csvField).join(',')).join('\n');
}

export async function videosToXLSX(
  videos: Video[],
  analyses: Map<string, DeepAnalysis>,
  fields?: ExportField[]
): Promise<ArrayBuffer> {
  const XLSX = await import('xlsx');
  let header: string[];
  let rows: string[][];
  if (fields && fields.length > 0) {
    header = fields.map((f) => FIELD_HEADER[f]);
    rows = videos.map((v) => {
      const a = analyses.get(v.videoId) ?? null;
      return fields.map((f) => cellFor(f, v, a));
    });
  } else {
    header = EXPORT_HEADER;
    rows = videos.map((v) => rowFor(v, analyses.get(v.videoId) ?? null));
  }
  const aoa = [header, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Auto-set column widths based on header + content max length, capped at 60.
  const colWidths = header.map((h, i) => {
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

export async function exportToFile(
  records: Array<{ video: Video; analysis: DeepAnalysis | null }>,
  fields: ExportField[],
  format: ExportFormat
): Promise<void> {
  const videos = records.map((r) => r.video);
  const analyses = new Map<string, DeepAnalysis>();
  for (const r of records) {
    if (r.analysis) analyses.set(r.video.videoId, r.analysis);
  }
  const filename = `kokocastles-export-${Date.now()}.${format}`;
  if (format === 'csv') {
    const csv = videosToCSV(videos, analyses, fields);
    triggerDownload(filename, csv, 'text/csv;charset=utf-8');
  } else {
    const buf = await videosToXLSX(videos, analyses, fields);
    triggerDownload(
      filename,
      buf,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
  }
}
