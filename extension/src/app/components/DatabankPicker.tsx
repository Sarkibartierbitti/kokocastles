import { useEffect, useState } from 'react';
import { storage } from '~/lib/storage';
import type { Databank, PlatformId } from '~/types';
import { validateName } from '~/lib/databanks';

interface Props {
  open: boolean;
  videoRef: { platform: PlatformId; videoId: string };
  onClose: () => void;
  onPicked: (databankId: string) => void;
}

export default function DatabankPicker({ open, videoRef, onClose, onPicked }: Props) {
  const [list, setList] = useState<Databank[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setList(storage.getDatabanks());
    setCreating(false);
    setName('');
    setError(null);
  }, [open]);

  if (!open) return null;

  async function pickExisting(id: string) {
    await storage.addToDatabank(id, videoRef);
    onPicked(id);
    onClose();
  }

  async function createAndPick() {
    const err = validateName(name);
    if (err) { setError(err); return; }
    const db = await storage.createDatabank(name);
    await storage.addToDatabank(db.id, videoRef);
    onPicked(db.id);
    onClose();
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="koko-card p-6 w-full max-w-md space-y-3">
        <header className="flex items-center justify-between">
          <h3 className="font-display font-semibold">Add to databank</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">×</button>
        </header>

        {!creating ? (
          <>
            {list.length === 0 ? (
              <p className="text-xs text-slate-500">No databanks yet. Create one.</p>
            ) : (
              <ul className="space-y-1 max-h-60 overflow-y-auto">
                {list.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => pickExisting(d.id)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-koko-sky/30 text-sm"
                    >
                      <strong>{d.name}</strong>
                      <span className="text-xs text-slate-400 ml-2">{d.videoRefs.length} videos</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="koko-btn w-full"
            >
              + new databank
            </button>
          </>
        ) : (
          <div className="space-y-2">
            <label htmlFor="dbn" className="text-xs text-slate-600 block">Name</label>
            <input
              id="dbn"
              autoFocus
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              className="w-full rounded-lg border border-sky-200 px-3 py-2 text-sm"
            />
            {error ? <p className="text-xs text-rose-600">{error}</p> : null}
            <div className="flex gap-2">
              <button onClick={createAndPick} className="koko-btn">Create</button>
              <button onClick={() => setCreating(false)} className="text-sm text-slate-500 px-3">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
