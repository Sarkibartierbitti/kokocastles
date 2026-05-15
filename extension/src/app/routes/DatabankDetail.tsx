import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { storage } from '~/lib/storage';
import { findById } from '~/lib/databanks';
import ScrapeControl from '~/app/components/ScrapeControl';
import { youtubeAdapter } from '~/lib/platforms/youtube';

export default function DatabankDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const [tick, setTick] = useState(0);
  const db = useMemo(() => findById(storage.getDatabanks(), id), [id, tick]);

  if (!db) {
    return (
      <div className="koko-card p-8 max-w-xl text-center space-y-3">
        <p className="text-sm text-slate-500">Databank not found.</p>
        <Link to="/databanks" className="text-sm text-koko-pink-deep underline">back to list</Link>
      </div>
    );
  }

  const cache = storage.getScrapedVideos();

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-semibold">{db.name}</h1>
          <p className="text-sm text-slate-500">{db.videoRefs.length} video{db.videoRefs.length === 1 ? '' : 's'} in this bank</p>
        </div>
        <Link to="/databanks" className="text-sm text-slate-500 hover:text-slate-700">← all databanks</Link>
      </header>

      <ScrapeControl defaultDatabankId={id} onDone={() => setTick((t) => t + 1)} />

      {db.videoRefs.length === 0 ? (
        <div className="koko-card p-8 text-center text-sm text-slate-500">
          No videos yet. Scrape channels above to populate this bank.
        </div>
      ) : (
        <ul className="koko-card divide-y divide-sky-100">
          {db.videoRefs.map((ref) => {
            const hit = cache[`${ref.platform}::${ref.videoId}`];
            const title = hit?.title || '(no metadata yet — analyze video to populate)';
            const channelTitle = hit?.channelTitle ?? '';
            const viewCount = hit?.viewCount ?? null;
            const publishedAtRelative = hit?.publishedAtRelative ?? '';
            const thumbnailUrl = hit?.thumbnailUrl
              || (ref.platform === 'youtube' ? youtubeAdapter.thumbnail(ref.videoId) : '');
            const watchHref = ref.platform === 'youtube'
              ? `https://www.youtube.com/watch?v=${encodeURIComponent(ref.videoId)}`
              : '#';
            return (
              <li key={`${ref.platform}::${ref.videoId}`} className="py-2 px-3 flex gap-3 items-start text-sm">
                <Link to={`/video/${ref.platform}/${ref.videoId}`} className="shrink-0">
                  <img src={thumbnailUrl} alt="" className="w-28 h-16 object-cover rounded ring-1 ring-sky-200" loading="lazy" />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link to={`/video/${ref.platform}/${ref.videoId}`} className="line-clamp-2 font-medium hover:underline">
                    {title}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {channelTitle ? <>{channelTitle} · </> : null}
                    {viewCount !== null ? <>{viewCount.toLocaleString()} views · </> : null}
                    {publishedAtRelative || 'unknown date'}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <a href={watchHref} target="_blank" rel="noreferrer" className="text-[10px] text-sky-700 hover:underline">open on YT ↗</a>
                  <button
                    className="text-[10px] text-rose-500 hover:text-rose-700"
                    onClick={async () => {
                      await storage.removeFromDatabank(db.id, { platform: ref.platform, videoId: ref.videoId });
                      setTick((t) => t + 1);
                    }}
                  >
                    remove from bank
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
