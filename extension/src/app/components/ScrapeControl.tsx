import { useMemo, useRef, useState } from 'react';
import { batchScrapeChannels } from '~/lib/niche-bridge';
import { storage } from '~/lib/storage';
import ChannelMultiPicker from './ChannelMultiPicker';

interface Props {
  defaultDatabankId?: string;
  onDone?: (summary: { okCount: number; total: number; videoCount: number }) => void;
}

export default function ScrapeControl({ defaultDatabankId, onDone }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [latestN, setLatestN] = useState(30);
  const banks = useMemo(() => storage.getDatabanks(), []);
  const [targetBank, setTargetBank] = useState<string>(defaultDatabankId ?? 'none');
  const [newBankName, setNewBankName] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [err, setErr] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ okCount: number; total: number; videoCount: number } | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  async function run() {
    if (selected.size === 0) return;
    setBusy(true);
    setErr(null);
    setSummary(null);
    setProgress({ done: 0, total: selected.size });
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    try {
      let databankId: string | undefined;
      if (targetBank === '__new__') {
        const name = newBankName.trim();
        if (!name) throw new Error('Enter a databank name or pick an existing one.');
        const bank = await storage.createDatabank(name);
        databankId = bank.id;
      } else if (targetBank !== 'none') {
        databankId = targetBank;
      }
      const n = Math.max(1, Math.min(30, latestN));
      const results = await batchScrapeChannels(Array.from(selected), {
        latestN: n,
        databankId,
        concurrency: 2,
        jitterMs: 2500,
        signal: ctrl.signal,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      const okCount = results.filter((r) => r.ok).length;
      const videoCount = results.reduce((acc, r) => acc + (r.ok ? r.value.videos.length : 0), 0);
      const s = { okCount, total: results.length, videoCount };
      setSummary(s);
      onDone?.(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      ctrlRef.current = null;
    }
  }

  function abort() { ctrlRef.current?.abort(); }

  return (
    <section className="koko-card p-4 space-y-3">
      <h3 className="text-sm font-display font-semibold">Scrape channels</h3>
      <ChannelMultiPicker selected={selected} onChange={setSelected} max={5} />
      <div className="flex flex-wrap items-end gap-3 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-slate-600">Latest N videos (1–30)</span>
          <input
            type="number"
            min={1}
            max={30}
            value={latestN}
            onChange={(e) => setLatestN(Math.max(1, Math.min(30, Number(e.target.value) || 30)))}
            className="w-20 px-2 py-1 rounded border border-sky-200"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-slate-600">Save to databank</span>
          <select
            value={targetBank}
            onChange={(e) => setTargetBank(e.target.value)}
            className="px-2 py-1 rounded border border-sky-200"
          >
            <option value="none">— none —</option>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
            <option value="__new__">+ create new…</option>
          </select>
        </label>
        {targetBank === '__new__' ? (
          <label className="flex flex-col gap-1">
            <span className="text-slate-600">New databank name</span>
            <input
              type="text"
              maxLength={80}
              value={newBankName}
              onChange={(e) => setNewBankName(e.target.value)}
              className="px-2 py-1 rounded border border-sky-200"
            />
          </label>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <button onClick={run} disabled={busy || selected.size === 0} className="koko-btn">
          {busy ? `scraping ${progress.done}/${progress.total}…` : `Scrape ${selected.size} channel${selected.size === 1 ? '' : 's'}`}
        </button>
        {busy ? <button onClick={abort} className="koko-btn-ghost text-sm">cancel</button> : null}
      </div>
      {err ? <div className="text-xs text-rose-700">{err}</div> : null}
      {summary ? (
        <div className="text-xs text-slate-600">
          <strong>Scrape complete:</strong> {summary.okCount}/{summary.total} channels succeeded; {summary.videoCount} videos total
        </div>
      ) : null}
    </section>
  );
}
