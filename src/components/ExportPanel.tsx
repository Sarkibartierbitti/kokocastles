import { useEffect, useMemo, useState } from 'react';
import { storage } from '../lib/storage';
import { triggerDownload, videosToCSV, videosToXLSX } from '../lib/export';
import type { ExportFormat } from '../lib/export';
import type { DeepAnalysis, Video } from '../types';

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

function buildAnalysesMap(videos: Video[]): Map<string, DeepAnalysis> {
  const m = new Map<string, DeepAnalysis>();
  for (const v of videos) {
    const a = storage.getDeep(v.platform, v.videoId);
    if (a) m.set(v.videoId, a);
  }
  return m;
}

export default function ExportPanel({ videos, channelTitle, onAnalyze, onClose: _onClose, isAnalyzing }: Props) {
  void _onClose;
  const max = Math.max(1, videos.length);
  const initialN = Math.min(10, max);
  const [topN, setTopN] = useState(initialN);
  const [format, setFormat] = useState<ExportFormat>('xlsx');
  const [tickedIds, setTickedIds] = useState<Set<string>>(
    () => new Set(videos.slice(0, initialN).map((v) => v.videoId))
  );

  // Re-init ticked set when the videos array identity changes (e.g. sort changed)
  useEffect(() => {
    const n = Math.min(topN, Math.max(1, videos.length));
    setTickedIds(new Set(videos.slice(0, n).map((v) => v.videoId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos]);

  // When topN changes, auto-tick top N (replace set)
  useEffect(() => {
    setTickedIds(new Set(videos.slice(0, topN).map((v) => v.videoId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topN]);

  const slug = useMemo(() => slugify(channelTitle || 'channel') || 'channel', [channelTitle]);

  function toggle(id: string) {
    setTickedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function doExport(targets: Video[], suffix: string) {
    if (targets.length === 0) return;
    const analyses = buildAnalysesMap(targets);
    const date = todayISO();
    if (format === 'xlsx') {
      const buf = await videosToXLSX(targets, analyses);
      triggerDownload(`${slug}-${suffix}-${date}.xlsx`, buf, XLSX_MIME);
    } else {
      const csv = videosToCSV(targets, analyses);
      triggerDownload(`${slug}-${suffix}-${date}.csv`, csv, CSV_MIME);
    }
  }

  async function exportTopN() {
    const subset = videos.slice(0, topN).filter((v) => tickedIds.has(v.videoId));
    await doExport(subset, `top${topN}`);
  }

  async function exportAll() {
    const subset = videos.filter((v) => tickedIds.has(v.videoId));
    await doExport(subset, 'all');
  }

  async function analyzeTopN() {
    const subset = videos.slice(0, topN).filter((v) => tickedIds.has(v.videoId));
    if (subset.length === 0) return;
    await onAnalyze(subset);
  }

  return (
    <div
      className="absolute right-0 mt-1 w-[26rem] z-20 rounded-xl bg-white shadow-lg ring-1 ring-sky-200 p-3 max-h-[32rem] overflow-y-auto"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex flex-wrap items-center gap-2 sticky top-0 bg-white pb-2 border-b border-sky-100">
        <label className="text-sm flex items-center gap-1">
          Top
          <input
            type="number"
            min={1}
            max={max}
            value={topN}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!Number.isFinite(n)) return;
              setTopN(Math.min(Math.max(1, Math.floor(n)), max));
            }}
            className="w-16 px-2 py-1 rounded-lg ring-1 ring-sky-200 text-sm"
          />
        </label>
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
        <button type="button" onClick={exportTopN} className="koko-btn-ghost text-sm">
          Export top {topN}
        </button>
        <button type="button" onClick={exportAll} className="koko-btn-ghost text-sm">
          Export all
        </button>
        <button
          type="button"
          onClick={analyzeTopN}
          disabled={isAnalyzing}
          className="koko-btn text-sm"
        >
          {isAnalyzing ? 'analyzing…' : `Analyze top ${topN}`}
        </button>
      </div>
      <ul className="mt-2 space-y-1.5">
        {videos.map((v) => {
          const checked = tickedIds.has(v.videoId);
          const date = new Date(v.publishedAt).toISOString().slice(0, 10);
          return (
            <li
              key={v.videoId}
              className="flex items-center gap-2 px-1 py-1 rounded-lg hover:bg-koko-sky/20"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(v.videoId)}
                className="shrink-0"
              />
              <img
                src={v.thumbnailUrl}
                alt=""
                className="w-20 aspect-video object-cover rounded shrink-0 bg-sky-100"
                loading="lazy"
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{v.title}</div>
                <div className="text-xs text-slate-500">
                  {v.viewCount.toLocaleString()} views · {date}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
