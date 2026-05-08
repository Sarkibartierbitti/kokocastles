import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { storage } from '~/lib/storage';
import { findById, refKey } from '~/lib/databanks';
import CrossChannel from '~/app/routes/CrossChannel';

export default function DatabankDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const db = useMemo(() => findById(storage.getDatabanks(), id), [id]);

  if (!db) {
    return (
      <div className="koko-card p-8 max-w-xl text-center space-y-3">
        <p className="text-sm text-slate-500">Databank not found.</p>
        <Link to="/databanks" className="text-sm text-koko-pink-deep underline">back to list</Link>
      </div>
    );
  }

  const allowed = new Set(db.videoRefs.map((r) => refKey(r)));
  const videoFilter = (v: { platform: string; videoId: string }) =>
    allowed.has(`${v.platform}::${v.videoId}`);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-semibold">{db.name}</h1>
          <p className="text-sm text-slate-500">{db.videoRefs.length} video{db.videoRefs.length === 1 ? '' : 's'} in this bank</p>
        </div>
        <Link to="/databanks" className="text-sm text-slate-500 hover:text-slate-700">← all databanks</Link>
      </header>
      <CrossChannel videoFilter={videoFilter} />
    </div>
  );
}
