import type { Channel, Databank, DatabankVideoRef, DeepAnalysis, Hypothesis, Idea, LLMModelId, LLMProvider, Persona, PlatformId, ScrapedVideoCacheEntry, TranscriptSegment, TriageResult, Video, WriterDraft, WriterThread } from '~/types';
import { buildIndex, dedupeRefs, newDatabank, refKey, validateName } from './databanks';
import { normalizeHookCategory, type HookCategory } from './hookCategories';

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
  hiddenPrefix: 'koko.hidden.',
  ideas: 'koko.ideas',
  ytQuotaToday: 'koko.ytQuotaToday',
  writerThreads: 'koko.writerThreads',
  hypotheses: 'koko.hypotheses',
  ownChannelVideos: 'koko.ownChannelVideos',
  ownChannelRefreshedAt: 'koko.ownChannelRefreshedAt',
  hookCategoryPrefix: 'koko.hookCategory.',
  platformsEnabled: 'koko.platformsEnabled',
  platformWarnPrefix: 'koko.platformWarn.',
  framesEnabled: 'koko.framesEnabled',
  framePrefix: 'koko.frame.',
  scrapedVideos: 'koko.scrapedVideos',
} as const;

export interface PlatformsEnabled {
  instagram: boolean;
  tiktok: boolean;
}

export interface YtQuotaToday {
  date: string;       // YYYY-MM-DD UTC
  unitsUsed: number;
}

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
function hiddenKey(p: PlatformId, id: string) { return `${KEY.hiddenPrefix}${p}.${id}`; }
function hookCategoryKey(p: PlatformId, id: string) { return `${KEY.hookCategoryPrefix}${p}.${id}`; }
function frameKey(p: PlatformId, id: string) { return `${KEY.framePrefix}${p}.${id}`; }

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

  isHiddenVideo: (platform: PlatformId, videoId: string): boolean => {
    return cache.get(hiddenKey(platform, videoId)) === true;
  },
  hideVideo: (platform: PlatformId, videoId: string) =>
    writeThrough(hiddenKey(platform, videoId), true),
  unhideVideo: async (platform: PlatformId, videoId: string) => {
    const k = hiddenKey(platform, videoId);
    cache.delete(k);
    await browser.storage.local.remove(k);
  },
  getAllHiddenKeys: (): Set<string> => {
    const out = new Set<string>();
    for (const [k, v] of cache.entries()) {
      if (!k.startsWith(KEY.hiddenPrefix) || v !== true) continue;
      const rest = k.slice(KEY.hiddenPrefix.length);
      const dot = rest.indexOf('.');
      if (dot < 0) continue;
      out.add(`${rest.slice(0, dot)}::${rest.slice(dot + 1)}`);
    }
    return out;
  },

  getIdeas: () => getCached<Idea[]>(KEY.ideas, []),

  addIdeas: async (newOnes: Idea[]) => {
    const list = [...storage.getIdeas(), ...newOnes];
    await writeThrough(KEY.ideas, list);
  },

  moveIdeaBucket: async (id: string, bucket: 'inbox' | 'shortlist') => {
    const list = storage.getIdeas().map((i) => (i.id === id ? { ...i, bucket } : i));
    await writeThrough(KEY.ideas, list);
  },

  deleteIdea: async (id: string) => {
    const list = storage.getIdeas().filter((i) => i.id !== id);
    await writeThrough(KEY.ideas, list);
  },

  getYtQuotaToday: (): YtQuotaToday => {
    const today = new Date().toISOString().slice(0, 10);
    const v = getCached<YtQuotaToday>(KEY.ytQuotaToday, { date: today, unitsUsed: 0 });
    if (v.date !== today) return { date: today, unitsUsed: 0 };
    return v;
  },
  bumpYtQuotaToday: async (units: number): Promise<void> => {
    const cur = storage.getYtQuotaToday();
    const next: YtQuotaToday = { date: cur.date, unitsUsed: cur.unitsUsed + units };
    await writeThrough(KEY.ytQuotaToday, next);
  },

  getWriterThreads: () => getCached<WriterThread[]>(KEY.writerThreads, []),

  upsertWriterThread: async (t: WriterThread): Promise<void> => {
    const list = storage.getWriterThreads();
    const i = list.findIndex((x) => x.id === t.id);
    const next = i >= 0 ? list.map((x, idx) => (idx === i ? t : x)) : [t, ...list];
    next.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    await writeThrough(KEY.writerThreads, next.slice(0, 50));
  },

  deleteWriterThread: async (id: string): Promise<void> => {
    const list = storage.getWriterThreads().filter((t) => t.id !== id);
    await writeThrough(KEY.writerThreads, list);
  },

  appendWriterDraft: async (threadId: string, draft: WriterDraft): Promise<void> => {
    const list = storage.getWriterThreads();
    const next = list.map((t) =>
      t.id === threadId
        ? { ...t, drafts: [...t.drafts, draft], updatedAt: new Date().toISOString() }
        : t
    );
    await writeThrough(KEY.writerThreads, next);
  },

  getHypotheses: () => getCached<Hypothesis[]>(KEY.hypotheses, []),

  upsertHypothesis: async (h: Hypothesis): Promise<void> => {
    const list = storage.getHypotheses();
    const i = list.findIndex((x) => x.id === h.id);
    const next = i >= 0 ? list.map((x, idx) => (idx === i ? h : x)) : [h, ...list];
    await writeThrough(KEY.hypotheses, next);
  },

  deleteHypothesis: async (id: string): Promise<void> => {
    const list = storage.getHypotheses().filter((h) => h.id !== id);
    await writeThrough(KEY.hypotheses, list);
  },

  getOwnChannelVideos: () => getCached<Video[]>(KEY.ownChannelVideos, []),
  setOwnChannelVideos: (v: Video[]) => writeThrough(KEY.ownChannelVideos, v),

  getOwnChannelRefreshedAt: () => getCached<string>(KEY.ownChannelRefreshedAt, ''),
  setOwnChannelRefreshedAt: (v: string) => writeThrough(KEY.ownChannelRefreshedAt, v),

  getHookCategory: (platform: PlatformId, videoId: string): HookCategory | null => {
    const v = getCached<string | undefined>(hookCategoryKey(platform, videoId), undefined);
    if (!v) return null;
    return normalizeHookCategory(v);
  },

  setHookCategory: (platform: PlatformId, videoId: string, category: HookCategory) =>
    writeThrough(hookCategoryKey(platform, videoId), category),

  getPlatformsEnabled: (): PlatformsEnabled =>
    getCached<PlatformsEnabled>(KEY.platformsEnabled, { instagram: false, tiktok: false }),

  setPlatformsEnabled: (v: PlatformsEnabled) => writeThrough(KEY.platformsEnabled, v),

  getPlatformWarn: (p: PlatformId): string | null =>
    getCached<string | null>(`${KEY.platformWarnPrefix}${p}`, null),

  setPlatformWarn: (p: PlatformId, msg: string | null) =>
    writeThrough(`${KEY.platformWarnPrefix}${p}`, msg),

  getFramesEnabled: () => getCached<boolean>(KEY.framesEnabled, false),
  setFramesEnabled: (v: boolean) => writeThrough(KEY.framesEnabled, v),

  getFrame: (p: PlatformId, id: string): string =>
    getCached<string>(frameKey(p, id), ''),
  setFrame: (p: PlatformId, id: string, dataUrl: string) =>
    writeThrough(frameKey(p, id), dataUrl),

  getScrapedVideos: (): Record<string, ScrapedVideoCacheEntry> =>
    getCached<Record<string, ScrapedVideoCacheEntry>>(KEY.scrapedVideos, {}),

  getScrapedVideo: (platform: PlatformId, videoId: string): ScrapedVideoCacheEntry | null => {
    const map = getCached<Record<string, ScrapedVideoCacheEntry>>(KEY.scrapedVideos, {});
    return map[`${platform}::${videoId}`] ?? null;
  },

  setScrapedVideos: async (entries: ScrapedVideoCacheEntry[]): Promise<void> => {
    const map = { ...getCached<Record<string, ScrapedVideoCacheEntry>>(KEY.scrapedVideos, {}) };
    for (const e of entries) map[`${e.platform}::${e.videoId}`] = e;
    await writeThrough(KEY.scrapedVideos, map);
  },

  getAllFrames: (): Map<string, string> => {
    const out = new Map<string, string>();
    for (const [k, v] of cache.entries()) {
      if (!k.startsWith(KEY.framePrefix)) continue;
      const rest = k.slice(KEY.framePrefix.length);
      const dot = rest.indexOf('.');
      if (dot < 0) continue;
      const platform = rest.slice(0, dot);
      const videoId = rest.slice(dot + 1);
      out.set(`${platform}::${videoId}`, String(v));
    }
    return out;
  },

  getAllHookCategories: (): Map<string, HookCategory> => {
    const out = new Map<string, HookCategory>();
    for (const [k, v] of cache.entries()) {
      if (!k.startsWith(KEY.hookCategoryPrefix)) continue;
      const rest = k.slice(KEY.hookCategoryPrefix.length);
      const dot = rest.indexOf('.');
      if (dot < 0) continue;
      const platform = rest.slice(0, dot);
      const videoId = rest.slice(dot + 1);
      out.set(`${platform}::${videoId}`, normalizeHookCategory(String(v)));
    }
    return out;
  },
};

export type { LLMModelId, LLMProvider, PlatformId };
