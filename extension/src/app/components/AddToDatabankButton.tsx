import { useState } from 'react';
import DatabankPicker from './DatabankPicker';
import { storage } from '~/lib/storage';
import type { PlatformId, ScrapedVideoCacheEntry } from '~/types';

interface Props {
  videoRef: { platform: PlatformId; videoId: string };
  metadata?: Omit<ScrapedVideoCacheEntry, 'platform' | 'videoId' | 'fetchedAt'>;
}

export default function AddToDatabankButton({ videoRef, metadata }: Props) {
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
        onPicked={async () => {
          if (metadata && !storage.getScrapedVideo(videoRef.platform, videoRef.videoId)) {
            await storage.setScrapedVideos([{
              platform: videoRef.platform,
              videoId: videoRef.videoId,
              fetchedAt: new Date().toISOString(),
              ...metadata,
            }]);
          }
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }}
      />
    </>
  );
}
