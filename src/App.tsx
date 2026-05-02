import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import Settings from './routes/Settings';
import Help from './routes/Help';
import Watchlist from './routes/Watchlist';
import Channel from './routes/Channel';
import VideoAnalysis from './routes/VideoAnalysis';

export default function App() {
  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-10 backdrop-blur bg-white/60 border-b border-sky-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <NavLink to="/" className="koko-wordmark text-2xl">
            kokocastles
          </NavLink>
          <nav className="flex items-center gap-1">
            <NavTab to="/watchlist">Watchlist</NavTab>
            <NavTab to="/help">Help</NavTab>
            <NavTab to="/settings">Settings</NavTab>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
        <Routes>
          <Route path="/" element={<Navigate to="/watchlist" replace />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/channel/:platform/:channelId" element={<Channel />} />
          <Route path="/video/:platform/:videoId" element={<VideoAnalysis />} />
          <Route path="/help" element={<Help />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <footer className="text-center text-xs text-slate-500 py-6">
        kokocastles · free public clone · BYO API keys
      </footer>
    </div>
  );
}

function NavTab({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `koko-btn-ghost ${isActive ? 'bg-sky-100/70 text-slate-900' : ''}`
      }
    >
      {children}
    </NavLink>
  );
}

function NotFound() {
  return <div className="koko-card p-8 text-center">not found</div>;
}
