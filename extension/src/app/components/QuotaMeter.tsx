import { useEffect, useState } from 'react';
import { storage } from '~/lib/storage';
import { activity } from '~/lib/activity';

const DAILY_QUOTA = 10_000;
const SEGMENTS = 10;

export default function QuotaMeter() {
  const [units, setUnits] = useState(() => storage.getYtQuotaToday().unitsUsed);

  useEffect(() => {
    function refresh() {
      setUnits(storage.getYtQuotaToday().unitsUsed);
    }
    // Poll cheaply on every activity event — covers all paths that may
    // bump quota (LLM panel doesn't touch YT, but scrape jobs may).
    const unsub = activity.subscribe(refresh);
    const t = setInterval(refresh, 5000);
    return () => { unsub(); clearInterval(t); };
  }, []);

  const filled = Math.min(SEGMENTS, Math.floor((units / DAILY_QUOTA) * SEGMENTS));
  const tone =
    units >= DAILY_QUOTA ? 'bg-rose-500'
    : units > DAILY_QUOTA * 0.8 ? 'bg-amber-500'
    : 'bg-koko-sky-deep';

  return (
    <div
      className="flex items-center gap-1 text-[10px] text-slate-500"
      title={`YouTube Data API quota: ${units.toLocaleString()} / ${DAILY_QUOTA.toLocaleString()} units used today (UTC). Resets daily.`}
    >
      <span className="font-mono">YT</span>
      <div className="flex gap-[1px]">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span
            key={i}
            className={`inline-block w-1 h-3 rounded-sm ${i < filled ? tone : 'bg-slate-200'}`}
          />
        ))}
      </div>
      <span className="font-mono">{units}</span>
    </div>
  );
}
