import type { DeepAnalysis } from '~/types';

export default function HookPanel({ hook, speculative }: { hook: DeepAnalysis['hook']; speculative?: boolean }) {
  const rows = [
    ['Type', hook.type],
    ['Spoken', hook.spoken],
    ['On-screen', hook.onScreen],
    ['Visual format', hook.visualFormat],
  ] as const;
  return (
    <div className="koko-card p-5">
      <h3 className="font-display font-semibold mb-3">Hook</h3>
      {speculative ? (
        <div className="mb-3 px-3 py-2 rounded-lg bg-amber-100 text-amber-900 text-xs ring-1 ring-amber-200">
          ⚠ Thumbnail-only analysis — no transcript available. Verbal hook + content fields
          are inferred from the thumbnail and may not match the actual video.
        </div>
      ) : null}
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
