import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { storage } from '~/lib/storage';
import type { Databank } from '~/types';
import { validateName } from '~/lib/databanks';

export default function DatabanksList() {
  const [list, setList] = useState<Databank[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    setList(storage.getDatabanks());
  }

  useEffect(() => { refresh(); }, []);

  async function create() {
    const err = validateName(name);
    if (err) { setError(err); return; }
    await storage.createDatabank(name);
    setCreating(false);
    setName('');
    setError(null);
    refresh();
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this databank? Videos in it are not deleted, only the bank itself.')) return;
    await storage.deleteDatabank(id);
    refresh();
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-semibold">Databanks</h1>
          <p className="text-sm text-slate-500">Saved video collections. Click to view; add videos from any feed.</p>
        </div>
        <button onClick={() => setCreating(true)} className="koko-btn">create databank</button>
      </header>

      {creating ? (
        <section className="koko-card p-4 space-y-2">
          <label htmlFor="dbn-list" className="text-xs text-slate-600 block">Name</label>
          <input
            id="dbn-list"
            autoFocus
            value={name}
            onChange={(e) => { setName(e.target.value); setError(null); }}
            className="w-full rounded-lg border border-sky-200 px-3 py-2 text-sm"
          />
          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
          <div className="flex gap-2">
            <button onClick={create} className="koko-btn">Create</button>
            <button onClick={() => { setCreating(false); setName(''); setError(null); }} className="text-sm text-slate-500 px-3">Cancel</button>
          </div>
        </section>
      ) : null}

      {list.length === 0 ? (
        <div className="koko-card p-8 text-center text-sm text-slate-500">
          No databanks yet. Create one above to start saving videos.
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((db) => (
            <li key={db.id} className="koko-card p-4 flex items-center justify-between">
              <Link to={`/databanks/${db.id}`} className="flex-1">
                <div className="font-medium">{db.name}</div>
                <div className="text-xs text-slate-500">{db.videoRefs.length} video{db.videoRefs.length === 1 ? '' : 's'}</div>
              </Link>
              <button
                onClick={() => remove(db.id)}
                aria-label={`delete ${db.name}`}
                className="text-xs text-rose-500 hover:text-rose-700 px-2"
              >
                delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
