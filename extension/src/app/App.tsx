import { Link, Routes, Route } from 'react-router-dom';

export default function App() {
  return (
    <div className="min-h-screen text-slate-900">
      <header className="px-4 py-3 border-b border-sky-100 flex items-center gap-3">
        <Link to="/" className="koko-wordmark text-lg">
          kokocastles
        </Link>
      </header>
      <nav className="px-4 py-2 flex gap-3 text-xs border-b border-sky-100">
        <Link to="/">watchlist</Link>
        <Link to="/settings">settings</Link>
        <Link to="/help">help</Link>
      </nav>
      <main className="p-4">
        <Routes>
          <Route path="/" element={<div>watchlist (port pending)</div>} />
          <Route path="/settings" element={<div>settings (port pending)</div>} />
          <Route path="/help" element={<div>help (port pending)</div>} />
        </Routes>
      </main>
    </div>
  );
}
