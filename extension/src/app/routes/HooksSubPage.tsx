import { useMemo } from 'react';
import { storage } from '~/lib/storage';
import { aggregateHooks } from '~/lib/aggregators';
import HookCard from '~/app/components/HookCard';

export default function HooksSubPage() {
  const hooks = useMemo(() => {
    const deeps = storage.getAllDeepEntries();
    const transcripts = storage.getAllTranscriptEntries();
    return aggregateHooks(deeps, transcripts);
  }, []);

  if (hooks.length === 0) {
    return (
      <div className="koko-card p-8 max-w-xl mx-auto text-center text-sm text-slate-500">
        No hooks yet. Analyze videos from the Videos sub-page to populate this view.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{hooks.length} hook{hooks.length === 1 ? '' : 's'} from analyzed videos</p>
      </header>
      <div className="space-y-2">
        {hooks.map((h) => (
          <HookCard key={`${h.platform}::${h.videoId}`} entry={h} />
        ))}
      </div>
    </div>
  );
}
