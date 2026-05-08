import { useState } from 'react';
import CrossChannel from '~/app/routes/CrossChannel';
import HooksSubPage from '~/app/routes/HooksSubPage';
import ScriptsSubPage from '~/app/routes/ScriptsSubPage';

type SubPage = 'videos' | 'hooks' | 'scripts';

export default function Analyze() {
  const [sub, setSub] = useState<SubPage>('videos');
  return (
    <div className="space-y-4">
      <div role="tablist" className="inline-flex rounded-full border border-sky-200 bg-white p-1 text-xs">
        {(['videos', 'hooks', 'scripts'] as SubPage[]).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={sub === s}
            onClick={() => setSub(s)}
            className={`px-3 py-1 rounded-full transition ${
              sub === s ? 'bg-koko-pink-deep text-white' : 'text-slate-600 hover:bg-sky-50'
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      {sub === 'videos' ? <CrossChannel /> : null}
      {sub === 'hooks' ? <HooksSubPage /> : null}
      {sub === 'scripts' ? <ScriptsSubPage /> : null}
    </div>
  );
}
