import { useEffect, useState } from 'react';
import { storage } from '~/lib/storage';
import type { Channel } from '~/types';

interface Props {
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  max?: number;
}

export default function ChannelMultiPicker({ selected, onChange, max = 5 }: Props) {
  const [channels, setChannels] = useState<Channel[]>([]);

  useEffect(() => {
    setChannels(storage.getWatchlist().filter((c) => c.platform === 'youtube'));
  }, []);

  function toggle(channelId: string) {
    const next = new Set(selected);
    if (next.has(channelId)) {
      next.delete(channelId);
    } else {
      if (next.size >= max) return;
      next.add(channelId);
    }
    onChange(next);
  }

  if (channels.length === 0) {
    return <div className="text-sm text-slate-500">No YouTube channels in watchlist yet.</div>;
  }

  return (
    <div className="space-y-1 max-h-64 overflow-auto">
      <div className="text-xs text-slate-500 mb-1">
        pick up to {max} ({selected.size} selected)
      </div>
      {channels.map((c) => {
        const checked = selected.has(c.channelId);
        const disabled = !checked && selected.size >= max;
        return (
          <label
            key={c.channelId}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm ${
              disabled ? 'opacity-50' : 'cursor-pointer hover:bg-koko-pink/30'
            } ${checked ? 'bg-koko-sky/40' : ''}`}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={() => toggle(c.channelId)}
            />
            <span className="truncate">{c.title}</span>
          </label>
        );
      })}
    </div>
  );
}
