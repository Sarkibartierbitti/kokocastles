import { useMemo, useRef, useState } from 'react';
import ChannelMultiPicker from '~/app/components/ChannelMultiPicker';
import VideoToolbar from '~/app/components/VideoToolbar';
import ExportFieldPicker from '~/app/components/ExportFieldPicker';
import { batchScrapeChannels, type ChannelDigest } from '~/lib/niche-bridge';
import type { BatchResult } from '~/lib/batch-queue';
import type { ScrapedVideo } from '~/lib/messaging';
import {
  searchRows,
  filterRows,
  sortRows,
  applyHidden,
  type FilterState,
  type SortField,
  type SortDir,
} from '~/lib/feedFilter';
import { storage } from '~/lib/storage';

interface MergedRow extends ScrapedVideo {
  channelId: string;
  channelTitle: string;
}

interface Props {
  videoFilter?: (v: { platform: string; videoId: string }) => boolean;
}

export default function CrossChannel({ videoFilter }: Props = {}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<BatchResult<ChannelDigest>[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  const [search, setSearch] = useState('');
  const [filterState, setFilterState] = useState<FilterState>({});
  const [sortField, setSortField] = useState<SortField>('views');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [sessionHidden, setSessionHidden] = useState<Set<string>>(new Set());
  const [showExport, setShowExport] = useState(false);

  const totalRows = useMemo<MergedRow[]>(() => {
    const rows: MergedRow[] = [];
    for (const r of results) {
      if (!r.ok) continue;
      for (const v of r.value.videos) {
        rows.push({ ...v, channelId: r.value.channelId, channelTitle: r.value.channelTitle });
      }
    }
    return videoFilter
      ? rows.filter((v) => videoFilter({ platform: 'youtube', videoId: v.videoId }))
      : rows;
  }, [results, videoFilter]);

  const visibleRows = useMemo<MergedRow[]>(() => {
    const hidden = storage.getAllHiddenKeys();
    const rowsAsFeed = totalRows.map((r) => ({
      videoId: r.videoId,
      channelId: r.channelId,
      channelTitle: r.channelTitle,
      title: r.title,
      viewCount: r.viewCount ?? 0,
      likeCount: undefined,
      publishedAt: undefined,
      platform: 'youtube',
    }));
    let working = searchRows(rowsAsFeed, search);
    working = filterRows(working, filterState);
    working = sortRows(working, sortField, sortDir);
    working = applyHidden(working, hidden, sessionHidden);
    const order = new Map(working.map((r, i) => [`youtube::${r.videoId}`, i]));
    const allowed = new Set(order.keys());
    const out = totalRows.filter((r) => allowed.has(`youtube::${r.videoId}`));
    out.sort(
      (a, b) =>
        (order.get(`youtube::${a.videoId}`) ?? 0) - (order.get(`youtube::${b.videoId}`) ?? 0),
    );
    return out.slice(0, 50);
  }, [totalRows, search, filterState, sortField, sortDir, sessionHidden]);

  async function run() {
    if (selected.size === 0) return;
    setBusy(true);
    setErr(null);
    setResults([]);
    setProgress({ done: 0, total: selected.size });
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    try {
      const ids = Array.from(selected);
      console.log('[koko crosschannel] batch scrape start, channels=', ids);
      const out = await batchScrapeChannels(ids, {
        concurrency: 2,
        jitterMs: 2500,
        signal: ctrl.signal,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      const okCount = out.filter((r) => r.ok).length;
      const totalVideos = out.reduce((acc, r) => acc + (r.ok ? r.value.videos.length : 0), 0);
      console.log('[koko crosschannel] batch scrape done. ok=', okCount, '/', out.length, ' videos=', totalVideos);
      setResults(out);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[koko crosschannel] batch scrape failed:', msg);
      setErr(msg);
    } finally {
      setBusy(false);
      ctrlRef.current = null;
    }
  }

  function abort() {
    ctrlRef.current?.abort();
  }

  const failures = results.filter((r) => !r.ok);

  return (
    <div className="space-y-6">
      <section className="koko-card p-6 space-y-3">
        <h2 className="text-lg font-display font-semibold">Cross-channel comparison</h2>
        <p className="text-xs text-slate-600">
          Pick up to 5 watchlist channels. Background opens hidden YouTube tabs (2 at a time,
          ~2.5s jitter), scrapes their uploads, merges and sorts by views.
        </p>
        <ChannelMultiPicker selected={selected} onChange={setSelected} max={5} />
        <div className="flex items-center gap-2">
          <button onClick={run} disabled={busy || selected.size === 0} className="koko-btn">
            {busy ? `scraping ${progress.done}/${progress.total}…` : `Scrape ${selected.size} channel${selected.size === 1 ? '' : 's'}`}
          </button>
          {busy ? (
            <button onClick={abort} className="koko-btn-ghost text-sm">cancel</button>
          ) : null}
        </div>
        {err ? <div className="text-sm text-rose-700">{err}</div> : null}
        {!busy && results.length > 0 ? (
          <div className="text-xs text-slate-600">
            <strong>Scrape complete:</strong>{' '}
            {results.filter((r) => r.ok).length}/{results.length} channels succeeded;{' '}
            {results.reduce((acc, r) => acc + (r.ok ? r.value.videos.length : 0), 0)} videos total
            {failures.length > 0 ? (
              <span className="text-amber-800">
                {' '}— failures:{' '}
                {failures.map((f, i) => (f.ok ? null : <span key={i}>{f.error}{i < failures.length - 1 ? '; ' : ''}</span>))}
              </span>
            ) : null}
          </div>
        ) : null}
      </section>

      {totalRows.length > 0 ? (
        <VideoToolbar
          total={totalRows.length}
          shown={visibleRows.length}
          search={search}
          onSearch={setSearch}
          filter={filterState}
          onFilter={setFilterState}
          sortField={sortField}
          sortDir={sortDir}
          onSort={(f, d) => {
            setSortField(f);
            setSortDir(d);
          }}
          onExport={() => setShowExport(true)}
        />
      ) : null}

      {visibleRows.length > 0 ? (
        <section className="koko-card p-4 space-y-2">
          <h3 className="font-display font-semibold">Top {visibleRows.length} videos</h3>
          <ul className="divide-y divide-sky-100">
            {visibleRows.map((v) => (
              <li key={`${v.channelId}-${v.videoId}`} className="py-2 flex gap-3 items-start text-sm">
                <img src={v.thumbnailUrl} alt="" className="w-24 h-14 object-cover rounded ring-1 ring-sky-200 shrink-0" loading="lazy" />
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 font-medium">{v.title}</div>
                  <div className="text-xs text-slate-500">
                    {v.channelTitle} · {(v.viewCount ?? 0).toLocaleString()} views · {v.publishedAtRelative || 'unknown date'}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <button
                    onClick={() =>
                      setSessionHidden((s) => new Set([...s, `youtube::${v.videoId}`]))
                    }
                    className="text-[10px] text-slate-400 hover:text-slate-600 px-1"
                    aria-label={`hide ${v.title} this session`}
                  >
                    hide
                  </button>
                  <button
                    onClick={async () => {
                      await storage.hideVideo('youtube', v.videoId);
                      setSessionHidden((s) => new Set([...s, `youtube::${v.videoId}`]));
                    }}
                    className="text-[10px] text-rose-500 hover:text-rose-700 px-1"
                    aria-label={`hide ${v.title} permanently`}
                  >
                    hide∞
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ExportFieldPicker
        open={showExport}
        onClose={() => setShowExport(false)}
        onConfirm={(fields, format) => {
          const records = visibleRows.map((v) => ({
            video: {
              platform: 'youtube' as const,
              videoId: v.videoId,
              channelId: v.channelId,
              channelTitle: v.channelTitle,
              title: v.title,
              publishedAt: '',
              viewCount: v.viewCount ?? 0,
              thumbnailUrl: v.thumbnailUrl,
            },
            analysis: null,
          }));
          import('~/lib/export').then(({ exportToFile }) => exportToFile(records, fields, format));
          setShowExport(false);
        }}
      />
    </div>
  );
}
