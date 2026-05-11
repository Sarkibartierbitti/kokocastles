import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getActiveTab, scrapeActiveTab, subscribeActiveTab } from '~/lib/active-tab-bridge';
import { uniqueChannelsFromSearch } from '~/lib/niche-bridge';
import type { ActiveTabInfo, ScrapeResult } from '~/lib/messaging';
import { storage } from '~/lib/storage';
import type { Channel } from '~/types';

interface Props {
  onResult?: (r: ScrapeResult) => void;
}

export default function ActiveTabCard({ onResult }: Props) {
  const [info, setInfo] = useState<ActiveTabInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<ScrapeResult | null>(null);

  useEffect(() => {
    void getActiveTab().then(setInfo);
    return subscribeActiveTab(setInfo);
  }, []);

  if (!info || (info.kind !== 'channel' && info.kind !== 'search')) return null;

  async function importTab() {
    setBusy(true);
    setErr(null);
    try {
      const r = await scrapeActiveTab();
      setResult(r);
      if (r.kind === 'channel') {
        const channel: Channel = {
          platform: 'youtube',
          channelId: r.channelId,
          title: r.channelTitle,
        };
        await storage.addToWatchlist(channel);
      }
      onResult?.(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const label =
    info.kind === 'channel'
      ? `Channel: ${info.title || info.identifier}`
      : `Search: "${info.identifier}"`;
  const action =
    info.kind === 'channel' ? 'Add to watchlist (scrape uploads)' : 'Scrape search results';

  return (
    <section className="koko-card p-4 space-y-2">
      <div className="text-xs text-slate-500">active tab</div>
      <div className="text-sm font-medium truncate">{label}</div>
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={importTab} disabled={busy} className="koko-btn text-sm">
          {busy ? 'scraping…' : action}
        </button>
        {err ? <span className="text-xs text-rose-700">{err}</span> : null}
      </div>
      {result?.kind === 'channel' ? (
        <div className="space-y-2">
          <div className="text-xs text-slate-600">
            ✓ added{' '}
            <Link
              to={`/channel/youtube/${result.channelId}`}
              className="font-semibold text-koko-pink-deep hover:underline"
            >
              {result.channelTitle}
            </Link>{' '}
            · {result.videos.length} uploads scraped (click to view)
          </div>
        </div>
      ) : null}
      {result?.kind === 'search' ? <SearchResultsInline result={result} /> : null}
    </section>
  );
}

function SearchResultsInline({ result }: { result: Extract<ScrapeResult, { kind: 'search' }> }) {
  const channels = uniqueChannelsFromSearch(result.results);
  const [added, setAdded] = useState<Set<string>>(new Set());

  async function addChannel(c: { channelId: string; channelTitle: string }) {
    const ch: Channel = { platform: 'youtube', channelId: c.channelId, title: c.channelTitle };
    await storage.addToWatchlist(ch);
    setAdded((prev) => new Set(prev).add(c.channelId));
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-600">
        ✓ scraped {result.results.length} results for "{result.query}"
      </div>
      {channels.length > 0 ? (
        <div className="space-y-1">
          <div className="text-xs font-medium text-slate-700">
            Discovered channels ({channels.length})
          </div>
          <ul className="divide-y divide-sky-100 max-h-64 overflow-y-auto">
            {channels.map((c) => (
              <li key={c.channelId} className="flex items-center gap-2 py-1 text-xs">
                <Link
                  to={`/channel/youtube/${c.channelId}`}
                  className="truncate flex-1 hover:text-koko-pink-deep hover:underline"
                >
                  {c.channelTitle}
                </Link>
                {added.has(c.channelId) ? (
                  <span className="text-koko-pink-deep shrink-0">✓</span>
                ) : (
                  <button
                    onClick={() => addChannel(c)}
                    className="koko-btn-ghost text-[10px] shrink-0"
                  >
                    + watchlist
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
