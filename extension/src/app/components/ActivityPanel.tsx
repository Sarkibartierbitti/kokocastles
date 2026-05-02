import { useEffect, useState } from 'react';
import { activity, type ActivityEntry } from '~/lib/activity';

export default function ActivityPanel() {
  const [entries, setEntries] = useState<ActivityEntry[]>(activity.list());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const unsub = activity.subscribe(() => setEntries(activity.list()));
    return () => unsub();
  }, []);

  const inFlight = entries.filter((e) => e.status === 'in-flight').length;
  const totalCost = entries.reduce((acc, e) => acc + (e.costUsd ?? 0), 0);
  const hasError = entries.some((e) => e.status === 'error');

  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-sky-200 bg-white/90 backdrop-blur shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-3 py-2 text-xs flex items-center justify-between"
      >
        <span className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${
            inFlight > 0 ? 'bg-sky-500 animate-pulse' : hasError ? 'bg-rose-500' : 'bg-slate-300'
          }`} />
          activity {inFlight > 0 ? `· ${inFlight} in flight` : `· ${entries.length}`}
          {totalCost > 0 ? <span className="text-slate-500">· ~${totalCost.toFixed(3)}</span> : null}
        </span>
        <span className="text-slate-400">{open ? '▾' : '▸'}</span>
      </button>
      {open ? (
        <div className="max-h-64 overflow-auto px-3 py-2 space-y-1 text-xs">
          {entries.length === 0 ? (
            <div className="text-slate-400 text-center py-2">no LLM calls yet</div>
          ) : (
            [...entries].reverse().map((e) => (
              <div key={e.id} className={`flex items-center gap-2 rounded px-2 py-1 ${
                e.status === 'in-flight' ? 'bg-sky-50' : e.status === 'error' ? 'bg-rose-50' : 'bg-slate-50'
              }`}>
                <span className="font-mono text-slate-500">{e.task}</span>
                <span className="text-slate-700 truncate">{e.provider}/{e.model}</span>
                <span className="ml-auto text-slate-400 shrink-0">
                  {e.status === 'in-flight' && '⋯'}
                  {e.status === 'done' && (e.costUsd != null ? `$${e.costUsd.toFixed(4)}` : 'done')}
                  {e.status === 'error' && <span title={e.error}>✗</span>}
                </span>
              </div>
            ))
          )}
          {entries.length > 0 ? (
            <button
              type="button"
              onClick={() => activity.clear()}
              className="koko-btn-ghost text-xs w-full mt-1"
            >
              clear history
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
