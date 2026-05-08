import type { FilterState, SortField, SortDir } from '~/lib/feedFilter';

interface Props {
  total: number;
  shown: number;
  search: string;
  onSearch: (q: string) => void;
  filter: FilterState;
  onFilter: (f: FilterState) => void;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField, dir: SortDir) => void;
  onExport: () => void;
}

export default function VideoToolbar(p: Props) {
  return (
    <div className="koko-card p-3 flex flex-wrap items-center gap-2 text-xs">
      <input
        type="search"
        placeholder="search title or channel"
        value={p.search}
        onChange={(e) => p.onSearch(e.target.value)}
        className="rounded-lg border border-sky-200 px-2 py-1 text-xs w-44"
        aria-label="search videos"
      />
      <input
        type="number"
        placeholder="min views"
        value={p.filter.minViews ?? ''}
        onChange={(e) => p.onFilter({ ...p.filter, minViews: e.target.value ? Number(e.target.value) : undefined })}
        className="rounded-lg border border-sky-200 px-2 py-1 text-xs w-24"
        aria-label="min views"
      />
      <input
        type="number"
        placeholder="min likes"
        value={p.filter.minLikes ?? ''}
        onChange={(e) => p.onFilter({ ...p.filter, minLikes: e.target.value ? Number(e.target.value) : undefined })}
        className="rounded-lg border border-sky-200 px-2 py-1 text-xs w-24"
        aria-label="min likes"
      />
      <input
        type="number"
        step="0.1"
        placeholder="min outlier"
        value={p.filter.minOutlier ?? ''}
        onChange={(e) => p.onFilter({ ...p.filter, minOutlier: e.target.value ? Number(e.target.value) : undefined })}
        className="rounded-lg border border-sky-200 px-2 py-1 text-xs w-28"
        aria-label="min outlier"
      />
      <input
        type="date"
        value={p.filter.fromDate ?? ''}
        onChange={(e) => p.onFilter({ ...p.filter, fromDate: e.target.value || undefined })}
        className="rounded-lg border border-sky-200 px-2 py-1 text-xs"
        aria-label="from date"
      />
      <select
        value={`${p.sortField}:${p.sortDir}`}
        onChange={(e) => {
          const [f, d] = e.target.value.split(':') as [SortField, SortDir];
          p.onSort(f, d);
        }}
        className="rounded-lg border border-sky-200 px-2 py-1 text-xs"
        aria-label="sort by"
      >
        <option value="views:desc">views ↓</option>
        <option value="views:asc">views ↑</option>
        <option value="likes:desc">likes ↓</option>
        <option value="outlier:desc">outlier ↓</option>
        <option value="date:desc">date ↓</option>
        <option value="date:asc">date ↑</option>
      </select>
      <button
        type="button"
        onClick={p.onExport}
        className="rounded-lg bg-koko-sky/40 hover:bg-koko-sky/70 text-slate-700 px-3 py-1"
      >
        export…
      </button>
      <span className="ml-auto text-slate-500">
        Showing {p.shown} of {p.total}
      </span>
    </div>
  );
}
