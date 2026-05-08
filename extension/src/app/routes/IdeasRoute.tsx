import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { storage } from '~/lib/storage';
import type { Idea } from '~/types';

type Bucket = 'inbox' | 'shortlist';

export default function IdeasRoute() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [bucket, setBucket] = useState<Bucket>('inbox');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function refresh() {
    setIdeas(storage.getIdeas());
  }

  useEffect(() => { refresh(); }, []);

  async function generate() {
    setBusy(true);
    setErr(null);
    try {
      const { generateIdeas } = await import('~/lib/llm/tasks');
      const deeps = storage.getAllDeepEntries();
      const persona = storage.getPersona();
      const fresh = await generateIdeas({ deepEntries: deeps, persona });
      await storage.addIdeas(fresh);
      refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function move(id: string, to: Bucket) {
    await storage.moveIdeaBucket(id, to);
    refresh();
  }

  async function remove(id: string) {
    await storage.deleteIdea(id);
    refresh();
  }

  const visible = ideas
    .filter((i) => i.bucket === bucket)
    .filter((i) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return i.title.toLowerCase().includes(q) || i.rationale.toLowerCase().includes(q);
    })
    .sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-4 max-w-3xl">
      <header>
        <h1 className="text-xl font-display font-semibold">Ideas</h1>
        <p className="text-sm text-slate-500">Review ideas generated from your analyzed videos.</p>
      </header>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div role="tablist" className="inline-flex rounded-full border border-sky-200 bg-white p-1">
          {(['inbox', 'shortlist'] as Bucket[]).map((b) => (
            <button
              key={b}
              role="tab"
              aria-selected={bucket === b}
              onClick={() => setBucket(b)}
              className={`px-3 py-1 rounded-full ${bucket === b ? 'bg-koko-pink-deep text-white' : 'text-slate-600 hover:bg-sky-50'}`}
            >
              {b}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="search ideas"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-sky-200 px-2 py-1 w-48"
          aria-label="search ideas"
        />
        <button onClick={generate} disabled={busy} className="koko-btn ml-auto">
          {busy ? 'generating…' : 'generate from feed'}
        </button>
      </div>

      {err ? <div className="text-sm text-rose-700">{err}</div> : null}

      {visible.length === 0 ? (
        <div className="koko-card p-8 max-w-xl mx-auto text-center text-sm text-slate-500 space-y-2">
          <p>You haven't saved any ideas yet! Pick videos from your feed to analyze.</p>
          <Link to="/" className="text-koko-pink-deep underline">Explore feed</Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((i) => (
            <li key={i.id} className="koko-card p-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{i.title}</div>
                <p className="text-xs text-slate-500 mt-0.5">{i.rationale}</p>
                <div className="text-[10px] text-slate-400 mt-1">score {i.score.toFixed(2)} · {i.sourceRefs.length} source{i.sourceRefs.length === 1 ? '' : 's'}</div>
              </div>
              <div className="flex flex-col gap-1 text-xs shrink-0">
                {bucket === 'inbox' ? (
                  <button onClick={() => move(i.id, 'shortlist')} className="text-koko-pink-deep" aria-label={`shortlist ${i.title}`}>
                    → shortlist
                  </button>
                ) : (
                  <button onClick={() => move(i.id, 'inbox')} className="text-slate-500" aria-label={`back to inbox ${i.title}`}>
                    → inbox
                  </button>
                )}
                <button onClick={() => remove(i.id)} className="text-rose-500" aria-label={`delete ${i.title}`}>
                  delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
