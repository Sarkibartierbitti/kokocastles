import type { Channel, Databank, DatabankVideoRef, DeepAnalysis, LLMModelId, LLMProvider, Persona, PlatformId, TranscriptSegment, TriageResult } from '~/types';
import { buildIndex, dedupeRefs, newDatabank, refKey, validateName } from './databanks';

declare const browser: {
  storage: {
    local: {
      get: (keys?: string | string[] | null) => Promise<Record<string, unknown>>;
      set: (items: Record<string, unknown>) => Promise<void>;
      remove: (keys: string | string[]) => Promise<void>;
    };
  };
};

const KEY = {
  llmKey: 'koko.llmKey',
  llmProvider: 'koko.llmProvider',
  llmModel: 'koko.llmModel',
  youtubeKey: 'koko.youtubeKey',
  watchlist: 'koko.watchlist',
  triagePrefix: 'koko.triage.',
  deepPrefix: 'koko.deep.',
  transcriptPrefix: 'koko.transcript.',
  persona: 'koko.persona',
  outlierThreshold: 'koko.outlierThreshold',
  ownChannel: 'koko.ownChannel',
  refreshIntervalHours: 'koko.refreshIntervalHours',
  throttleConcurrency: 'koko.throttleConcurrency',
  throttleJitterMs: 'koko.throttleJitterMs',
  cacheLruCap: 'koko.cacheLruCap',
  databanks: 'koko.databanks',
} as const;

const cache = new Map<string, unknown>();
let hydrated = false;

async function hydrate(): Promise<void> {
  if (hydrated) return;
  const all = await browser.storage.local.get(null);
  for (const [k, v] of Object.entries(all)) cache.set(k, v);
  hydrated = true;
  rebuildDatabankIndex();
}

function getCached<T>(key: string, fallback: T): T {
  if (!cache.has(key)) return fallback;
  return cache.get(key) as T;
}

async function writeThrough<T>(key: string, value: T): Promise<void> {
  cache.set(key, value);
  await browser.storage.local.set({ [key]: value });
}

function triageKey(p: PlatformId, id: string) { return `${KEY.triagePrefix}${p}.${id}`; }
function deepKey(p: PlatformId, id: string) { return `${KEY.deepPrefix}${p}.${id}`; }
function transcriptKey(p: PlatformId, id: string) { return `${KEY.transcriptPrefix}${p}.${id}`; }

let databankIndex: Map<string, Set<string>> = new Map();

function rebuildDatabankIndex() {
  const list = getCached<Databank[]>(KEY.databanks, []);
  databankIndex = buildIndex(list);
}

export const storage = {
  hydrate,

  getLLMKey: () => getCached<string>(KEY.llmKey, ''),
  setLLMKey: (v: string) => writeThrough(KEY.llmKey, v),

  getLLMProvider: () => getCached<LLMProvider | ''>(KEY.llmProvider, ''),
  setLLMProvider: (v: LLMProvider | '') => writeThrough(KEY.llmProvider, v),

  getLLMModel: () => getCached<string>(KEY.llmModel, ''),
  setLLMModel: (v: string) => writeThrough(KEY.llmModel, v),

  getYoutubeKey: () => getCached<string>(KEY.youtubeKey, ''),
  setYoutubeKey: (v: string) => writeThrough(KEY.youtubeKey, v),

  getWatchlist: () => getCached<Channel[]>(KEY.watchlist, []),
  setWatchlist: (v: Channel[]) => writeThrough(KEY.watchlist, v),
  addToWatchlist: async (c: Channel) => {
    const list = storage.getWatchlist();
    if (!list.find((x) => x.platform === c.platform && x.channelId === c.channelId)) {
      list.push(c);
      await writeThrough(KEY.watchlist, list);
    }
  },
  removeFromWatchlist: async (platform: PlatformId, channelId: string) => {
    const list = storage.getWatchlist().filter((c) => !(c.platform === platform && c.channelId === channelId));
    await writeThrough(KEY.watchlist, list);
  },

  getTriage: async (platform: PlatformId, videoId: string): Promise<TriageResult | null> => {
    const k = triageKey(platform, videoId);
    if (cache.has(k)) return (cache.get(k) ?? null) as TriageResult | null;
    const r = await browser.storage.local.get(k);
    const v = (r[k] ?? null) as TriageResult | null;
    cache.set(k, v);
    return v;
  },
  setTriage: (platform: PlatformId, videoId: string, r: TriageResult) =>
    writeThrough(triageKey(platform, videoId), r),

  getDeep: async (platform: PlatformId, videoId: string): Promise<DeepAnalysis | null> => {
    const k = deepKey(platform, videoId);
    if (cache.has(k)) return (cache.get(k) ?? null) as DeepAnalysis | null;
    const r = await browser.storage.local.get(k);
    const v = (r[k] ?? null) as DeepAnalysis | null;
    cache.set(k, v);
    return v;
  },
  setDeep: (platform: PlatformId, videoId: string, r: DeepAnalysis) =>
    writeThrough(deepKey(platform, videoId), r),

  getPersona: () => getCached<Persona>(KEY.persona, { niche: '', context: '', styleSample: '', attachedDatabankIds: [] }),
  setPersona: (v: Persona) => writeThrough(KEY.persona, v),

  getOutlierThreshold: () => getCached<number>(KEY.outlierThreshold, 1.5),
  setOutlierThreshold: (v: number) => writeThrough(KEY.outlierThreshold, v),

  getOwnChannel: () => getCached<Channel | null>(KEY.ownChannel, null),
  setOwnChannel: (v: Channel | null) => writeThrough(KEY.ownChannel, v),

  getRefreshIntervalHours: () => getCached<number>(KEY.refreshIntervalHours, 6),
  setRefreshIntervalHours: (v: number) => writeThrough(KEY.refreshIntervalHours, v),

  getThrottleConcurrency: () => getCached<number>(KEY.throttleConcurrency, 2),
  setThrottleConcurrency: (v: number) => writeThrough(KEY.throttleConcurrency, v),

  getThrottleJitterMs: () => getCached<number>(KEY.throttleJitterMs, 2500),
  setThrottleJitterMs: (v: number) => writeThrough(KEY.throttleJitterMs, v),

  getCacheLruCap: () => getCached<number>(KEY.cacheLruCap, 10000),
  setCacheLruCap: (v: number) => writeThrough(KEY.cacheLruCap, v),

  getDatabanks: () => getCached<Databank[]>(KEY.databanks, []),

  getDatabankIndex: () => databankIndex,

  createDatabank: async (name: string): Promise<Databank> => {
    const err = validateName(name);
    if (err) throw new Error(err);
    const list = storage.getDatabanks();
    const db = newDatabank(name);
    list.push(db);
    await writeThrough(KEY.databanks, list);
    rebuildDatabankIndex();
    return db;
  },

  renameDatabank: async (id: string, name: string): Promise<void> => {
    const err = validateName(name);
    if (err) throw new Error(err);
    const list = storage.getDatabanks().map((d) => (d.id === id ? { ...d, name: name.trim() } : d));
    await writeThrough(KEY.databanks, list);
  },

  deleteDatabank: async (id: string): Promise<void> => {
    const list = storage.getDatabanks().filter((d) => d.id !== id);
    await writeThrough(KEY.databanks, list);
    rebuildDatabankIndex();
  },

  addToDatabank: async (id: string, ref: { platform: PlatformId; videoId: string }): Promise<void> => {
    const newRef: DatabankVideoRef = { ...ref, addedAt: new Date().toISOString() };
    const list = storage.getDatabanks().map((d) =>
      d.id === id ? { ...d, videoRefs: dedupeRefs([...d.videoRefs, newRef]) } : d
    );
    await writeThrough(KEY.databanks, list);
    rebuildDatabankIndex();
  },

  removeFromDatabank: async (id: string, ref: { platform: PlatformId; videoId: string }): Promise<void> => {
    const k = refKey(ref);
    const list = storage.getDatabanks().map((d) =>
      d.id === id ? { ...d, videoRefs: d.videoRefs.filter((r) => refKey(r) !== k) } : d
    );
    await writeThrough(KEY.databanks, list);
    rebuildDatabankIndex();
  },

  getTranscript: async (platform: PlatformId, videoId: string): Promise<TranscriptSegment[] | null> => {
    const k = transcriptKey(platform, videoId);
    if (cache.has(k)) return (cache.get(k) ?? null) as TranscriptSegment[] | null;
    const r = await browser.storage.local.get(k);
    const v = (r[k] ?? null) as TranscriptSegment[] | null;
    cache.set(k, v);
    return v;
  },
  setTranscript: (platform: PlatformId, videoId: string, segs: TranscriptSegment[]) =>
    writeThrough(transcriptKey(platform, videoId), segs),

  getAllDeepEntries: (): Array<{ platform: PlatformId; videoId: string; deep: DeepAnalysis }> => {
    const out: Array<{ platform: PlatformId; videoId: string; deep: DeepAnalysis }> = [];
    for (const [k, v] of cache.entries()) {
      if (!k.startsWith(KEY.deepPrefix)) continue;
      const rest = k.slice(KEY.deepPrefix.length);
      const dot = rest.indexOf('.');
      if (dot < 0) continue;
      const platform = rest.slice(0, dot) as PlatformId;
      const videoId = rest.slice(dot + 1);
      if (v) out.push({ platform, videoId, deep: v as DeepAnalysis });
    }
    return out;
  },

  getAllTranscriptEntries: (): Array<{ platform: PlatformId; videoId: string; segments: TranscriptSegment[] }> => {
    const out: Array<{ platform: PlatformId; videoId: string; segments: TranscriptSegment[] }> = [];
    for (const [k, v] of cache.entries()) {
      if (!k.startsWith(KEY.transcriptPrefix)) continue;
      const rest = k.slice(KEY.transcriptPrefix.length);
      const dot = rest.indexOf('.');
      if (dot < 0) continue;
      const platform = rest.slice(0, dot) as PlatformId;
      const videoId = rest.slice(dot + 1);
      if (v) out.push({ platform, videoId, segments: v as TranscriptSegment[] });
    }
    return out;
  },
};

export type { LLMModelId, LLMProvider, PlatformId };
