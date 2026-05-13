import { useEffect, useMemo, useRef, useState } from 'react';
import { storage } from '~/lib/storage';
import { getProvider } from '~/lib/llm/providers';
import type {
  Databank,
  Persona,
  PlatformId,
  Video,
  WriterContextRef,
  WriterDraft,
  WriterThread,
} from '~/types';
import type { DatabankBundle } from '~/lib/writerPrompt';
import MarkdownView from '~/app/components/MarkdownView';
import { splitDraftParagraphs, mergeParagraphs, joinParagraphs } from '~/lib/writerSteps';

type WriterMode = 'single' | 'multi';
type WriterStep = 'idle' | 'clarify' | 'personalize' | 'draft' | 'iterate';

const MAX_FILE_BYTES = 100 * 1024;
const MAX_FILES_TOTAL_BYTES = 500 * 1024;

function newThread(): WriterThread {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: 'Untitled thread',
    topic: '',
    context: { usePersona: false, databankIds: [], files: [] },
    drafts: [],
    createdAt: now,
    updatedAt: now,
  };
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function buildBundles(databankIds: string[]): DatabankBundle[] {
  const banks = storage.getDatabanks().filter((d) => databankIds.includes(d.id));
  return banks.map<DatabankBundle>((bank) => ({
    databankName: bank.name,
    videos: bank.videoRefs.map((ref) => {
      const platform = ref.platform as PlatformId;
      const cacheKey = `koko.deep.${platform}.${ref.videoId}`;
      const transcriptKey = `koko.transcript.${platform}.${ref.videoId}`;
      const deepAll = storage.getAllDeepEntries();
      const transcriptAll = storage.getAllTranscriptEntries();
      void cacheKey; void transcriptKey;
      const deep = deepAll.find((d) => d.platform === platform && d.videoId === ref.videoId)?.deep ?? null;
      const transcript = transcriptAll.find((t) => t.platform === platform && t.videoId === ref.videoId)?.segments ?? null;
      const videoStub: Video = {
        platform,
        videoId: ref.videoId,
        channelId: '',
        channelTitle: '',
        title: '(unknown title)',
        publishedAt: '',
        viewCount: 0,
        thumbnailUrl: '',
      };
      return { video: videoStub, deep, transcript };
    }),
  }));
}

interface ProviderModelOpt {
  id: string;
  label: string;
}

function modelOptions(): ProviderModelOpt[] {
  const provider = storage.getLLMProvider();
  if (!provider) return [];
  const def = getProvider(provider);
  if (!def) return [];
  return def.models.map((m) => ({ id: m.id, label: m.label }));
}

export default function WriterRoute() {
  const [threads, setThreads] = useState<WriterThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [databanks, setDatabanks] = useState<Databank[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [modelDraft, setModelDraft] = useState<string>('');
  const [titleDraft, setTitleDraft] = useState('');
  const [topicDraft, setTopicDraft] = useState('');
  const [contextDraft, setContextDraft] = useState<WriterContextRef>({
    usePersona: false,
    databankIds: [],
    files: [],
  });
  const [mode, setMode] = useState<WriterMode>('single');
  const [step, setStep] = useState<WriterStep>('idle');
  const [clarifyQuestions, setClarifyQuestions] = useState<string[]>([]);
  const [clarifyAnswers, setClarifyAnswers] = useState<Record<string, string>>({});
  const [personalizationOptions, setPersonalizationOptions] = useState<string[]>([]);
  const [pickedOption, setPickedOption] = useState<string>('');
  const [regenHint, setRegenHint] = useState<string>('');
  const [regenIndex, setRegenIndex] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function refresh() {
    setThreads(storage.getWriterThreads());
    const p = storage.getPersona();
    setPersona(p.niche || p.context || p.styleSample ? p : null);
    setDatabanks(storage.getDatabanks());
  }

  useEffect(() => {
    refresh();
  }, []);

  const active = useMemo(() => threads.find((t) => t.id === activeId) ?? null, [threads, activeId]);

  // Sync local edit state when active thread changes
  useEffect(() => {
    if (!active) return;
    setTitleDraft(active.title);
    setTopicDraft(active.topic);
    setContextDraft(active.context);
    setMode(active.mode ?? 'single');
    setStep(active.step ?? 'idle');
    setClarifyQuestions(active.clarifyQuestions ?? []);
    setClarifyAnswers(active.clarifyAnswers ?? {});
    setPersonalizationOptions(active.personalizationOptions ?? []);
    setPickedOption(active.pickedOption ?? '');
    setRegenHint('');
    setRegenIndex(null);
    const last = active.drafts.at(-1);
    setModelDraft(last?.model || storage.getLLMModel() || '');
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced persistence of edits to the active thread.
  useEffect(() => {
    if (!active) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const next: WriterThread = {
        ...active,
        title: titleDraft.trim() || 'Untitled thread',
        topic: topicDraft,
        context: contextDraft,
        mode,
        step,
        clarifyQuestions,
        clarifyAnswers,
        personalizationOptions,
        pickedOption,
        updatedAt: new Date().toISOString(),
      };
      const changed =
        next.title !== active.title ||
        next.topic !== active.topic ||
        JSON.stringify(next.context) !== JSON.stringify(active.context) ||
        next.mode !== active.mode ||
        next.step !== active.step ||
        JSON.stringify(next.clarifyQuestions) !== JSON.stringify(active.clarifyQuestions) ||
        JSON.stringify(next.clarifyAnswers) !== JSON.stringify(active.clarifyAnswers) ||
        JSON.stringify(next.personalizationOptions) !== JSON.stringify(active.personalizationOptions) ||
        next.pickedOption !== active.pickedOption;
      if (!changed) return;
      await storage.upsertWriterThread(next);
      refresh();
    }, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [titleDraft, topicDraft, contextDraft, mode, step, clarifyQuestions, clarifyAnswers, personalizationOptions, pickedOption]); // eslint-disable-line react-hooks/exhaustive-deps

  async function createThread() {
    const t = newThread();
    await storage.upsertWriterThread(t);
    setActiveId(t.id);
    refresh();
  }

  async function removeThread(id: string) {
    await storage.deleteWriterThread(id);
    if (activeId === id) setActiveId(null);
    refresh();
  }

  function toggleDatabank(id: string) {
    setContextDraft((c) =>
      c.databankIds.includes(id)
        ? { ...c, databankIds: c.databankIds.filter((x) => x !== id) }
        : { ...c, databankIds: [...c.databankIds, id] }
    );
  }

  async function handleFiles(filesIn: FileList | null) {
    if (!filesIn) return;
    setErr(null);
    const existingBytes = contextDraft.files.reduce((s, f) => s + f.text.length, 0);
    const additions: { name: string; text: string }[] = [];
    let total = existingBytes;
    for (const f of Array.from(filesIn)) {
      if (f.size > MAX_FILE_BYTES) {
        setErr(`File "${f.name}" exceeds 100 KB limit.`);
        return;
      }
      if (total + f.size > MAX_FILES_TOTAL_BYTES) {
        setErr('Total uploaded files would exceed 500 KB.');
        return;
      }
      total += f.size;
      const text = await f.text();
      additions.push({ name: f.name, text });
    }
    setContextDraft((c) => ({ ...c, files: [...c.files, ...additions] }));
  }

  function removeFile(name: string) {
    setContextDraft((c) => ({ ...c, files: c.files.filter((f) => f.name !== name) }));
  }

  function buildAugmentedTopic(): string {
    if (mode !== 'multi') return topicDraft;
    const answersBlock = Object.entries(clarifyAnswers)
      .filter(([, a]) => a.trim().length > 0)
      .map(([q, a]) => `Q: ${q}\nA: ${a}`)
      .join('\n');
    return [
      topicDraft,
      pickedOption ? `Angle: ${pickedOption}` : '',
      answersBlock,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  async function generate() {
    if (!active) return;
    if (!topicDraft.trim()) {
      setErr('Topic is required.');
      return;
    }
    setBusy(true);
    setErr(null);
    setStatus('Generating…');
    try {
      // Flush edits before generating.
      const ts = new Date().toISOString();
      const flushed: WriterThread = {
        ...active,
        title: titleDraft.trim() || 'Untitled thread',
        topic: topicDraft,
        context: contextDraft,
        mode,
        step,
        clarifyQuestions,
        clarifyAnswers,
        personalizationOptions,
        pickedOption,
        updatedAt: ts,
      };
      await storage.upsertWriterThread(flushed);

      const bundles = buildBundles(contextDraft.databankIds);
      const personaIn = contextDraft.usePersona ? persona : null;
      const { generateScript } = await import('~/lib/llm/tasks');
      const draft = await generateScript({
        topic: buildAugmentedTopic(),
        context: contextDraft,
        persona: personaIn,
        databankBundles: bundles,
        modelOverride: modelDraft || undefined,
      });
      await storage.appendWriterDraft(active.id, draft);
      if (mode === 'multi') setStep('iterate');
      setStatus('Done.');
      refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      setStatus(null);
    } finally {
      setBusy(false);
      setTimeout(() => setStatus(null), 2000);
    }
  }

  async function runClarify() {
    if (!active || !topicDraft.trim()) {
      setErr('Topic is required.');
      return;
    }
    setBusy(true);
    setErr(null);
    setStatus('Asking…');
    try {
      const bundles = buildBundles(contextDraft.databankIds);
      const personaIn = contextDraft.usePersona ? persona : null;
      const { writerClarify } = await import('~/lib/llm/tasks');
      const qs = await writerClarify({
        topic: topicDraft,
        context: contextDraft,
        persona: personaIn,
        databankBundles: bundles,
        modelOverride: modelDraft || undefined,
      });
      setClarifyQuestions(qs);
      const seeded: Record<string, string> = {};
      for (const q of qs) seeded[q] = clarifyAnswers[q] ?? '';
      setClarifyAnswers(seeded);
      setStatus('Done.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setStatus(null);
    } finally {
      setBusy(false);
      setTimeout(() => setStatus(null), 1500);
    }
  }

  async function runPersonalize() {
    if (!active) return;
    setBusy(true);
    setErr(null);
    setStatus('Suggesting…');
    try {
      const bundles = buildBundles(contextDraft.databankIds);
      const personaIn = contextDraft.usePersona ? persona : null;
      const { writerPersonalize } = await import('~/lib/llm/tasks');
      const opts = await writerPersonalize({
        topic: topicDraft,
        context: contextDraft,
        persona: personaIn,
        databankBundles: bundles,
        modelOverride: modelDraft || undefined,
        clarifyAnswers,
      });
      setPersonalizationOptions(opts);
      setStatus('Done.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setStatus(null);
    } finally {
      setBusy(false);
      setTimeout(() => setStatus(null), 1500);
    }
  }

  async function regenerateParagraph(draftId: string, index: number) {
    if (!active) return;
    const draft = active.drafts.find((d) => d.id === draftId);
    if (!draft) return;
    const paragraphs = splitDraftParagraphs(draft.contentMd);
    if (index < 0 || index >= paragraphs.length) return;
    setBusy(true);
    setErr(null);
    setStatus('Rewriting…');
    try {
      const { writerRegenParagraph } = await import('~/lib/llm/tasks');
      const next = await writerRegenParagraph({
        fullDraftMd: draft.contentMd,
        paragraphIndex: index,
        paragraphText: paragraphs[index],
        hint: regenHint.trim() || undefined,
        modelOverride: modelDraft || undefined,
      });
      const newMd = joinParagraphs(mergeParagraphs(paragraphs, index, next));
      const newDraft: WriterDraft = {
        id: crypto.randomUUID(),
        model: draft.model,
        contentMd: newMd,
        createdAt: new Date().toISOString(),
      };
      await storage.appendWriterDraft(active.id, newDraft);
      setRegenHint('');
      setRegenIndex(null);
      setStatus('Done.');
      refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setStatus(null);
    } finally {
      setBusy(false);
      setTimeout(() => setStatus(null), 1500);
    }
  }

  async function copyDraft(d: WriterDraft) {
    try {
      await navigator.clipboard.writeText(d.contentMd);
      setStatus('Copied.');
      setTimeout(() => setStatus(null), 1500);
    } catch {
      // ignore
    }
  }

  function exportDraft(d: WriterDraft) {
    const blob = new Blob([d.contentMd], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(active?.title || 'script').replace(/[^a-z0-9-_]+/gi, '_')}-${d.id.slice(0, 6)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const personaAvailable = !!persona;
  const llmConfigured = !!storage.getLLMProvider() && !!storage.getLLMKey();
  const models = modelOptions();

  return (
    <div className="flex h-full max-w-6xl gap-4">
      <aside className="w-64 shrink-0 border-r border-sky-100 pr-2 overflow-y-auto">
        <div className="space-y-2">
          <button
            type="button"
            onClick={createThread}
            className="w-full rounded bg-koko-pink-deep px-3 py-2 text-sm font-medium text-white hover:bg-pink-500"
          >
            + New thread
          </button>
          {threads.length === 0 ? (
            <p className="text-xs text-slate-500 px-1">No threads yet.</p>
          ) : (
            <ul className="space-y-1">
              {threads.map((t) => (
                <li key={t.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveId(t.id)}
                    className={`flex-1 text-left rounded px-2 py-1 text-xs ${
                      activeId === t.id ? 'bg-sky-100' : 'hover:bg-sky-50'
                    }`}
                  >
                    <div className="truncate font-medium">{t.title || 'Untitled'}</div>
                    <div className="text-[10px] text-slate-500">
                      {relativeTime(t.updatedAt)} · {t.drafts.length} draft{t.drafts.length === 1 ? '' : 's'}
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete thread ${t.title}`}
                    onClick={() => removeThread(t.id)}
                    className="rounded px-1 text-xs text-slate-400 hover:text-red-500"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto space-y-4">
        <header>
          <h1 className="text-xl font-display font-semibold">Writer</h1>
          <p className="text-sm text-slate-500">Single-shot script generation. Persona, databanks, and files become context.</p>
        </header>

        {!active ? (
          <div className="rounded border border-dashed border-sky-200 bg-white p-6 text-center text-sm text-slate-500">
            Pick a thread on the left, or start a new one.
          </div>
        ) : (
          <>
            <section className="space-y-3 rounded border border-sky-100 bg-white p-4">
              <label className="block text-xs font-medium text-slate-600">
                Title
                <input
                  type="text"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  className="mt-1 w-full rounded border border-sky-200 px-2 py-1 text-sm"
                />
              </label>

              <fieldset className="space-y-2">
                <legend className="text-xs font-medium text-slate-600">Context</legend>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={contextDraft.usePersona && personaAvailable}
                    disabled={!personaAvailable}
                    onChange={(e) => setContextDraft((c) => ({ ...c, usePersona: e.target.checked }))}
                  />
                  Use persona{' '}
                  <span className="text-slate-400">
                    ({personaAvailable ? (persona?.niche || '(configured)') : 'none configured'})
                  </span>
                </label>

                <div className="space-y-1">
                  <div className="text-xs text-slate-600">Databanks</div>
                  {databanks.length === 0 ? (
                    <p className="text-xs text-slate-400">No databanks yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {databanks.map((d) => {
                        const on = contextDraft.databankIds.includes(d.id);
                        return (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => toggleDatabank(d.id)}
                            className={`rounded-full px-2 py-0.5 text-xs ${
                              on ? 'bg-koko-sky text-slate-900' : 'border border-sky-200 text-slate-600 hover:bg-sky-50'
                            }`}
                          >
                            {d.name} ({d.videoRefs.length})
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="block text-xs text-slate-600">
                    Files (.txt/.md, ≤100 KB each, ≤500 KB total)
                    <input
                      type="file"
                      multiple
                      accept=".txt,.md,text/plain,text/markdown"
                      onChange={(e) => handleFiles(e.target.files)}
                      className="mt-1 block w-full text-xs"
                    />
                  </label>
                  {contextDraft.files.length > 0 && (
                    <ul className="space-y-1 text-xs">
                      {contextDraft.files.map((f) => (
                        <li key={f.name} className="flex items-center gap-1">
                          <span className="truncate">{f.name}</span>
                          <button
                            type="button"
                            onClick={() => removeFile(f.name)}
                            className="text-slate-400 hover:text-red-500"
                            aria-label={`Remove file ${f.name}`}
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </fieldset>

              <label className="block text-xs font-medium text-slate-600">
                Topic
                <textarea
                  value={topicDraft}
                  onChange={(e) => setTopicDraft(e.target.value)}
                  placeholder="What's the script about?"
                  className="mt-1 min-h-24 w-full rounded border border-sky-200 px-2 py-1 text-sm"
                />
              </label>

              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium text-slate-600">Flow</span>
                <button
                  type="button"
                  onClick={() => {
                    setMode('single');
                    setStep('idle');
                  }}
                  className={`rounded-full px-2 py-0.5 ${mode === 'single' ? 'bg-koko-sky text-slate-900' : 'border border-sky-200 text-slate-600 hover:bg-sky-50'}`}
                >
                  Single-shot
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('multi');
                    if (step === 'idle') setStep('clarify');
                  }}
                  className={`rounded-full px-2 py-0.5 ${mode === 'multi' ? 'bg-koko-sky text-slate-900' : 'border border-sky-200 text-slate-600 hover:bg-sky-50'}`}
                >
                  Guided (clarify → personalize → draft → iterate)
                </button>
              </div>

              <label className="block text-xs font-medium text-slate-600">
                Model
                <select
                  value={modelDraft}
                  onChange={(e) => setModelDraft(e.target.value)}
                  className="mt-1 w-full rounded border border-sky-200 px-2 py-1 text-sm"
                >
                  <option value="">Use Settings default</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>

              {mode === 'multi' && (
                <fieldset className="space-y-3 rounded border border-sky-200 bg-sky-50 p-3">
                  <legend className="text-xs font-semibold text-slate-700">Guided flow</legend>
                  <div className="flex flex-wrap gap-1 text-[10px]" role="tablist">
                    {(['clarify', 'personalize', 'draft', 'iterate'] as WriterStep[]).map((s, i) => (
                      <button
                        key={s}
                        type="button"
                        role="tab"
                        aria-selected={step === s}
                        onClick={() => setStep(s)}
                        className={`rounded-full px-2 py-0.5 ${step === s ? 'bg-koko-pink-deep text-white' : 'border border-sky-200 text-slate-600 hover:bg-white'}`}
                      >
                        {i + 1}. {s}
                      </button>
                    ))}
                  </div>

                  {step === 'clarify' && (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={runClarify}
                        disabled={busy || !llmConfigured || !topicDraft.trim()}
                        className="rounded border border-sky-200 bg-white px-2 py-1 text-xs hover:bg-sky-100 disabled:opacity-50"
                      >
                        {clarifyQuestions.length === 0 ? 'Generate questions' : 'Regenerate questions'}
                      </button>
                      {clarifyQuestions.length > 0 && (
                        <ul className="space-y-1">
                          {clarifyQuestions.map((q) => (
                            <li key={q} className="space-y-1">
                              <div className="text-xs text-slate-700">{q}</div>
                              <textarea
                                value={clarifyAnswers[q] ?? ''}
                                onChange={(e) =>
                                  setClarifyAnswers((c) => ({ ...c, [q]: e.target.value }))
                                }
                                aria-label={`Answer to: ${q}`}
                                className="min-h-10 w-full rounded border border-sky-200 px-2 py-1 text-xs"
                              />
                            </li>
                          ))}
                        </ul>
                      )}
                      <button
                        type="button"
                        onClick={() => setStep('personalize')}
                        className="rounded bg-koko-pink-deep px-2 py-1 text-xs text-white hover:bg-pink-500"
                      >
                        Next: personalize →
                      </button>
                    </div>
                  )}

                  {step === 'personalize' && (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={runPersonalize}
                        disabled={busy || !llmConfigured}
                        className="rounded border border-sky-200 bg-white px-2 py-1 text-xs hover:bg-sky-100 disabled:opacity-50"
                      >
                        {personalizationOptions.length === 0 ? 'Suggest twists' : 'Suggest more twists'}
                      </button>
                      {personalizationOptions.length > 0 && (
                        <ul className="space-y-1">
                          {personalizationOptions.map((o) => (
                            <li key={o} className="flex items-start gap-2 text-xs">
                              <input
                                type="radio"
                                id={`twist-${o.slice(0, 20)}`}
                                name="personalization"
                                checked={pickedOption === o}
                                onChange={() => setPickedOption(o)}
                              />
                              <label htmlFor={`twist-${o.slice(0, 20)}`}>{o}</label>
                            </li>
                          ))}
                          <li className="flex items-start gap-2 text-xs">
                            <input
                              type="radio"
                              id="twist-skip"
                              name="personalization"
                              checked={pickedOption === ''}
                              onChange={() => setPickedOption('')}
                            />
                            <label htmlFor="twist-skip">Skip — no specific twist</label>
                          </li>
                        </ul>
                      )}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setStep('clarify')}
                          className="rounded border border-sky-200 px-2 py-1 text-xs hover:bg-sky-100"
                        >
                          ← Back
                        </button>
                        <button
                          type="button"
                          onClick={() => setStep('draft')}
                          className="rounded bg-koko-pink-deep px-2 py-1 text-xs text-white hover:bg-pink-500"
                        >
                          Next: draft →
                        </button>
                      </div>
                    </div>
                  )}

                  {step === 'draft' && (
                    <div className="space-y-1 text-xs text-slate-600">
                      Press Generate below. Clarify answers + chosen twist will be appended to the prompt.
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setStep('personalize')}
                          className="rounded border border-sky-200 px-2 py-1 text-xs hover:bg-sky-100"
                        >
                          ← Back
                        </button>
                        <button
                          type="button"
                          onClick={() => setStep('iterate')}
                          className="rounded border border-sky-200 px-2 py-1 text-xs hover:bg-sky-100"
                          disabled={active.drafts.length === 0}
                        >
                          Skip to iterate →
                        </button>
                      </div>
                    </div>
                  )}

                  {step === 'iterate' && (
                    <div className="space-y-1 text-xs text-slate-600">
                      Click “Regenerate paragraph” on any block in the draft below. Add an optional hint to steer the rewrite.
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setStep('draft')}
                          className="rounded border border-sky-200 px-2 py-1 text-xs hover:bg-sky-100"
                        >
                          ← Back to draft
                        </button>
                      </div>
                    </div>
                  )}
                </fieldset>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={generate}
                  disabled={busy || !llmConfigured || !topicDraft.trim()}
                  className="rounded bg-koko-pink-deep px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 hover:bg-pink-500"
                >
                  {active.drafts.length === 0 ? 'Generate' : 'Regenerate'}
                </button>
                {!llmConfigured && (
                  <span className="text-xs text-slate-500">
                    Set an LLM key in Settings to enable generation.
                  </span>
                )}
                {status && <span className="text-xs text-slate-500">{status}</span>}
                {err && <span className="text-xs text-red-600">{err}</span>}
              </div>
            </section>

            <section className="space-y-3">
              {active.drafts.length === 0 ? (
                <p className="text-xs text-slate-500">No drafts yet.</p>
              ) : (
                [...active.drafts]
                  .reverse()
                  .map((d, di) => {
                    const isLatest = di === 0;
                    const paragraphs = splitDraftParagraphs(d.contentMd);
                    return (
                      <article key={d.id} className="rounded border border-sky-100 bg-white p-4 space-y-2">
                        <header className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span>{d.model}</span>
                          <span>·</span>
                          <span>{relativeTime(d.createdAt)}</span>
                          <span className="flex-1" />
                          <button
                            type="button"
                            onClick={() => copyDraft(d)}
                            className="rounded border border-sky-200 px-2 py-0.5 hover:bg-sky-50"
                          >
                            Copy
                          </button>
                          <button
                            type="button"
                            onClick={() => exportDraft(d)}
                            className="rounded border border-sky-200 px-2 py-0.5 hover:bg-sky-50"
                          >
                            Export .md
                          </button>
                        </header>

                        {mode === 'multi' && step === 'iterate' && isLatest ? (
                          <div className="space-y-2">
                            {paragraphs.map((p, idx) => (
                              <div key={idx} className="space-y-1 rounded border border-sky-100 p-2">
                                <MarkdownView source={p} />
                                {regenIndex === idx ? (
                                  <div className="space-y-1">
                                    <textarea
                                      value={regenHint}
                                      onChange={(e) => setRegenHint(e.target.value)}
                                      aria-label="Rewrite hint"
                                      placeholder="Optional hint (e.g. 'punchier opener')"
                                      className="min-h-10 w-full rounded border border-sky-200 px-2 py-1 text-xs"
                                    />
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => regenerateParagraph(d.id, idx)}
                                        disabled={busy}
                                        className="rounded bg-koko-pink-deep px-2 py-0.5 text-xs text-white hover:bg-pink-500 disabled:opacity-50"
                                      >
                                        Rewrite
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setRegenIndex(null);
                                          setRegenHint('');
                                        }}
                                        className="rounded border border-sky-200 px-2 py-0.5 text-xs hover:bg-sky-50"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setRegenIndex(idx)}
                                    className="text-[10px] text-koko-pink-deep hover:underline"
                                  >
                                    Regenerate paragraph
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <MarkdownView source={d.contentMd} />
                        )}
                      </article>
                    );
                  })
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
