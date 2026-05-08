import { useMemo } from 'react';
import { storage } from '~/lib/storage';
import { aggregateScripts } from '~/lib/aggregators';
import ScriptCard from '~/app/components/ScriptCard';

export default function ScriptsSubPage() {
  const scripts = useMemo(() => aggregateScripts(storage.getAllTranscriptEntries()), []);

  if (scripts.length === 0) {
    return (
      <div className="koko-card p-8 max-w-xl mx-auto text-center text-sm text-slate-500">
        No scripts yet. Transcripts populate as you analyze videos with captions enabled.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <header>
        <p className="text-xs text-slate-500">{scripts.length} script{scripts.length === 1 ? '' : 's'} from analyzed videos</p>
      </header>
      <div className="space-y-2">
        {scripts.map((s) => (
          <ScriptCard key={`${s.platform}::${s.videoId}`} entry={s} />
        ))}
      </div>
    </div>
  );
}
