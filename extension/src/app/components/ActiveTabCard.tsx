import { useEffect, useState } from 'react';
import { getActiveTab, scrapeActiveTab, subscribeActiveTab } from '~/lib/active-tab-bridge';
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
        <div className="text-xs text-slate-600">
          ✓ added <strong>{result.channelTitle}</strong> · {result.videos.length} uploads scraped
        </div>
      ) : null}
      {result?.kind === 'search' ? (
        <div className="text-xs text-slate-600">
          ✓ scraped {result.results.length} results for "{result.query}"
        </div>
      ) : null}
    </section>
  );
}
