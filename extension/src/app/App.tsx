import { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import Sidebar from '~/app/components/Sidebar';
import Watchlist from '~/app/routes/Watchlist';
import Settings from '~/app/routes/Settings';
import Help from '~/app/routes/Help';
import Channel from '~/app/routes/Channel';
import VideoAnalysis from '~/app/routes/VideoAnalysis';
import NicheScan from '~/app/routes/NicheScan';
import CrossChannel from '~/app/routes/CrossChannel';
import ActivityPanel from '~/app/components/ActivityPanel';
import { storage } from '~/lib/storage';
import { activity } from '~/lib/activity';

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([storage.hydrate(), activity.hydrate()]).then(() => setReady(true));
  }, []);

  if (!ready) {
    return <div className="p-6 text-sm text-slate-500">loading…</div>;
  }

  return (
    <div className="min-h-screen text-slate-900 pb-12">
      <Sidebar />
      <main className="p-4">
        <Routes>
          <Route path="/" element={<Watchlist />} />
          <Route path="/channel/:platform/:channelId" element={<Channel />} />
          <Route path="/video/:platform/:videoId" element={<VideoAnalysis />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/help" element={<Help />} />
          <Route path="/niche" element={<NicheScan />} />
          <Route path="/compare" element={<CrossChannel />} />
        </Routes>
      </main>
      <ActivityPanel />
    </div>
  );
}
