import { useEffect, useMemo, useState } from 'react';
import KeyInput from '../components/KeyInput';
import { storage } from '../lib/storage';
import { detectProvider } from '../lib/llm/detect';
import { modelLabel, modelsForProvider } from '../lib/llm/models';
import type { LLMModelId, LLMProvider, LLMTask, TierMode } from '../types';

const TASKS: { id: LLMTask; label: string; help: string }[] = [
  { id: 'triage', label: 'Triage scan', help: 'fast hook classifier across recent videos' },
  { id: 'deep', label: 'Deep analysis', help: 'full structural breakdown of a single video' },
  { id: 'outlierWhy', label: 'Outlier explanation', help: 'one-line reason a video over-performed' },
  { id: 'synthesis', label: 'Pattern synthesis', help: 'multi-video pattern + script template (v2)' },
];

const TIERS: { id: TierMode; label: string; desc: string }[] = [
  { id: 'eco', label: 'Eco', desc: 'Cheapest model from your provider for triage + deep.' },
  { id: 'standard', label: 'Standard', desc: 'Cheap for triage, default for deep + synthesis.' },
  { id: 'max', label: 'Max', desc: 'Default for triage, premium for synthesis. Spendy.' },
];

const PROVIDER_LABELS: Record<LLMProvider, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI',
  gemini: 'Google Gemini',
};

export default function Settings() {
  const [llmKey, setLlmKey] = useState('');
  const [llmProvider, setLlmProvider] = useState<LLMProvider | ''>('');
  const [youtubeKey, setYoutubeKey] = useState('');
  const [tier, setTier] = useState<TierMode>('standard');
  const [overrides, setOverrides] = useState<Partial<Record<LLMTask, LLMModelId>>>({});
  const [advanced, setAdvanced] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLlmKey(storage.getLLMKey());
    setLlmProvider(storage.getLLMProvider());
    setYoutubeKey(storage.getYoutubeKey());
    setTier(storage.getTierMode());
    setOverrides(storage.getModelOverrides());
  }, []);

  const detected = useMemo(() => detectProvider(llmKey), [llmKey]);

  // Auto-set provider when detection is unambiguous; clear when key empty.
  useEffect(() => {
    if (!llmKey.trim()) {
      setLlmProvider('');
      return;
    }
    if (detected.kind === 'detected') {
      setLlmProvider(detected.provider);
    }
  }, [llmKey, detected]);

  const availableModels: LLMModelId[] = llmProvider ? modelsForProvider(llmProvider) : [];

  function save() {
    storage.setLLMKey(llmKey.trim());
    storage.setLLMProvider(llmProvider);
    storage.setYoutubeKey(youtubeKey.trim());
    storage.setTierMode(tier);
    // Drop overrides whose model is no longer compatible with the chosen provider.
    const compatible: Partial<Record<LLMTask, LLMModelId>> = {};
    for (const [k, v] of Object.entries(overrides)) {
      if (v && availableModels.includes(v)) compatible[k as LLMTask] = v;
    }
    storage.setModelOverrides(compatible);
    setOverrides(compatible);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
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
            placeholder="sk-ant-... · sk-... · AIza..."
            hint="Single field. Anthropic, OpenAI, and Gemini keys are auto-detected by prefix. Stored locally only."
          />
          {llmKey.trim() ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {detected.kind === 'detected' ? (
                <span className="px-2 py-1 rounded-full bg-koko-pink/40 text-slate-700">
                  Detected: <strong>{PROVIDER_LABELS[detected.provider]}</strong>
                </span>
              ) : detected.kind === 'ambiguous' ? (
                <>
                  <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-900">
                    Ambiguous prefix — please confirm:
                  </span>
                  <select
                    className="koko-input max-w-xs"
                    value={llmProvider}
                    onChange={(e) => setLlmProvider(e.target.value as LLMProvider | '')}
                  >
                    <option value="">— select provider —</option>
                    {detected.candidates.map((p) => (
                      <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
                    ))}
                  </select>
                </>
              ) : (
                <span className="px-2 py-1 rounded-full bg-rose-100 text-rose-900">
                  Unrecognized key prefix. Pick provider manually below.
                </span>
              )}
              {detected.kind !== 'detected' && (
                <select
                  className="koko-input max-w-xs"
                  value={llmProvider}
                  onChange={(e) => setLlmProvider(e.target.value as LLMProvider | '')}
                >
                  <option value="">— select provider —</option>
                  <option value="anthropic">{PROVIDER_LABELS.anthropic}</option>
                  <option value="openai">{PROVIDER_LABELS.openai}</option>
                  <option value="gemini">{PROVIDER_LABELS.gemini}</option>
                </select>
              )}
            </div>
          ) : null}
        </div>

        <KeyInput
          label="Google YouTube Data API key"
          value={youtubeKey}
          onChange={setYoutubeKey}
          placeholder="AIza..."
          hint="Free 10k units/day per Google Cloud project. Used for channel + video metadata."
        />
      </section>

      <section className="koko-card p-6 space-y-4">
        <h2 className="text-lg font-display font-semibold">Model tier</h2>
        <p className="text-sm text-slate-600">
          Routes tasks to cheaper models by default. Premium tier per provider only used in Max.
        </p>
        <div className="grid sm:grid-cols-3 gap-3">
          {TIERS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTier(t.id)}
              className={`text-left p-4 rounded-xl ring-1 transition ${
                tier === t.id ? 'ring-koko-pink-deep bg-koko-pink/40' : 'ring-sky-200 bg-white/60 hover:bg-white'
              }`}
            >
              <div className="font-semibold">{t.label}</div>
              <div className="text-xs text-slate-600 mt-1">{t.desc}</div>
            </button>
          ))}
        </div>

        <button
          onClick={() => setAdvanced((a) => !a)}
          className="koko-btn-ghost text-sm"
        >
          {advanced ? '▾' : '▸'} Per-task model overrides
        </button>
        {advanced ? (
          <div className="space-y-3 border-t border-sky-100 pt-4">
            {!llmProvider ? (
              <p className="text-xs text-slate-500">Set an LLM key first to see overrides.</p>
            ) : (
              TASKS.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{t.label}</div>
                    <div className="text-xs text-slate-500">{t.help}</div>
                  </div>
                  <select
                    className="koko-input max-w-xs"
                    value={overrides[t.id] ?? ''}
                    onChange={(e) => {
                      const v = e.target.value as LLMModelId | '';
                      setOverrides((prev) => {
                        const next = { ...prev };
                        if (v === '') delete next[t.id];
                        else next[t.id] = v;
                        return next;
                      });
                    }}
                  >
                    <option value="">— tier default —</option>
                    {availableModels.map((m) => (
                      <option key={m} value={m}>{modelLabel(m)}</option>
                    ))}
                  </select>
                </div>
              ))
            )}
          </div>
        ) : null}
      </section>

      <div className="flex items-center gap-3">
        <button onClick={save} className="koko-btn">Save</button>
        {saved ? <span className="text-sm text-koko-pink-deep font-medium">saved ✓</span> : null}
      </div>
    </div>
  );
}
