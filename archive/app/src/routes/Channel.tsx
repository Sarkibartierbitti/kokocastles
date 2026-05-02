import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import ExportPanel from '../components/ExportPanel';
import MissingKeyBanner from '../components/MissingKeyBanner';
import VideoCard from '../components/VideoCard';
import { analyzeDeep, analyzeTriage, imageUrlToBase64 } from '../lib/llm/tasks';
import { pMap } from '../lib/concurrency';
import { getAdapter } from '../lib/platforms';
import { flagOutliers } from '../lib/outlier';
import { storage } from '../lib/storage';
import { sliceByTime } from '../lib/transcript';
import type { OutlierFlag, PlatformId, TranscriptSegment, TriageResult, Video } from '../types';

export default function Channel() {
  const { platform, channelId } = useParams<{ platform: PlatformId; channelId: string }>();
  const [videos, setVideos] = useState<Video[]>([]);
  const [count, setCount] = useState(30);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [triages, setTriages] = useState<Record<string, TriageResult>>({});
  const [triaging, setTriaging] = useState(false);
  const [sortKey, setSortKey] = useState<'date' | 'views' | 'ratio'>('date');
  const [outlierOnly, setOutlierOnly] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const flags: OutlierFlag[] = useMemo(() => {
    const computed = flagOutliers(videos);
    const filtered = outlierOnly ? computed.filter((f) => f.isOutlier) : computed;
    const sorted = [...filtered];
    if (sortKey === 'views') {
      sorted.sort((a, b) => b.video.viewCount - a.video.viewCount);
    } else if (sortKey === 'ratio') {
      sorted.sort((a, b) => b.ratio - a.ratio);
    } else {
      sorted.sort(
        (a, b) =>
          new Date(b.video.publishedAt).getTime() - new Date(a.video.publishedAt).getTime()
      );
    }
    return sorted;
  }, [videos, sortKey, outlierOnly]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!sortRef.current?.contains(e.target as Node)) setSortOpen(false);
    }
    if (sortOpen) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [sortOpen]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!exportRef.current?.contains(e.target as Node)) setExportOpen(false);
    }
    if (exportOpen) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [exportOpen]);

  const sortLabel = sortKey === 'date' ? 'recent' : sortKey === 'views' ? 'views' : 'outlier ratio';

  useEffect(() => {
    setCount(30);
  }, [platform, channelId]);

  useEffect(() => {
    if (!platform || !channelId) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    getAdapter(platform)
      .recentUploads(channelId, count)
      .then((v) => {
        if (cancelled) return;
        setVideos(v);
        const cached: Record<string, TriageResult> = {};
        v.forEach((vid) => {
          const c = storage.getTriage(vid.platform, vid.videoId);
          if (c) cached[vid.videoId] = c;
        });
        setTriages(cached);
      })
      .catch((e) => !cancelled && setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [platform, channelId, count]);

  async function handleAnalyze(targets: Video[]) {
    if (!platform) return;
    setAnalyzing(true);
    const concurrency = storage.getLLMProvider() === 'gemini' ? 2 : 4;
    try {
      const adapter = getAdapter(platform);
      await pMap(targets, concurrency, async (v) => {
        if (storage.getDeep(v.platform, v.videoId)) return;
        const triageThumbUrl = adapter.thumbnail(v.videoId);
        const thumb = await imageUrlToBase64(triageThumbUrl).catch(() =>
          imageUrlToBase64(v.thumbnailUrl)
        );
        let tx: TranscriptSegment[] = [];
        try {
          tx = await adapter.transcript(v.videoId);
        } catch {
          // transcript missing — analyzeDeep handles unavailable transcripts
        }
        await analyzeDeep(v, thumb, tx);
      });
    } finally {
      setAnalyzing(false);
    }
  }

  async function runTriage() {
    if (!platform) return;
    setTriaging(true);
    const concurrency = storage.getLLMProvider() === 'gemini' ? 2 : 6;
    try {
      const adapter = getAdapter(platform);
      await pMap(videos, concurrency, async (v) => {
        if (storage.getTriage(v.platform, v.videoId)) return;
        let hookText = '';
        try {
          const tx = await adapter.transcript(v.videoId);
          hookText = sliceByTime(tx, 0, 5);
        } catch {
          // transcript missing — proceed with thumbnail-only
        }
        const triageThumbUrl = `https://img.youtube.com/vi/${v.videoId}/mqdefault.jpg`;
        const thumb = await imageUrlToBase64(triageThumbUrl).catch(() =>
          imageUrlToBase64(v.thumbnailUrl)
        );
        const r = await analyzeTriage(v, thumb, hookText);
        setTriages((prev) => ({ ...prev, [v.videoId]: r }));
      });
    } finally {
      setTriaging(false);
    }
  }

  function loadMore(delta: number) {
    setCount((c) => c + delta);
  }

  return (
    <div className="space-y-6">
      <MissingKeyBanner needs={['llm', 'youtube']} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-display font-semibold">
          {videos[0]?.channelTitle || 'Channel'}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div ref={sortRef} className="relative">
            <button
              type="button"
              onClick={() => setSortOpen((o) => !o)}
              className="koko-btn-ghost text-sm"
            >
              Sort: {sortLabel}{outlierOnly ? ' · outliers' : ''} ▾
            </button>
            {sortOpen ? (
              <div className="absolute right-0 mt-1 w-56 z-10 rounded-xl bg-white shadow-lg ring-1 ring-sky-200 p-2 space-y-1">
                {(['date', 'views', 'ratio'] as const).map((k) => (
                  <label
                    key={k}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm cursor-pointer hover:bg-koko-pink/30 ${
                      sortKey === k ? 'bg-koko-sky/40' : ''
                    }`}
                  >
                    <input
                      type="radio"
                      name="sort"
                      checked={sortKey === k}
                      onChange={() => setSortKey(k)}
                    />
                    {k === 'date' ? 'recent' : k === 'views' ? 'views' : 'outlier ratio'}
                  </label>
                ))}
                <div className="border-t border-sky-100 my-1" />
                <label className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm cursor-pointer hover:bg-koko-pink/30">
                  <input
                    type="checkbox"
                    checked={outlierOnly}
                    onChange={(e) => setOutlierOnly(e.target.checked)}
                  />
                  outliers only
                </label>
              </div>
            ) : null}
          </div>
          <div ref={exportRef} className="relative">
            <button
              type="button"
              onClick={() => setExportOpen((o) => !o)}
              disabled={videos.length === 0}
              className="koko-btn-ghost text-sm"
            >
              Export ▾
            </button>
            {exportOpen ? (
              <ExportPanel
                videos={flags.map((f) => f.video)}
                channelTitle={videos[0]?.channelTitle || 'channel'}
                onAnalyze={handleAnalyze}
                onClose={() => setExportOpen(false)}
                isAnalyzing={analyzing}
              />
            ) : null}
          </div>
          <button onClick={runTriage} disabled={triaging || videos.length === 0} className="koko-btn">
            {triaging ? 'scanning…' : 'Triage hooks'}
          </button>
        </div>
      </div>

      {err ? <div className="koko-card p-4 text-red-600 text-sm">{err}</div> : null}
      {loading && videos.length === 0 ? (
        <div className="koko-card p-8 text-center text-slate-500">loading recent uploads…</div>
      ) : videos.length === 0 ? (
        <div className="koko-card p-8 text-center text-slate-500">no recent uploads found</div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {flags.map((f) => (
              <VideoCard
                key={f.video.videoId}
                flag={f}
                triageHook={triages[f.video.videoId]?.spokenHook}
              />
            ))}
          </div>
          {videos.length >= count ? (
            <div className="flex justify-center gap-2 pt-2">
              <button
                onClick={() => loadMore(10)}
                disabled={loading}
                className="koko-btn-ghost text-sm"
              >
                {loading ? 'loading…' : 'Load 10 more'}
              </button>
              <button
                onClick={() => loadMore(30)}
                disabled={loading}
                className="koko-btn-ghost text-sm"
              >
                {loading ? 'loading…' : 'Load 30 more'}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
