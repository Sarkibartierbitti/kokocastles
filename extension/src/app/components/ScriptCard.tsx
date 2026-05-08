import { useState } from 'react';
import type { ScriptEntry } from '~/lib/aggregators';
import { platformVideoUrl } from '~/lib/export';

const PREVIEW_CHARS = 280;

export default function ScriptCard({ entry }: { entry: ScriptEntry }) {
  const [expanded, setExpanded] = useState(false);
  const long = entry.fullText.length > PREVIEW_CHARS;
  const display = !long || expanded ? entry.fullText : entry.fullText.slice(0, PREVIEW_CHARS) + '…';
  const url = platformVideoUrl(entry.platform, entry.videoId);

  return (
    <article className="koko-card p-4 space-y-2">
      <header className="flex items-center justify-between text-xs text-slate-500">
        <span>{entry.platform} · {entry.videoId}</span>
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-koko-pink-deep underline">watch ↗</a>
      </header>
      <p className="text-sm whitespace-pre-wrap leading-relaxed">{display}</p>
      {long ? (
        <button onClick={() => setExpanded((x) => !x)} className="text-xs text-koko-pink-deep">
          {expanded ? 'collapse' : 'expand'}
        </button>
      ) : null}
    </article>
  );
}
