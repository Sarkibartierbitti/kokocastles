import { useEffect, useState } from 'react';
import type { Hypothesis, Video } from '~/types';

interface Props {
  ownVideos: Video[];
  initial?: Hypothesis;
  onClose(): void;
  onSave(h: Hypothesis): Promise<void> | void;
}

export default function HypothesisModal({ ownVideos, initial, onClose, onSave }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [applyToNext, setApplyToNext] = useState<number>(initial?.applyToNext ?? 0);
  const [tickedIds, setTickedIds] = useState<string[]>(initial?.manualVideoIds ?? []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!initial) return;
    setName(initial.name);
    setDescription(initial.description);
    setApplyToNext(initial.applyToNext);
    setTickedIds(initial.manualVideoIds);
  }, [initial]);

  const canSave = name.trim().length > 0 && !saving;

  function toggle(id: string) {
    setTickedIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const h: Hypothesis = {
        id: initial?.id ?? crypto.randomUUID(),
        name: name.trim(),
        description,
        manualVideoIds: tickedIds,
        applyToNext: Math.max(0, Math.min(20, Math.floor(applyToNext || 0))),
        appliedAuto: initial?.appliedAuto ?? [],
        seedSnapshotIds: initial?.seedSnapshotIds ?? ownVideos.map((v) => v.videoId),
        createdAt: initial?.createdAt ?? new Date().toISOString(),
      };
      await onSave(h);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg space-y-3 rounded-2xl bg-white p-5 shadow-lg">
        <header>
          <h2 className="text-lg font-display font-semibold">{initial ? 'Edit hypothesis' : 'New hypothesis'}</h2>
        </header>

        <label className="block text-xs font-medium text-slate-600">
          Name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded border border-sky-200 px-2 py-1 text-sm"
            required
          />
        </label>

        <label className="block text-xs font-medium text-slate-600">
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 min-h-16 w-full rounded border border-sky-200 px-2 py-1 text-sm"
          />
        </label>

        <label className="block text-xs font-medium text-slate-600">
          Apply to next N uploads (0–20)
          <input
            type="number"
            min={0}
            max={20}
            value={applyToNext}
            onChange={(e) => setApplyToNext(Number(e.target.value))}
            className="mt-1 w-24 rounded border border-sky-200 px-2 py-1 text-sm"
          />
        </label>

        <fieldset className="max-h-48 overflow-y-auto rounded border border-sky-100 p-2">
          <legend className="text-xs font-medium text-slate-600">Tick existing videos</legend>
          {ownVideos.length === 0 ? (
            <p className="text-xs text-slate-400">No own-channel videos yet. Refresh first.</p>
          ) : (
            <ul className="space-y-1">
              {ownVideos.map((v) => (
                <li key={v.videoId} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    id={`hyp-tick-${v.videoId}`}
                    checked={tickedIds.includes(v.videoId)}
                    onChange={() => toggle(v.videoId)}
                  />
                  <label htmlFor={`hyp-tick-${v.videoId}`} className="truncate">
                    {v.title}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        <footer className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-sky-200 px-3 py-1 text-sm hover:bg-sky-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="rounded bg-koko-pink-deep px-3 py-1 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 hover:bg-pink-500"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  );
}
