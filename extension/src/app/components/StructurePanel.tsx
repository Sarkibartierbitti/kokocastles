import type { DeepAnalysis } from '~/types';

export default function StructurePanel({ analysis, speculative }: { analysis: DeepAnalysis; speculative?: boolean }) {
  return (
    <div className="koko-card p-5 space-y-4">
      {speculative ? (
        <div className="mb-3 px-3 py-2 rounded-lg bg-amber-100 text-amber-900 text-xs ring-1 ring-amber-200">
          ⚠ Thumbnail-only analysis — no transcript available. Verbal hook + content fields
          are inferred from the thumbnail and may not match the actual video.
        </div>
      ) : null}
      <div>
        <h3 className="font-display font-semibold mb-3">Structure</h3>
        <ol className="space-y-2">
          {analysis.structure.map((b, i) => (
            <li key={i} className="grid grid-cols-[4rem_6rem_1fr] gap-3 text-sm">
              <span className="font-mono text-slate-500">{b.tStart.toFixed(1)}s</span>
              <span className="koko-badge bg-koko-sky text-slate-800">{b.label}</span>
              <span>{b.beat}</span>
            </li>
          ))}
        </ol>
      </div>
      <div>
        <h4 className="text-sm font-semibold text-slate-700 mb-1">Pacing</h4>
        <p className="text-sm">avg cut <strong>{analysis.pacing.avgCutSec.toFixed(1)}s</strong> · {analysis.pacing.rhythm}</p>
      </div>
      <div>
        <h4 className="text-sm font-semibold text-slate-700 mb-1">Techniques</h4>
        <ul className="flex flex-wrap gap-2">
          {analysis.techniques.map((t, i) => (
            <li key={i} className="koko-badge bg-koko-pink text-slate-800">{t}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
