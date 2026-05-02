import { useEffect, useMemo, useState } from 'react';
import { storage } from '~/lib/storage';
import { triggerDownload, videosToCSV, videosToXLSX } from '~/lib/export';
import type { ExportFormat } from '~/lib/export';
import type { DeepAnalysis, Video } from '~/types';

const CSV_MIME = 'text/csv;charset=utf-8';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

interface Props {
  videos: Video[];
  channelTitle: string;
  onAnalyze: (videos: Video[]) => Promise<void>;
  onClose: () => void;
  isAnalyzing: boolean;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

async function buildAnalysesMap(videos: Video[]): Promise<Map<string, DeepAnalysis>> {
  const m = new Map<string, DeepAnalysis>();
  for (const v of videos) {
    const a = await storage.getDeep(v.platform, v.videoId);
    if (a) m.set(v.videoId, a);
  }
  return m;
}

export default function ExportPanel({
  videos,
  channelTitle,
  onAnalyze,
  onClose: _onClose,
  isAnalyzing,
}: Props) {
  void _onClose;
  const max = Math.max(1, videos.length);
  const initialExportN = Math.min(10, max);
  const initialAnalyzeN = Math.min(3, max);

  const [exportTopN, setExportTopN] = useState(initialExportN);
  const [analyzeTopN, setAnalyzeTopN] = useState(initialAnalyzeN);
  const [format, setFormat] = useState<ExportFormat>('xlsx');
  const [exportTicks, setExportTicks] = useState<Set<string>>(
    () => new Set(videos.slice(0, initialExportN).map((v) => v.videoId))
  );
  const [analyzeTicks, setAnalyzeTicks] = useState<Set<string>>(
    () => new Set(videos.slice(0, initialAnalyzeN).map((v) => v.videoId))
  );

  // Re-init both sets when the videos array identity changes (e.g. sort changed)
  useEffect(() => {
    const eN = clamp(exportTopN, 1, Math.max(1, videos.length));
    const aN = clamp(analyzeTopN, 1, Math.max(1, videos.length));
    setExportTicks(new Set(videos.slice(0, eN).map((v) => v.videoId)));
    setAnalyzeTicks(new Set(videos.slice(0, aN).map((v) => v.videoId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos]);

  // Top-N inputs auto-set the FIRST N rows ticked for that category (overwrites manual).
  useEffect(() => {
    setExportTicks(new Set(videos.slice(0, exportTopN).map((v) => v.videoId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportTopN]);

  useEffect(() => {
    setAnalyzeTicks(new Set(videos.slice(0, analyzeTopN).map((v) => v.videoId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyzeTopN]);

  // Enforce: every analyze tick must also be in export ticks (export is a superset).
  useEffect(() => {
    setExportTicks((prev) => {
      let changed = false;
      const next = new Set(prev);
      analyzeTicks.forEach((id) => {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [analyzeTicks]);

  const slug = useMemo(() => slugify(channelTitle || 'channel') || 'channel', [channelTitle]);

  function toggleExport(id: string) {
    const wasChecked = exportTicks.has(id);
    if (wasChecked) {
      // Unticking export → also untick analyze on same row
      setExportTicks((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setAnalyzeTicks((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } else {
      setExportTicks((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    }
  }

  function toggleAnalyze(id: string) {
    const wasChecked = analyzeTicks.has(id);
    if (wasChecked) {
      setAnalyzeTicks((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } else {
      // Ticking analyze auto-ticks export
      setAnalyzeTicks((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      setExportTicks((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    }
  }

  async function doExport(targets: Video[], suffix: string) {
    if (targets.length === 0) return;
    const analyses = await buildAnalysesMap(targets);
    const date = todayISO();
    if (format === 'xlsx') {
      const buf = await videosToXLSX(targets, analyses);
      triggerDownload(`${slug}-${suffix}-${date}.xlsx`, buf, XLSX_MIME);
    } else {
      const csv = videosToCSV(targets, analyses);
      triggerDownload(`${slug}-${suffix}-${date}.csv`, csv, CSV_MIME);
    }
  }

  async function exportTopNGo() {
    const subset = videos.slice(0, exportTopN).filter((v) => exportTicks.has(v.videoId));
    await doExport(subset, `top${exportTopN}`);
  }

  async function exportAll() {
    const subset = videos.filter((v) => exportTicks.has(v.videoId));
    await doExport(subset, 'all');
  }

  async function analyzeTopNGo() {
    const subset = videos.slice(0, analyzeTopN).filter((v) => analyzeTicks.has(v.videoId));
    if (subset.length === 0) return;
    await onAnalyze(subset);
  }

  return (
    <div
      className="absolute right-0 mt-1 w-[32rem] z-20 rounded-xl bg-white shadow-lg ring-1 ring-sky-200 p-3 max-h-[32rem] overflow-y-auto"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="sticky top-0 bg-white pb-2 border-b border-sky-100 space-y-2">
        {/* Row 1: compound Export top + Analyze top */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-2xl ring-1 ring-sky-200 bg-white px-2 py-1.5 text-sm">
            <span>Export top</span>
            <input
              type="number"
              min={1}
              max={max}
              value={exportTopN}
              onChange={(e) => setExportTopN(clamp(Number(e.target.value), 1, max))}
              className="w-12 px-1 py-0.5 rounded ring-1 ring-sky-200 text-center"
            />
            <button
              type="button"
              onClick={exportTopNGo}
              className="ml-1 px-2 py-0.5 rounded-lg bg-koko-pink/40 hover:bg-koko-pink/60"
            >
              Go
            </button>
          </div>
          <div className="inline-flex items-center gap-1 rounded-2xl ring-1 ring-sky-200 bg-white px-2 py-1.5 text-sm">
            <span>Analyze top</span>
            <input
              type="number"
              min={1}
              max={max}
              value={analyzeTopN}
              onChange={(e) => setAnalyzeTopN(clamp(Number(e.target.value), 1, max))}
              className="w-12 px-1 py-0.5 rounded ring-1 ring-sky-200 text-center"
            />
            <button
              type="button"
              onClick={analyzeTopNGo}
              disabled={isAnalyzing}
              className="ml-1 px-2 py-0.5 rounded-lg bg-koko-pink/40 hover:bg-koko-pink/60 disabled:opacity-50"
            >
              {isAnalyzing ? '…' : 'Go'}
            </button>
          </div>
        </div>

        {/* Row 2: format toggle (left) + Export all (right) */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex rounded-xl ring-1 ring-sky-200 overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => setFormat('csv')}
              className={`px-3 py-1.5 ${format === 'csv' ? 'bg-koko-sky/40' : 'bg-white hover:bg-sky-50'}`}
            >
              CSV
            </button>
            <button
              type="button"
              onClick={() => setFormat('xlsx')}
              className={`px-3 py-1.5 ${format === 'xlsx' ? 'bg-koko-sky/40' : 'bg-white hover:bg-sky-50'}`}
            >
              XLSX
            </button>
          </div>
          <button type="button" onClick={exportAll} className="koko-btn-ghost text-sm">
            Export all
          </button>
        </div>

        {/* Row 3: column captions over tick columns */}
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-1 text-xs text-slate-500">
          <div />
          <div className="w-12 text-center">export</div>
          <div className="w-12 text-center">analyze</div>
        </div>
      </div>

      <ul className="mt-2 space-y-1.5">
        {videos.map((v) => {
          const exportChecked = exportTicks.has(v.videoId);
          const analyzeChecked = analyzeTicks.has(v.videoId);
          const date = new Date(v.publishedAt).toISOString().slice(0, 10);
          return (
            <li
              key={v.videoId}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-1 py-1 rounded-lg hover:bg-koko-sky/20"
            >
              <div className="flex items-center gap-2 min-w-0">
                <img
                  src={v.thumbnailUrl}
                  alt=""
                  className="w-20 aspect-video object-cover rounded shrink-0 bg-sky-100"
                  loading="lazy"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{v.title}</div>
                  <div className="text-xs text-slate-500 truncate">
                    {v.viewCount.toLocaleString()} views · {date}
                  </div>
                </div>
              </div>
              <div className="w-12 flex justify-center">
                <input
                  type="checkbox"
                  checked={exportChecked}
                  onChange={() => toggleExport(v.videoId)}
                />
              </div>
              <div className="w-12 flex justify-center">
                <input
                  type="checkbox"
                  checked={analyzeChecked}
                  onChange={() => toggleAnalyze(v.videoId)}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
