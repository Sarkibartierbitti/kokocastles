import type { DeepAnalysis } from '../types';

export default function HookPanel({ hook }: { hook: DeepAnalysis['hook'] }) {
  const rows = [
    ['Type', hook.type],
    ['Spoken', hook.spoken],
    ['On-screen', hook.onScreen],
    ['Visual format', hook.visualFormat],
  ] as const;
  return (
    <div className="koko-card p-5">
      <h3 className="font-display font-semibold mb-3">Hook</h3>
      <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-slate-500">{k}</dt>
            <dd className="text-slate-800">{v || '—'}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
