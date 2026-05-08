export interface FeedRow {
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  viewCount: number;
  likeCount?: number;
  publishedAt?: string;
  outlierRatio?: number;
}

export type SortField = 'views' | 'likes' | 'outlier' | 'date';
export type SortDir = 'asc' | 'desc';

export interface FilterState {
  minViews?: number;
  minLikes?: number;
  minOutlier?: number;
  fromDate?: string; // ISO
  search?: string;
}

export function searchRows<T extends FeedRow>(rows: T[], q: string): T[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((r) =>
    r.title.toLowerCase().includes(needle) ||
    r.channelTitle.toLowerCase().includes(needle)
  );
}

export function filterRows<T extends FeedRow>(rows: T[], f: FilterState): T[] {
  return rows.filter((r) => {
    if (f.minViews != null && (r.viewCount ?? 0) < f.minViews) return false;
    if (f.minLikes != null && (r.likeCount ?? 0) < f.minLikes) return false;
    if (f.minOutlier != null && (r.outlierRatio ?? 0) < f.minOutlier) return false;
    if (f.fromDate && r.publishedAt && r.publishedAt < f.fromDate) return false;
    return true;
  });
}

export function sortRows<T extends FeedRow>(rows: T[], field: SortField, dir: SortDir): T[] {
  const copy = [...rows];
  const cmp = (a: T, b: T): number => {
    let av: number | string | undefined;
    let bv: number | string | undefined;
    switch (field) {
      case 'views':   av = a.viewCount;     bv = b.viewCount;     break;
      case 'likes':   av = a.likeCount ?? 0; bv = b.likeCount ?? 0; break;
      case 'outlier': av = a.outlierRatio ?? 0; bv = b.outlierRatio ?? 0; break;
      case 'date':    av = a.publishedAt ?? ''; bv = b.publishedAt ?? ''; break;
    }
    const aN = typeof av === 'number' ? av : (av ?? '').toString();
    const bN = typeof bv === 'number' ? bv : (bv ?? '').toString();
    if (aN < bN) return dir === 'asc' ? -1 : 1;
    if (aN > bN) return dir === 'asc' ? 1 : -1;
    return 0;
  };
  copy.sort(cmp);
  return copy;
}

export function applyHidden<T extends FeedRow & { platform?: string }>(
  rows: T[],
  hiddenKeys: Set<string>,
  sessionHidden: Set<string>,
  platformFallback = 'youtube',
): T[] {
  return rows.filter((r) => {
    const k = `${r.platform ?? platformFallback}::${r.videoId}`;
    return !hiddenKeys.has(k) && !sessionHidden.has(k);
  });
}
