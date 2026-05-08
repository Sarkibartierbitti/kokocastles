import { useState } from 'react';
import { EXPORT_FIELDS, type ExportField } from '~/lib/export';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (fields: ExportField[], format: 'csv' | 'xlsx') => void;
}

export default function ExportFieldPicker({ open, onClose, onConfirm }: Props) {
  const [fields, setFields] = useState<Set<ExportField>>(new Set(EXPORT_FIELDS));
  const [format, setFormat] = useState<'csv' | 'xlsx'>('csv');
  if (!open) return null;
  function toggle(f: ExportField) {
    const n = new Set(fields);
    if (n.has(f)) n.delete(f); else n.add(f);
    setFields(n);
  }
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="koko-card p-6 w-full max-w-md space-y-3">
        <header className="flex items-center justify-between">
          <h3 className="font-display font-semibold">Export fields</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">×</button>
        </header>
        <ul className="space-y-1 max-h-72 overflow-y-auto">
          {EXPORT_FIELDS.map((f) => (
            <li key={f}>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={fields.has(f)} onChange={() => toggle(f)} />
                {f}
              </label>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-600">format</label>
          <select value={format} onChange={(e) => setFormat(e.target.value as 'csv' | 'xlsx')} className="rounded-lg border border-sky-200 px-2 py-1 text-xs">
            <option value="csv">csv</option>
            <option value="xlsx">xlsx</option>
          </select>
          <button
            onClick={() => onConfirm(Array.from(fields), format)}
            className="koko-btn ml-auto"
            disabled={fields.size === 0}
          >
            download
          </button>
        </div>
      </div>
    </div>
  );
}
