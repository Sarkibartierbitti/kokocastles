import { useEffect, useMemo, useState } from 'react';
import KeyInput from '~/app/components/KeyInput';
import SearchableSelect, { type Option as SelectOption } from '~/app/components/SearchableSelect';
import { storage } from '~/lib/storage';
import { detectProvider } from '~/lib/llm/detect';
import { PROVIDERS, getProvider } from '~/lib/llm/providers';
import type { LLMProvider } from '~/lib/llm/types';

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

  // Validate model against the currently selected provider's model list.
  // If the model is no longer valid, reset to empty (will fall back to first model on save).
  useEffect(() => {
    if (!llmProvider) {
      if (llmModel) setLlmModel('');
      return;
    }
    const def = getProvider(llmProvider);
    const validIds = new Set(def?.models.map((m) => m.id) ?? []);
    if (llmModel && !validIds.has(llmModel)) {
      setLlmModel('');
    }
  }, [llmProvider, llmModel]);

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
