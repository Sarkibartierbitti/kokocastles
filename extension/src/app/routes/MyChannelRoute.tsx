import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { storage } from '~/lib/storage';
import { flagOutliers, median } from '~/lib/outlier';
import HypothesisModal from '~/app/components/HypothesisModal';
import type { Channel, Hypothesis, Video } from '~/types';

type SortKey = 'views' | 'outlier' | 'likes' | 'date';

function relativeTime(iso: string): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function MyChannelRoute() {
  const [ownChannel, setOwnChannel] = useState<Channel | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>([]);
  const [refreshedAt, setRefreshedAt] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Hypothesis | undefined>(undefined);
  const [hypFilter, setHypFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('views');

  function refresh() {
    setOwnChannel(storage.getOwnChannel());
    setVideos(storage.getOwnChannelVideos());
    setHypotheses(storage.getHypotheses());
    setRefreshedAt(storage.getOwnChannelRefreshedAt());
  }

  useEffect(() => {
    refresh();
  }, []);

  async function doRefresh() {
    setBusy(true);
    setErr(null);
    try {
      const { refreshOwnChannel } = await import('~/lib/ownChannel');
      await refreshOwnChannel();
      refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveHypothesis(h: Hypothesis) {
    await storage.upsertHypothesis(h);
    setModalOpen(false);
    setEditing(undefined);
    refresh();
  }

  async function removeHypothesis(id: string) {
    await storage.deleteHypothesis(id);
    if (hypFilter === id) setHypFilter(null);
    refresh();
  }

  const flagged = useMemo(() => flagOutliers(videos, storage.getOutlierThreshold()), [videos]);
  const channelMedian = useMemo(() => median(videos.map((v) => v.viewCount)), [videos]);

  const filtered = useMemo(() => {
    if (!hypFilter) return flagged;
    const h = hypotheses.find((x) => x.id === hypFilter);
    if (!h) return flagged;
    const tagged = new Set([...h.manualVideoIds, ...h.appliedAuto]);
    return flagged.filter((f) => tagged.has(f.video.videoId));
  }, [flagged, hypFilter, hypotheses]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      switch (sortKey) {
        case 'views':
          return b.video.viewCount - a.video.viewCount;
        case 'likes':
          return (b.video.likeCount ?? 0) - (a.video.likeCount ?? 0);
        case 'outlier':
          return b.ratio - a.ratio;
        case 'date':
          return (b.video.publishedAt || '').localeCompare(a.video.publishedAt || '');
      }
    });
    return copy;
  }, [filtered, sortKey]);

  if (!ownChannel) {
    return (
      <div className="space-y-3 max-w-3xl">
        <h1 className="text-xl font-display font-semibold">My Channel</h1>
        <p className="text-sm text-slate-500">
          No own channel linked. <Link to="/settings" className="text-koko-pink-deep underline">Link one in Settings</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-display font-semibold">{ownChannel.title}</h1>
          <p className="text-xs text-slate-500">
            {ownChannel.channelId} · median {channelMedian.toLocaleString()} views · refreshed {relativeTime(refreshedAt)}
          </p>
        </div>
        <span className="flex-1" />
        <button
          type="button"
          onClick={doRefresh}
          disabled={busy}
          className="rounded bg-koko-pink-deep px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 hover:bg-pink-500"
        >
          {busy ? 'Refreshing…' : 'Refresh now'}
        </button>
      </header>

      {err && <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>}

      <section className="rounded border border-sky-100 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Hypotheses</h2>
          <button
            type="button"
            onClick={() => {
              setEditing(undefined);
              setModalOpen(true);
            }}
            className="rounded border border-sky-200 px-2 py-1 text-xs hover:bg-sky-50"
          >
            + New hypothesis
          </button>
        </div>
        {hypotheses.length === 0 ? (
          <p className="mt-2 text-xs text-slate-400">No hypotheses yet.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-xs">
            {hypotheses.map((h) => (
              <li key={h.id} className="flex items-center gap-2">
                <span className="font-medium">{h.name}</span>
                <span className="text-slate-500">
                  · {h.manualVideoIds.length} manual + {h.appliedAuto.length}/{h.applyToNext} auto
                </span>
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={() => {
                    setEditing(h);
                    setModalOpen(true);
                  }}
                  className="text-slate-500 hover:text-slate-900"
                  aria-label={`Edit ${h.name}`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => removeHypothesis(h.id)}
                  className="text-slate-400 hover:text-red-500"
                  aria-label={`Delete hypothesis ${h.name}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label>
            Sort
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="ml-1 rounded border border-sky-200 px-2 py-1"
            >
              <option value="views">views</option>
              <option value="outlier">outlier</option>
              <option value="likes">likes</option>
              <option value="date">date</option>
            </select>
          </label>
          <label>
            Hypothesis
            <select
              value={hypFilter ?? ''}
              onChange={(e) => setHypFilter(e.target.value || null)}
              className="ml-1 rounded border border-sky-200 px-2 py-1"
            >
              <option value="">(all)</option>
              {hypotheses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </label>
          <span className="text-slate-500">
            Showing {sorted.length} of {videos.length}
          </span>
        </div>

        {videos.length === 0 ? (
          <p className="text-xs text-slate-500">No videos cached. Click “Refresh now” to fetch your latest uploads.</p>
        ) : (
          <ul className="space-y-2">
            {sorted.map((f) => (
              <li
                key={f.video.videoId}
                className="flex items-center gap-3 rounded border border-sky-100 bg-white p-2 text-xs"
              >
                {f.video.thumbnailUrl ? (
                  <img src={f.video.thumbnailUrl} alt="" className="h-10 w-16 rounded object-cover" />
                ) : (
                  <div className="h-10 w-16 rounded bg-sky-50" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{f.video.title}</div>
                  <div className="text-slate-500">
                    {f.video.viewCount.toLocaleString()} views
                    {typeof f.video.likeCount === 'number' && <> · {f.video.likeCount.toLocaleString()} likes</>}
                    {' '}· ratio {f.ratio.toFixed(2)}
                    {f.isOutlier && <span className="ml-1 rounded bg-koko-pink-deep px-1 text-white">outlier</span>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {modalOpen && (
        <HypothesisModal
          ownVideos={videos}
          initial={editing}
          onClose={() => {
            setModalOpen(false);
            setEditing(undefined);
          }}
          onSave={saveHypothesis}
        />
      )}
    </div>
  );
}
