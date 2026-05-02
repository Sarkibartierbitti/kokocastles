import { useEffect, useMemo, useState } from 'react';
import KeyInput from '../components/KeyInput';
import { storage } from '../lib/storage';
import { detectProvider } from '../lib/llm/detect';
import { getProvider, PROVIDERS } from '../lib/llm/providers';
import type { LLMProvider } from '../lib/llm/types';

export default function Settings() {
  const [llmKey, setLlmKey] = useState('');
  const [llmProvider, setLlmProvider] = useState<LLMProvider | ''>('');
  const [llmModel, setLlmModel] = useState<string>('');
  const [youtubeKey, setYoutubeKey] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLlmKey(storage.getLLMKey());
    setLlmProvider(storage.getLLMProvider());
    setLlmModel(storage.getLLMModel());
    setYoutubeKey(storage.getYoutubeKey());
  }, []);

  const detected = useMemo(() => detectProvider(llmKey), [llmKey]);

  useEffect(() => {
    if (!llmKey.trim()) {
      setLlmProvider('');
      return;
    }
    if (detected.kind === 'detected') setLlmProvider(detected.provider);
  }, [llmKey, detected]);

  function save() {
    storage.setLLMKey(llmKey.trim());
    storage.setLLMProvider(llmProvider);
    const def = llmProvider ? getProvider(llmProvider) : undefined;
    const validIds = new Set(def?.models.map((m) => m.id) ?? []);
    const finalModel = llmModel && validIds.has(llmModel) ? llmModel : def?.models[0]?.id ?? '';
    storage.setLLMModel(finalModel);
    setLlmModel(finalModel);
    storage.setYoutubeKey(youtubeKey.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="space-y-6">
      <section className="koko-card p-6 space-y-4">
        <h2 className="text-lg font-display font-semibold">API keys</h2>
        <KeyInput
          label="LLM API key"
          value={llmKey}
          onChange={setLlmKey}
          placeholder="sk-ant-... · sk-... · AIza... · sk-or-v1-... · gsk_... · xai-... · fw_..."
          hint="Single field. Provider auto-detected by key prefix where unambiguous. Stored locally only."
        />
        {llmKey.trim() ? (
          <div className="text-xs text-slate-600">
            {detected.kind === 'detected'
              ? `Detected: ${getProvider(detected.provider)?.label ?? detected.provider}`
              : detected.kind === 'ambiguous'
              ? `Ambiguous prefix — candidates: ${detected.candidates.map((c) => getProvider(c)?.label ?? c).join(', ')} (manual select pending Task R3)`
              : 'Unrecognized key prefix (manual select pending Task R3)'}
          </div>
        ) : null}
        <KeyInput
          label="Google YouTube Data API key"
          value={youtubeKey}
          onChange={setYoutubeKey}
          placeholder="AIza..."
          hint="Free 10k units/day per Google Cloud project."
        />
        <div className="text-xs text-slate-500">
          {PROVIDERS.length} providers registered. Searchable provider + model dropdowns landing in Task R3.
        </div>
      </section>
      <div className="flex items-center gap-3">
        <button onClick={save} className="koko-btn">Save</button>
        {saved ? <span className="text-sm text-koko-pink-deep font-medium">saved ✓</span> : null}
      </div>
    </div>
  );
}
