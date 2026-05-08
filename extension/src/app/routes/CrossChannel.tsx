import { useMemo, useRef, useState } from 'react';
import ChannelMultiPicker from '~/app/components/ChannelMultiPicker';
import { batchScrapeChannels, type ChannelDigest } from '~/lib/niche-bridge';
import type { BatchResult } from '~/lib/batch-queue';
import type { ScrapedVideo } from '~/lib/messaging';

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

  const merged = useMemo<MergedRow[]>(() => {
    const rows: MergedRow[] = [];
    for (const r of results) {
      if (!r.ok) continue;
      for (const v of r.value.videos) {
        rows.push({
          ...v,
          channelId: r.value.channelId,
          channelTitle: r.value.channelTitle,
        });
      }
    }
    rows.sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0));
    const limited = rows.slice(0, 50);
    return videoFilter
      ? limited.filter((v) => videoFilter({ platform: 'youtube', videoId: v.videoId }))
      : limited;
  }, [results, videoFilter]);

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
      const out = await batchScrapeChannels(ids, {
        concurrency: 2,
        jitterMs: 2500,
        signal: ctrl.signal,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setResults(out);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
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
        {failures.length > 0 && !busy ? (
          <div className="text-xs text-amber-800">
            {failures.length} channel{failures.length === 1 ? '' : 's'} failed:{' '}
            {failures.map((f, i) => (f.ok ? null : <span key={i}>{f.error}{i < failures.length - 1 ? '; ' : ''}</span>))}
          </div>
        ) : null}
      </section>

      {merged.length > 0 ? (
        <section className="koko-card p-4 space-y-2">
          <h3 className="font-display font-semibold">Top {merged.length} videos by views</h3>
          <ul className="divide-y divide-sky-100">
            {merged.map((v) => (
              <li key={`${v.channelId}-${v.videoId}`} className="py-2 flex gap-3 items-start text-sm">
                <img src={v.thumbnailUrl} alt="" className="w-24 h-14 object-cover rounded ring-1 ring-sky-200 shrink-0" loading="lazy" />
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 font-medium">{v.title}</div>
                  <div className="text-xs text-slate-500">
                    {v.channelTitle} · {(v.viewCount ?? 0).toLocaleString()} views · {v.publishedAtRelative || 'unknown date'}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
