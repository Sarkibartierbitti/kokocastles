import { useEffect, useState } from 'react';
import { Link, NavLink, Routes, Route } from 'react-router-dom';
import Watchlist from '~/app/routes/Watchlist';
import Settings from '~/app/routes/Settings';
import Help from '~/app/routes/Help';
import { storage } from '~/lib/storage';

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    storage.hydrate().then(() => setReady(true));
  }, []);

  if (!ready) {
    return <div className="p-6 text-sm text-slate-500">loading…</div>;
  }

  return (
    <div className="min-h-screen text-slate-900">
      <header className="px-4 py-3 border-b border-sky-100 flex items-center gap-3">
        <Link to="/" className="koko-wordmark text-lg">
          kokocastles
        </Link>
      </header>
      <nav className="px-4 py-2 flex gap-3 text-xs border-b border-sky-100">
        <NavLink to="/" end className={({ isActive }) => isActive ? 'text-koko-pink-deep font-semibold' : 'text-slate-600'}>watchlist</NavLink>
        <NavLink to="/settings" className={({ isActive }) => isActive ? 'text-koko-pink-deep font-semibold' : 'text-slate-600'}>settings</NavLink>
        <NavLink to="/help" className={({ isActive }) => isActive ? 'text-koko-pink-deep font-semibold' : 'text-slate-600'}>help</NavLink>
      </nav>
      <main className="p-4">
        <Routes>
          <Route path="/" element={<Watchlist />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/help" element={<Help />} />
        </Routes>
      </main>
    </div>
  );
}
