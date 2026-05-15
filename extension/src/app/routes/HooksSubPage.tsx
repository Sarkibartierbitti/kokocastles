import { useEffect, useMemo, useRef, useState } from 'react';
import { storage } from '~/lib/storage';
import { aggregateHooks } from '~/lib/aggregators';
import type { HookCategory } from '~/lib/hookCategories';
import HookCard from '~/app/components/HookCard';
import ScrapeControl from '~/app/components/ScrapeControl';

export default function HooksSubPage() {
  const [categories, setCategories] = useState<Map<string, HookCategory>>(() =>
    storage.getAllHookCategories()
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ranRef = useRef(false);

  const hooks = useMemo(() => {
    const deeps = storage.getAllDeepEntries();
    const transcripts = storage.getAllTranscriptEntries();
    return aggregateHooks(deeps, transcripts, categories);
  }, [categories]);

  // Visual frame capture (Phase 10) — fire-and-forget; UI re-renders next mount.
  useEffect(() => {
    if (!storage.getFramesEnabled()) return;
    const missing = hooks.filter(
      (h) => h.platform === 'youtube' && !storage.getFrame(h.platform, h.videoId)
    );
    if (missing.length === 0) return;
    (async () => {
      const [{ enqueueFrameCapture }, bridge] = await Promise.all([
        import('~/lib/frameQueue'),
        import('~/lib/frameBridge'),
      ]);
      for (const h of missing) {
        void enqueueFrameCapture(h.platform, h.videoId, bridge.captureFrameViaBackground);
      }
    })();
  }, [hooks]);

  useEffect(() => {
    if (ranRef.current) return;
    const uncategorized = hooks.filter((h) => !h.category);
    if (uncategorized.length === 0) return;
    ranRef.current = true;
    setBusy(true);
    setErr(null);
    (async () => {
      try {
        const { categorizeHooks } = await import('~/lib/llm/tasks');
        const out = await categorizeHooks(
          uncategorized.map((h) => ({
            videoId: h.videoId,
            spoken: h.spoken,
            onScreen: h.onScreen,
            visualFormat: h.visualFormat,
          }))
        );
        for (const a of out) {
          const match = uncategorized.find((h) => h.videoId === a.videoId);
          if (!match) continue;
          await storage.setHookCategory(match.platform, match.videoId, a.category);
        }
        setCategories(storage.getAllHookCategories());
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    })();
  }, [hooks]);

  if (hooks.length === 0) {
    return (
      <div className="space-y-4">
        <ScrapeControl />
        <div className="koko-card p-8 max-w-xl mx-auto text-center text-sm text-slate-500">
          No hooks yet. Scrape channels above, then analyze videos from the Videos sub-page to populate this view.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ScrapeControl />
      <header className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {hooks.length} hook{hooks.length === 1 ? '' : 's'} from analyzed videos
        </p>
        {busy && <span className="text-xs text-slate-500">Categorizing…</span>}
        {err && <span className="text-xs text-red-600">{err}</span>}
      </header>
      <div className="space-y-2">
        {hooks.map((h) => (
          <HookCard key={`${h.platform}::${h.videoId}`} entry={h} />
        ))}
      </div>
    </div>
  );
}
