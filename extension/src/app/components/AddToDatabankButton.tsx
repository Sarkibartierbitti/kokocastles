import { useState } from 'react';
import DatabankPicker from './DatabankPicker';
import type { PlatformId } from '~/types';

interface Props {
  videoRef: { platform: PlatformId; videoId: string };
}

export default function AddToDatabankButton({ videoRef }: Props) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs px-2 py-1 rounded-full bg-koko-sky/40 hover:bg-koko-sky/70 text-slate-700"
        title="Add to databank"
      >
        {done ? '✓ saved' : '+ databank'}
      </button>
      <DatabankPicker
        open={open}
        videoRef={videoRef}
        onClose={() => setOpen(false)}
        onPicked={() => { setDone(true); setTimeout(() => setDone(false), 1500); }}
      />
    </>
  );
}
