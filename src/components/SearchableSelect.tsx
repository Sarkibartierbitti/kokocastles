// src/components/SearchableSelect.tsx
import { useEffect, useMemo, useRef, useState } from 'react';

export interface Option {
  value: string;
  label: string;
  /** Optional secondary line shown beneath label. */
  hint?: string;
}

export interface SearchableSelectProps {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  /** Optional empty-state label, e.g. '— tier default —'. Selecting it sends ''. */
  emptyLabel?: string;
  className?: string;
  disabled?: boolean;
}

export default function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = 'select…',
  emptyLabel,
  className = '',
  disabled = false,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
    );
  }, [options, query]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else setQuery('');
  }, [open]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className="koko-input w-full text-left flex items-center justify-between"
      >
        <span className={selected ? '' : 'text-slate-400'}>
          {selected ? selected.label : emptyLabel ?? placeholder}
        </span>
        <span className="text-slate-400 ml-2">▾</span>
      </button>
      {open ? (
        <div className="absolute z-10 mt-1 w-full max-h-64 overflow-auto rounded-xl bg-white shadow-lg ring-1 ring-sky-200">
          <div className="p-2 sticky top-0 bg-white">
            <input
              ref={inputRef}
              role="searchbox"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search…"
              className="koko-input w-full"
            />
          </div>
          <ul role="listbox" className="py-1">
            {emptyLabel ? (
              <li>
                <button
                  type="button"
                  onClick={() => pick('')}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-koko-pink/30"
                >
                  {emptyLabel}
                </button>
              </li>
            ) : null}
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-400">no matches</li>
            ) : (
              filtered.map((o) => (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => pick(o.value)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-koko-pink/30 ${
                      o.value === value ? 'bg-koko-sky/40' : ''
                    }`}
                  >
                    <div>{o.label}</div>
                    {o.hint ? <div className="text-xs text-slate-500">{o.hint}</div> : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
