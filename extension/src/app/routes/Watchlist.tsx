import { useEffect, useState } from 'react';
import ChannelCard from '~/app/components/ChannelCard';
import MissingKeyBanner from '~/app/components/MissingKeyBanner';
import { getAdapter } from '~/lib/platforms';
import { storage } from '~/lib/storage';
import type { Channel, PlatformId } from '~/types';

const PLATFORM_OPTIONS: { id: PlatformId; label: string; ready: boolean }[] = [
  { id: 'youtube', label: 'YouTube', ready: true },
  { id: 'tiktok', label: 'TikTok (soon)', ready: false },
  { id: 'instagram', label: 'Instagram (soon)', ready: false },
];

export default function Watchlist() {
  const [list, setList] = useState<Channel[]>([]);
  const [platform, setPlatform] = useState<PlatformId>('youtube');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => setList(storage.getWatchlist()), []);

  async function add() {
    setErr(null);
    if (!input.trim()) return;
    setBusy(true);
    try {
      const channel = await getAdapter(platform).resolveChannel(input.trim());
      await storage.addToWatchlist(channel);
      setList(storage.getWatchlist());
      setInput('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: Channel) {
    await storage.removeFromWatchlist(c.platform, c.channelId);
    setList(storage.getWatchlist());
  }

  return (
    <div className="space-y-6">
      <MissingKeyBanner needs={['youtube']} />
      <section className="koko-card p-6 space-y-4">
        <h2 className="text-lg font-display font-semibold">Add a channel</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as PlatformId)}
            className="koko-input sm:max-w-[10rem]"
          >
            {PLATFORM_OPTIONS.map((p) => (
              <option key={p.id} value={p.id} disabled={!p.ready}>
                {p.label}
              </option>
            ))}
          </select>
          <input
            className="koko-input flex-1"
            placeholder="https://www.youtube.com/@MrBeast or @MrBeast or UC..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          />
          <button onClick={add} disabled={busy} className="koko-btn">
            {busy ? 'adding…' : 'Add'}
          </button>
        </div>
        {err ? <div className="text-sm text-red-600">{err}</div> : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-display font-semibold">Watchlist</h2>
        {list.length === 0 ? (
          <div className="koko-card p-8 text-center text-slate-500">
            no channels yet — add one above
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {list.map((c) => (
              <ChannelCard key={`${c.platform}:${c.channelId}`} channel={c} onRemove={() => remove(c)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
