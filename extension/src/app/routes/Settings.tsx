import { useEffect, useMemo, useRef, useState } from 'react';
import KeyInput from '~/app/components/KeyInput';
import SearchableSelect, { type Option as SelectOption } from '~/app/components/SearchableSelect';
import { storage } from '~/lib/storage';
import { detectProvider } from '~/lib/llm/detect';
import { PROVIDERS, getProvider } from '~/lib/llm/providers';
import type { LLMProvider } from '~/lib/llm/types';
import type { Channel } from '~/types';
import { buildBundle, parseBundle } from '~/lib/configIo';

export default function Settings() {
  const [llmKey, setLlmKey] = useState('');
  const [llmProvider, setLlmProvider] = useState<LLMProvider | ''>('');
  const [llmModel, setLlmModel] = useState<string>('');
  const [youtubeKey, setYoutubeKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [outlierThreshold, setOutlierThreshold] = useState(1.5);
  const [refreshIntervalHours, setRefreshIntervalHours] = useState(6);
  const [throttleConcurrency, setThrottleConcurrency] = useState(2);
  const [throttleJitterMs, setThrottleJitterMs] = useState(2500);
  const [cacheLruCap, setCacheLruCap] = useState(10000);
  const [ownChannel, setOwnChannel] = useState<Channel | null>(null);
  const [ownChannelInput, setOwnChannelInput] = useState('');
  const [igEnabled, setIgEnabled] = useState(false);
  const [ttEnabled, setTtEnabled] = useState(false);
  const [framesEnabled, setFramesEnabled] = useState(false);
  const [ioMsg, setIoMsg] = useState<string | null>(null);
  const [ioErr, setIoErr] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLlmKey(storage.getLLMKey());
    setLlmProvider(storage.getLLMProvider());
    setLlmModel(storage.getLLMModel());
    setYoutubeKey(storage.getYoutubeKey());
    setOutlierThreshold(storage.getOutlierThreshold());
    setRefreshIntervalHours(storage.getRefreshIntervalHours());
    setThrottleConcurrency(storage.getThrottleConcurrency());
    setThrottleJitterMs(storage.getThrottleJitterMs());
    setCacheLruCap(storage.getCacheLruCap());
    setOwnChannel(storage.getOwnChannel());
    const oc = storage.getOwnChannel();
    if (oc) setOwnChannelInput(`https://www.youtube.com/channel/${oc.channelId}`);
    const pe = storage.getPlatformsEnabled();
    setIgEnabled(pe.instagram);
    setTtEnabled(pe.tiktok);
    setFramesEnabled(storage.getFramesEnabled());
  }, []);

  const detected = useMemo(() => detectProvider(llmKey), [llmKey]);

  // Auto-set provider when detection is unambiguous; clear when key is empty.
  useEffect(() => {
    if (!llmKey.trim()) {
      setLlmProvider('');
      return;
    }
    if (detected.kind === 'detected') {
      setLlmProvider(detected.provider);
    }
  }, [llmKey, detected]);

  // (validation effect removed — see save() which clamps model to a valid id)

  const providerOptions: SelectOption[] = useMemo(
    () =>
      PROVIDERS.map((p) => ({
        value: p.id,
        label: p.label,
        hint:
          p.apiStyle === 'anthropic-native'
            ? 'Anthropic API'
            : p.apiStyle === 'gemini-native'
            ? 'Google Gemini API'
            : `OpenAI-compatible · ${p.baseURL ?? ''}`,
      })),
    []
  );

  const modelOptions: SelectOption[] = useMemo(() => {
    if (!llmProvider) return [];
    const def = getProvider(llmProvider);
    return (
      def?.models.map((m) => ({
        value: m.id,
        label: m.vision ? `👁 ${m.label}` : m.label,
        hint: m.id,
      })) ?? []
    );
  }, [llmProvider]);

  async function save() {
    await storage.setLLMKey(llmKey.trim());
    await storage.setLLMProvider(llmProvider);
    const def = llmProvider ? getProvider(llmProvider) : undefined;
    const validIds = new Set(def?.models.map((m) => m.id) ?? []);
    const finalModel =
      llmModel && validIds.has(llmModel) ? llmModel : def?.models[0]?.id ?? '';
    await storage.setLLMModel(finalModel);
    setLlmModel(finalModel);
    await storage.setYoutubeKey(youtubeKey.trim());
    await storage.setOutlierThreshold(outlierThreshold);
    await storage.setRefreshIntervalHours(refreshIntervalHours);
    await storage.setThrottleConcurrency(throttleConcurrency);
    await storage.setThrottleJitterMs(throttleJitterMs);
    await storage.setCacheLruCap(cacheLruCap);
    const trimmed = ownChannelInput.trim();
    if (!trimmed) {
      setOwnChannel(null);
      await storage.setOwnChannel(null);
    } else {
      // Lazy import so test doesn't have to mock the YouTube adapter.
      const { youtubeAdapter } = await import('~/lib/platforms/youtube');
      try {
        const resolved = await youtubeAdapter.resolveChannel(trimmed);
        setOwnChannel(resolved);
        await storage.setOwnChannel(resolved);
      } catch (err) {
        console.warn('own-channel resolve failed', err);
        // Keep previous value on resolve failure.
      }
    }
    await storage.setPlatformsEnabled({ instagram: igEnabled, tiktok: ttEnabled });
    await storage.setFramesEnabled(framesEnabled);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function exportConfig() {
    setIoMsg(null);
    setIoErr(null);
    try {
      const all = await browser.storage.local.get(null);
      const bundle = buildBundle(all as Record<string, unknown>);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kokocastles-config-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setIoMsg(`Exported ${Object.keys(bundle.entries).length} keys.`);
      setTimeout(() => setIoMsg(null), 2000);
    } catch (e) {
      setIoErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function importConfig(file: File) {
    setIoMsg(null);
    setIoErr(null);
    try {
      const text = await file.text();
      const bundle = parseBundle(text);
      const ok = window.confirm(
        `Import ${Object.keys(bundle.entries).length} keys from ${file.name}? This OVERWRITES the matching keys in storage. Sidebar will reload.`
      );
      if (!ok) return;
      await browser.storage.local.set(bundle.entries);
      setIoMsg(`Imported ${Object.keys(bundle.entries).length} keys. Reloading sidebar…`);
      setTimeout(() => window.location.reload(), 500);
    } catch (e) {
      setIoErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function saveToWorkspace() {
    setIoMsg(null);
    setIoErr(null);
    try {
      const all = await browser.storage.local.get(null);
      const bundle = buildBundle(all as Record<string, unknown>);
      const res = await fetch('http://127.0.0.1:5176/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(bundle),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const j = (await res.json()) as { bytes: number; path: string };
      setIoMsg(`Saved ${Object.keys(bundle.entries).length} keys → ${j.path} (${j.bytes} B).`);
      setTimeout(() => setIoMsg(null), 3000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setIoErr(`Save failed: ${msg}. Is "npm run dev:config" running?`);
    }
  }

  async function loadFromWorkspace() {
    setIoMsg(null);
    setIoErr(null);
    try {
      const res = await fetch('http://127.0.0.1:5176/load');
      if (res.status === 404) {
        setIoErr('No workspace config saved yet. Click "Save to workspace" first.');
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const text = await res.text();
      const bundle = parseBundle(text);
      const ok = window.confirm(
        `Load ${Object.keys(bundle.entries).length} keys from workspace? This OVERWRITES matching keys in storage. Sidebar will reload.`
      );
      if (!ok) return;
      await browser.storage.local.set(bundle.entries);
      setIoMsg(`Loaded ${Object.keys(bundle.entries).length} keys. Reloading sidebar…`);
      setTimeout(() => window.location.reload(), 500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setIoErr(`Load failed: ${msg}. Is "npm run dev:config" running?`);
    }
  }

  return (
    <div className="space-y-6">
      <section className="koko-card p-6 space-y-4">
        <h2 className="text-lg font-display font-semibold">API keys</h2>

        <div className="space-y-2">
          <KeyInput
            label="LLM API key"
            value={llmKey}
            onChange={setLlmKey}
            placeholder="sk-ant-... · sk-... · AIza... · sk-or-v1-... · gsk_... · xai-... · fw_..."
            hint="Single field. Provider auto-detected by key prefix where unambiguous. Stored locally only."
          />
          {llmKey.trim() ? (
            <div className="space-y-2 text-xs">
              {detected.kind === 'detected' ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-1 rounded-full bg-koko-pink/40 text-slate-700">
                    Detected:{' '}
                    <strong>
                      {getProvider(detected.provider)?.label ?? detected.provider}
                    </strong>
                  </span>
                  <span className="text-slate-500">— override below if wrong:</span>
                </div>
              ) : detected.kind === 'ambiguous' ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-900">
                    Ambiguous prefix — pick provider:
                  </span>
                  <span className="text-slate-500">
                    candidates:{' '}
                    {detected.candidates
                      .map((c) => getProvider(c)?.label ?? c)
                      .join(', ')}
                  </span>
                </div>
              ) : (
                <span className="px-2 py-1 rounded-full bg-rose-100 text-rose-900 inline-block">
                  Unrecognized key prefix. Pick provider manually:
                </span>
              )}
              <SearchableSelect
                value={llmProvider}
                options={providerOptions}
                onChange={(v) => setLlmProvider(v as LLMProvider | '')}
                placeholder="select provider…"
                emptyLabel="— none —"
                className="max-w-md"
              />
            </div>
          ) : null}
        </div>

        {llmProvider ? (
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Model</label>
            <SearchableSelect
              value={llmModel}
              options={modelOptions}
              onChange={setLlmModel}
              placeholder="select model…"
              emptyLabel="— first available —"
              className="max-w-md"
            />
            <p className="text-xs text-slate-500">
              Used for all LLM tasks. {modelOptions.length} models available for{' '}
              {getProvider(llmProvider)?.label}. Models marked 👁 accept image input
              (required for thumbnail / video-frame analysis).
            </p>
          </div>
        ) : null}

        <KeyInput
          label="Google YouTube Data API key"
          value={youtubeKey}
          onChange={setYoutubeKey}
          placeholder="AIza..."
          hint="Free 10k units/day per Google Cloud project."
        />
      </section>

      <section className="koko-card p-6 space-y-4">
        <h2 className="text-lg font-display font-semibold">Analysis defaults</h2>

        <div className="space-y-1">
          <label htmlFor="outlier-threshold" className="text-sm font-medium text-slate-700">
            Outlier threshold (views ÷ channel mean)
          </label>
          <input
            id="outlier-threshold"
            type="number"
            step="0.1"
            min="1"
            max="10"
            value={outlierThreshold}
            onChange={(e) => setOutlierThreshold(Number(e.target.value))}
            className="w-32 rounded-lg border border-sky-200 px-3 py-2 text-sm"
          />
          <p className="text-xs text-slate-500">A video counts as an outlier when its views ÷ channel mean ≥ this number. Default 1.5.</p>
        </div>

        <div className="space-y-1">
          <label htmlFor="cache-lru-cap" className="text-sm font-medium text-slate-700">
            Analysis cache cap
          </label>
          <input
            id="cache-lru-cap"
            type="number"
            step="1000"
            min="1000"
            max="100000"
            value={cacheLruCap}
            onChange={(e) => setCacheLruCap(Number(e.target.value))}
            className="w-32 rounded-lg border border-sky-200 px-3 py-2 text-sm"
          />
          <p className="text-xs text-slate-500">Max number of cached analyses + transcripts before LRU eviction. Default 10000.</p>
        </div>
      </section>

      <section className="koko-card p-6 space-y-4">
        <h2 className="text-lg font-display font-semibold">Throttling &amp; refresh</h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label htmlFor="throttle-concurrency" className="text-sm font-medium text-slate-700">Scrape concurrency</label>
            <input
              id="throttle-concurrency"
              type="number"
              min="1"
              max="5"
              value={throttleConcurrency}
              onChange={(e) => setThrottleConcurrency(Number(e.target.value))}
              className="w-full rounded-lg border border-sky-200 px-3 py-2 text-sm"
            />
            <p className="text-xs text-slate-500">Max parallel hidden-tab scrapes. Default 2.</p>
          </div>

          <div className="space-y-1">
            <label htmlFor="throttle-jitter" className="text-sm font-medium text-slate-700">Jitter (ms)</label>
            <input
              id="throttle-jitter"
              type="number"
              min="0"
              max="10000"
              step="100"
              value={throttleJitterMs}
              onChange={(e) => setThrottleJitterMs(Number(e.target.value))}
              className="w-full rounded-lg border border-sky-200 px-3 py-2 text-sm"
            />
            <p className="text-xs text-slate-500">Random delay between scrapes. Higher = less CAPTCHA risk.</p>
          </div>

          <div className="space-y-1">
            <label htmlFor="refresh-interval" className="text-sm font-medium text-slate-700">Refresh interval (hours)</label>
            <input
              id="refresh-interval"
              type="number"
              min="1"
              max="48"
              value={refreshIntervalHours}
              onChange={(e) => setRefreshIntervalHours(Number(e.target.value))}
              className="w-full rounded-lg border border-sky-200 px-3 py-2 text-sm"
            />
            <p className="text-xs text-slate-500">How often own-channel polling runs. Default 6h.</p>
          </div>
        </div>
      </section>

      <section className="koko-card p-6 space-y-4">
        <h2 className="text-lg font-display font-semibold">My channel</h2>
        <div className="space-y-1">
          <label htmlFor="own-channel-url" className="text-sm font-medium text-slate-700">
            Own channel URL
          </label>
          <input
            id="own-channel-url"
            type="text"
            placeholder="https://www.youtube.com/@yourhandle  ·  https://www.youtube.com/channel/UC…"
            value={ownChannelInput}
            onChange={(e) => setOwnChannelInput(e.target.value)}
            className="w-full max-w-xl rounded-lg border border-sky-200 px-3 py-2 text-sm"
          />
          <p className="text-xs text-slate-500">
            Resolved on save via YouTube Data API. Used by the My Channel page (Phase 6) for
            analytics + hypothesis tagging.
          </p>
          {ownChannel ? (
            <div className="text-xs text-slate-500">
              Currently linked: <strong>{ownChannel.title}</strong> ({ownChannel.channelId})
            </div>
          ) : null}
        </div>
      </section>

      <section className="koko-card p-6 space-y-4">
        <h2 className="text-lg font-display font-semibold">Experimental platforms</h2>
        <p className="text-xs text-slate-500">
          Off by default. Scrape adapters for Instagram + TikTok are best-effort: selectors drift,
          and a yellow banner will surface on the active-tab card when scrape returns 0 videos.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={igEnabled}
            onChange={(e) => setIgEnabled(e.target.checked)}
          />
          Enable Instagram adapter
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={ttEnabled}
            onChange={(e) => setTtEnabled(e.target.checked)}
          />
          Enable TikTok adapter
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={framesEnabled}
            onChange={(e) => setFramesEnabled(e.target.checked)}
          />
          Capture visual hook frames (slow; opens a hidden tab per video)
        </label>
      </section>

      <section className="koko-card p-6 space-y-3">
        <h2 className="text-lg font-display font-semibold">Config import / export</h2>
        <p className="text-xs text-slate-500">
          JSON bundle of API keys, persona, watchlist, databanks, hypotheses, writer threads,
          settings, and feature flags. Excludes per-video caches (analyses / transcripts / frames /
          hook categories). Use to seed a fresh install in seconds.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={exportConfig} className="koko-btn">
            Export config
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="koko-btn"
          >
            Import config
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importConfig(f);
              e.currentTarget.value = '';
            }}
            aria-label="Import config file"
          />
        </div>
        <div className="space-y-1 border-t border-sky-100 pt-3">
          <p className="text-xs text-slate-500">
            Dev shortcut: persist directly into <code>.dev-config/koko-config.json</code> at the repo
            root, no file picker. Requires the helper running locally:{' '}
            <code className="rounded bg-sky-50 px-1">npm run dev:config</code> (from the{' '}
            <code>extension/</code> dir).
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={saveToWorkspace} className="koko-btn">
              Save to workspace
            </button>
            <button onClick={loadFromWorkspace} className="koko-btn">
              Load from workspace
            </button>
          </div>
          {ioMsg ? <span className="text-xs text-slate-600">{ioMsg}</span> : null}
          {ioErr ? <span className="text-xs text-red-600">{ioErr}</span> : null}
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button onClick={save} className="koko-btn">
          Save
        </button>
        {saved ? (
          <span className="text-sm text-koko-pink-deep font-medium">saved ✓</span>
        ) : null}
      </div>
    </div>
  );
}
