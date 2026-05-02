import { useState } from 'react';

interface Props {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export default function KeyInput({ label, hint, value, onChange, placeholder }: Props) {
  const [show, setShow] = useState(false);
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="koko-btn-ghost text-xs"
        >
          {show ? 'hide' : 'show'}
        </button>
      </div>
      <input
        className="koko-input font-mono text-sm"
        type={show ? 'text' : 'password'}
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </label>
  );
}
