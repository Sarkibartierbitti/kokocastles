import type { HookEntry } from '~/lib/aggregators';
import { platformVideoUrl } from '~/lib/export';

export default function HookCard({ entry }: { entry: HookEntry }) {
  const url = platformVideoUrl(entry.platform, entry.videoId);
  return (
    <article className="koko-card p-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-wide text-slate-400">visual hook</div>
        <div className="text-sm text-slate-700 italic">{entry.visualFormat || '—'}</div>
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-koko-pink-deep underline">
          watch ↗
        </a>
      </div>
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-wide text-slate-400">written hook</div>
        <div className="text-sm">{entry.spoken || entry.onScreen || '—'}</div>
        {entry.onScreen && entry.spoken && entry.onScreen !== entry.spoken ? (
          <div className="text-xs text-slate-500">on-screen: {entry.onScreen}</div>
        ) : null}
        <div className="text-[10px] uppercase tracking-wide text-slate-400 mt-1">type</div>
        <div className="text-xs">{entry.hookType}</div>
      </div>
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-wide text-slate-400">audio hook (0–5s)</div>
        <div className="text-sm text-slate-700">{entry.audioHook || <span className="text-slate-400 italic">no transcript</span>}</div>
      </div>
    </article>
  );
}
