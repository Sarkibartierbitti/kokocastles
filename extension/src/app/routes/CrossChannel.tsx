import { useMemo, useState } from 'react';
import VideoToolbar from '~/app/components/VideoToolbar';
import ExportFieldPicker from '~/app/components/ExportFieldPicker';
import ScrapeControl from '~/app/components/ScrapeControl';
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

interface MergedRow {
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  viewCount: number | null;
  publishedAtRelative: string;
  thumbnailUrl: string;
}

export default function CrossChannel() {
  const [tick, setTick] = useState(0);

  const [search, setSearch] = useState('');
  const [filterState, setFilterState] = useState<FilterState>({});
  const [sortField, setSortField] = useState<SortField>('views');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [sessionHidden, setSessionHidden] = useState<Set<string>>(new Set());
  const [showExport, setShowExport] = useState(false);

  const totalRows = useMemo<MergedRow[]>(() => {
    const map = storage.getScrapedVideos();
    const rows: MergedRow[] = Object.values(map)
      .filter((e) => e.platform === 'youtube')
      .map((e) => ({
        videoId: e.videoId,
        channelId: e.channelId,
        channelTitle: e.channelTitle,
        title: e.title,
        viewCount: e.viewCount,
        publishedAtRelative: e.publishedAtRelative,
        thumbnailUrl: e.thumbnailUrl,
      }));
    return rows;
  }, [tick]);

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

  return (
    <div className="space-y-6">
      <ScrapeControl onDone={() => setTick((t) => t + 1)} />

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
