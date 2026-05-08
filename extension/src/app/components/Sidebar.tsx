import { Link, NavLink } from 'react-router-dom';

interface NavEntry {
  to: string;
  label: string;
  end?: boolean;
}

const ENTRIES: NavEntry[] = [
  { to: '/', label: 'analyze', end: true },
  { to: '/channels', label: 'channels' },
  { to: '/databanks', label: 'databanks' },
  { to: '/ideas', label: 'ideas' },
  { to: '/my-channel', label: 'my channel' },
  { to: '/writer', label: 'writer' },
  { to: '/persona', label: 'persona' },
  { to: '/niche', label: 'niche' },
  { to: '/compare', label: 'compare' },
  { to: '/settings', label: 'settings' },
  { to: '/help', label: 'help' },
];

export default function Sidebar() {
  return (
    <>
      <header className="px-4 py-3 border-b border-sky-100 flex items-center gap-3">
        <Link to="/" className="koko-wordmark text-lg">kokocastles</Link>
      </header>
      <nav className="px-4 py-2 flex flex-wrap gap-3 text-xs border-b border-sky-100">
        {ENTRIES.map((e) => (
          <NavLink
            key={e.to}
            to={e.to}
            end={e.end}
            className={({ isActive }) =>
              isActive ? 'text-koko-pink-deep font-semibold' : 'text-slate-600'
            }
          >
            {e.label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
