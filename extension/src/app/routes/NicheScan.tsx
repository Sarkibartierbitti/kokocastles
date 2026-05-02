import { useState } from 'react';
import { scrapeSearchQuery, uniqueChannelsFromSearch } from '~/lib/niche-bridge';
import { storage } from '~/lib/storage';
import type { ScrapedSearchResult } from '~/lib/messaging';
import type { Channel } from '~/types';

export default function NicheScan() {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
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
    try {
      const r = await scrapeSearchQuery(query.trim());
      setResults(r.results);
      setChannels(uniqueChannelsFromSearch(r.results));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
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
            {busy ? 'scanning…' : 'Scan'}
          </button>
        </div>
        {err ? <div className="text-sm text-rose-700">{err}</div> : null}
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
              <li key={c.channelId} className="flex items-center justify-between py-2 text-sm">
                <div className="truncate">{c.channelTitle}</div>
                {added.has(c.channelId) ? (
                  <span className="text-xs text-koko-pink-deep">✓ added</span>
                ) : (
                  <button
                    onClick={() => addChannel(c)}
                    className="koko-btn-ghost text-xs"
                  >
                    add
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
            {results.slice(0, 20).map((r) => (
              <li key={r.videoId} className="py-2 text-sm flex items-start gap-3">
                <img src={r.thumbnailUrl} alt="" className="w-24 h-14 object-cover rounded ring-1 ring-sky-200 shrink-0" loading="lazy" />
                <div className="min-w-0">
                  <div className="line-clamp-2 font-medium">{r.title}</div>
                  <div className="text-xs text-slate-500">{r.channelTitle || '—'}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
