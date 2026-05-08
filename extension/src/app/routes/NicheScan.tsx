import { useState } from 'react';
import { Link } from 'react-router-dom';
import { scrapeSearchQuery, uniqueChannelsFromSearch } from '~/lib/niche-bridge';
import { storage } from '~/lib/storage';
import type { ScrapedSearchResult } from '~/lib/messaging';
import type { Channel } from '~/types';

type Stage = 'idle' | 'opening' | 'loading' | 'scraping' | 'done';

export default function NicheScan() {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<Stage>('idle');
  const [err, setErr] = useState<string | null>(null);
  const [results, setResults] = useState<ScrapedSearchResult[]>([]);
  const [channels, setChannels] = useState<{ channelId: string; channelTitle: string }[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());

  async function scan() {
    if (!query.trim()) return;
    setBusy(true);
    setErr(null);
    setResults([]);
    setChannels([]);
    setAdded(new Set());
    setStage('opening');
    try {
      console.log('[koko nichescan] opening hidden YT tab for query:', query.trim());
      // Stage transitions are coarse — background does the actual work in one go,
      // but the user gets visual feedback so it doesn't look stuck during ~10s scrape.
      setTimeout(() => setStage((s) => (s === 'opening' ? 'loading' : s)), 1500);
      setTimeout(() => setStage((s) => (s === 'loading' ? 'scraping' : s)), 6000);
      const r = await scrapeSearchQuery(query.trim());
      console.log('[koko nichescan] got', r.results.length, 'results,', uniqueChannelsFromSearch(r.results).length, 'unique channels');
      setResults(r.results);
      setChannels(uniqueChannelsFromSearch(r.results));
      setStage('done');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[koko nichescan] scrape failed:', msg);
      setErr(msg);
      setStage('idle');
    } finally {
      setBusy(false);
    }
  }

  async function addChannel(c: { channelId: string; channelTitle: string }) {
    const ch: Channel = { platform: 'youtube', channelId: c.channelId, title: c.channelTitle };
    await storage.addToWatchlist(ch);
    setAdded((prev) => new Set(prev).add(c.channelId));
  }

  async function addAll() {
    for (const c of channels) {
      if (added.has(c.channelId)) continue;
      const ch: Channel = { platform: 'youtube', channelId: c.channelId, title: c.channelTitle };
      await storage.addToWatchlist(ch);
    }
    setAdded(new Set(channels.map((c) => c.channelId)));
  }

  return (
    <div className="space-y-6">
      <section className="koko-card p-6 space-y-3">
        <h2 className="text-lg font-display font-semibold">Scan a niche</h2>
        <p className="text-xs text-slate-600">
          Enter a YouTube search query. Background opens a hidden YouTube tab, scrapes results,
          extracts unique channels. Click any channel to add it to your watchlist.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className="koko-input flex-1"
            placeholder="e.g. orthodox christianity, mr beast challenges, indie game devlog"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') scan(); }}
          />
          <button onClick={scan} disabled={busy || !query.trim()} className="koko-btn">
            {busy
              ? stage === 'opening' ? 'opening tab…'
                : stage === 'loading' ? 'waiting for YT…'
                : stage === 'scraping' ? 'scraping…'
                : 'scanning…'
              : 'Scan'}
          </button>
        </div>
        {err ? (
          <div className="text-sm text-rose-700 space-y-1">
            <div><strong>Scrape failed:</strong> {err}</div>
            <div className="text-xs text-rose-500">
              Common causes: extension was loaded after the YouTube content scripts (reload any open YT tabs);
              YouTube CAPTCHA gate (open www.youtube.com manually first); slow network. Check the browser
              console (sidebar → right-click → Inspect) for the full <code>[koko nichescan]</code> trace.
            </div>
          </div>
        ) : null}
      </section>

      {channels.length > 0 ? (
        <section className="koko-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold">Discovered channels ({channels.length})</h3>
            <button
              onClick={addAll}
              disabled={channels.every((c) => added.has(c.channelId))}
              className="koko-btn-ghost text-sm"
            >
              Add all to watchlist
            </button>
          </div>
          <ul className="divide-y divide-sky-100">
            {channels.map((c) => (
              <li key={c.channelId} className="flex items-center justify-between gap-2 py-2 text-sm">
                <Link
                  to={`/channel/youtube/${c.channelId}`}
                  className="truncate flex-1 hover:text-koko-pink-deep hover:underline"
                  title={`Open ${c.channelTitle} channel page`}
                >
                  {c.channelTitle}
                </Link>
                <a
                  href={`https://www.youtube.com/channel/${c.channelId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-slate-400 hover:text-slate-600"
                  title="open on YouTube"
                >
                  ↗
                </a>
                {added.has(c.channelId) ? (
                  <span className="text-xs text-koko-pink-deep shrink-0">✓ added</span>
                ) : (
                  <button
                    onClick={() => addChannel(c)}
                    className="koko-btn-ghost text-xs shrink-0"
                  >
                    + watchlist
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {results.length > 0 ? (
        <section className="koko-card p-4 space-y-2">
          <h3 className="font-display font-semibold">Top videos in search ({results.length})</h3>
          <ul className="divide-y divide-sky-100">
            {results.slice(0, 20).map((r) => {
              const channelAdded = r.channelId ? added.has(r.channelId) : false;
              return (
                <li key={r.videoId} className="py-2 text-sm flex items-start gap-3">
                  <a
                    href={`https://www.youtube.com/watch?v=${r.videoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0"
                    title="watch video"
                  >
                    <img src={r.thumbnailUrl} alt="" className="w-24 h-14 object-cover rounded ring-1 ring-sky-200" loading="lazy" />
                  </a>
                  <div className="min-w-0 flex-1">
                    <a
                      href={`https://www.youtube.com/watch?v=${r.videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="line-clamp-2 font-medium hover:text-koko-pink-deep"
                    >
                      {r.title}
                    </a>
                    <div className="text-xs text-slate-500">
                      {r.channelId ? (
                        <Link to={`/channel/youtube/${r.channelId}`} className="hover:underline">
                          {r.channelTitle || '—'}
                        </Link>
                      ) : (
                        r.channelTitle || '—'
                      )}
                    </div>
                  </div>
                  {r.channelId ? (
                    channelAdded ? (
                      <span className="text-xs text-koko-pink-deep shrink-0">✓ added</span>
                    ) : (
                      <button
                        onClick={() => r.channelId && addChannel({ channelId: r.channelId, channelTitle: r.channelTitle })}
                        className="koko-btn-ghost text-xs shrink-0"
                        title="add this video's channel to watchlist"
                      >
                        + watchlist
                      </button>
                    )
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
