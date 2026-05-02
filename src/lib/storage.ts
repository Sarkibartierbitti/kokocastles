import type { Channel, DeepAnalysis, LLMProvider, PlatformId, TriageResult } from '../types';

const KEY = {
  llmKey: 'koko.llmKey',
  llmProvider: 'koko.llmProvider',
  llmModel: 'koko.llmModel',
  legacyAnthropicKey: 'koko.anthropicKey',
  youtubeKey: 'koko.youtubeKey',
  watchlist: 'koko.watchlist',
  triageCache: (platform: PlatformId, videoId: string) => `koko.triage.${platform}.${videoId}`,
  deepCache: (platform: PlatformId, videoId: string) => `koko.deep.${platform}.${videoId}`,
} as const;

function read<T>(k: string, fallback: T): T {
  try {
    const v = localStorage.getItem(k);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

function write<T>(k: string, v: T) {
  localStorage.setItem(k, JSON.stringify(v));
}

function migrateLegacyAnthropicKey(): void {
  const existing = read<string>(KEY.llmKey, '');
  if (existing) return;
  const legacy = read<string>(KEY.legacyAnthropicKey, '');
  if (!legacy) return;
  write(KEY.llmKey, legacy);
  write(KEY.llmProvider, 'anthropic' satisfies LLMProvider);
}

migrateLegacyAnthropicKey();

export const storage = {
  getLLMKey: () => read<string>(KEY.llmKey, ''),
  setLLMKey: (v: string) => write(KEY.llmKey, v),

  getLLMProvider: () => read<LLMProvider | ''>(KEY.llmProvider, ''),
  setLLMProvider: (v: LLMProvider | '') => write(KEY.llmProvider, v),

  getLLMModel: () => read<string>(KEY.llmModel, ''),
  setLLMModel: (v: string) => write(KEY.llmModel, v),

  getYoutubeKey: () => read<string>(KEY.youtubeKey, ''),
  setYoutubeKey: (v: string) => write(KEY.youtubeKey, v),

  getWatchlist: () => read<Channel[]>(KEY.watchlist, []),
  setWatchlist: (v: Channel[]) => write(KEY.watchlist, v),
  addToWatchlist: (c: Channel) => {
    const list = storage.getWatchlist();
    if (!list.find((x) => x.platform === c.platform && x.channelId === c.channelId)) {
      list.push(c);
      storage.setWatchlist(list);
    }
  },
  removeFromWatchlist: (platform: PlatformId, channelId: string) => {
    storage.setWatchlist(storage.getWatchlist().filter((c) => !(c.platform === platform && c.channelId === channelId)));
  },

  getTriage: (platform: PlatformId, videoId: string) =>
    read<TriageResult | null>(KEY.triageCache(platform, videoId), null),
  setTriage: (platform: PlatformId, videoId: string, r: TriageResult) =>
    write(KEY.triageCache(platform, videoId), r),

  getDeep: (platform: PlatformId, videoId: string) =>
    read<DeepAnalysis | null>(KEY.deepCache(platform, videoId), null),
  setDeep: (platform: PlatformId, videoId: string, r: DeepAnalysis) =>
    write(KEY.deepCache(platform, videoId), r),
};
