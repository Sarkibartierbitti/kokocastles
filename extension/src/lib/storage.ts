import type { Channel, DeepAnalysis, LLMModelId, LLMProvider, PlatformId, TriageResult } from '~/types';

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
} as const;

const cache = new Map<string, unknown>();
let hydrated = false;

async function hydrate(): Promise<void> {
  if (hydrated) return;
  const all = await browser.storage.local.get(null);
  for (const [k, v] of Object.entries(all)) cache.set(k, v);
  hydrated = true;
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
};

export type { LLMModelId, LLMProvider, PlatformId };
