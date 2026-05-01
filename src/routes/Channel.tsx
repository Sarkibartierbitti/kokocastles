import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import VideoCard from '../components/VideoCard';
import { analyzeTriage, explainOutlier, imageUrlToBase64 } from '../lib/llm/tasks';
import { pMap } from '../lib/concurrency';
import { getAdapter } from '../lib/platforms';
import { flagOutliers } from '../lib/outlier';
import { storage } from '../lib/storage';
import { sliceByTime } from '../lib/transcript';
import type { OutlierFlag, PlatformId, TriageResult, Video } from '../types';

export default function Channel() {
  const { platform, channelId } = useParams<{ platform: PlatformId; channelId: string }>();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [triages, setTriages] = useState<Record<string, TriageResult>>({});
  const [triaging, setTriaging] = useState(false);
  const [outlierWhy, setOutlierWhy] = useState<Record<string, string>>({});

  const flags: OutlierFlag[] = useMemo(() => flagOutliers(videos), [videos]);

  useEffect(() => {
    if (!platform || !channelId) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    getAdapter(platform)
      .recentUploads(channelId, 30)
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
  }, [platform, channelId]);

  async function runTriage() {
    if (!platform) return;
    setTriaging(true);
    try {
      const adapter = getAdapter(platform);
      await pMap(videos, 6, async (v) => {
        if (storage.getTriage(v.platform, v.videoId)) return;
        let hookText = '';
        try {
          const tx = await adapter.transcript(v.videoId);
          hookText = sliceByTime(tx, 0, 3);
        } catch {
          // transcript missing — proceed with thumbnail-only
        }
        const thumb = await imageUrlToBase64(adapter.thumbnail(v.videoId)).catch(() =>
          imageUrlToBase64(v.thumbnailUrl)
        );
        const r = await analyzeTriage(v, thumb, hookText);
        setTriages((prev) => ({ ...prev, [v.videoId]: r }));
      });
    } finally {
      setTriaging(false);
    }
  }

  async function runOutlierWhy() {
    const targets = flags.filter((f) => f.isOutlier && !outlierWhy[f.video.videoId]);
    await pMap(targets, 4, async (f) => {
      const r = await explainOutlier(f.video, f.ratio);
      setOutlierWhy((prev) => ({ ...prev, [f.video.videoId]: r.reason }));
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-display font-semibold">
          {videos[0]?.channelTitle || 'Channel'}
        </h2>
        <div className="flex gap-2">
          <button onClick={runTriage} disabled={triaging || videos.length === 0} className="koko-btn">
            {triaging ? 'scanning…' : 'Triage hooks'}
          </button>
          <button onClick={runOutlierWhy} disabled={!flags.some((f) => f.isOutlier)} className="koko-btn">
            Why outliers?
          </button>
        </div>
      </div>

      {err ? <div className="koko-card p-4 text-red-600 text-sm">{err}</div> : null}
      {loading ? (
        <div className="koko-card p-8 text-center text-slate-500">loading recent uploads…</div>
      ) : videos.length === 0 ? (
        <div className="koko-card p-8 text-center text-slate-500">no recent uploads found</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {flags.map((f) => (
            <div key={f.video.videoId} className="space-y-2">
              <VideoCard flag={f} triageHook={triages[f.video.videoId]?.spokenHook} />
              {outlierWhy[f.video.videoId] ? (
                <div className="text-xs text-koko-pink-deep px-2">
                  → {outlierWhy[f.video.videoId]}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
