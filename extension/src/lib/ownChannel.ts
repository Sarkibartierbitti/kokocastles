import { storage } from './storage';
import { youtubeAdapter } from './platforms/youtube';
import type { Hypothesis, Video } from '../types';

export function applyHypothesisTagging(
  prevSnapshotIds: string[],
  nextSnapshot: Video[],
  hypotheses: Hypothesis[]
): { hypotheses: Hypothesis[]; tagged: Record<string, string[]> } {
  const prev = new Set(prevSnapshotIds);
  const newlyAddedInOrder = nextSnapshot
    .map((v) => v.videoId)
    .filter((id) => !prev.has(id));
  const tagged: Record<string, string[]> = {};
  const out: Hypothesis[] = hypotheses.map((h) => {
    const remaining = Math.max(0, h.applyToNext - h.appliedAuto.length);
    if (remaining === 0) return h;
    const candidates = newlyAddedInOrder
      .filter((id) => !h.seedSnapshotIds.includes(id))
      .filter((id) => !h.appliedAuto.includes(id))
      .filter((id) => !h.manualVideoIds.includes(id))
      .slice(0, remaining);
    if (candidates.length === 0) return h;
    tagged[h.id] = candidates;
    return { ...h, appliedAuto: [...h.appliedAuto, ...candidates] };
  });
  return { hypotheses: out, tagged };
}

export interface RefreshResult {
  added: string[];
  totalNow: number;
}

export async function refreshOwnChannel(): Promise<RefreshResult> {
  const own = storage.getOwnChannel();
  if (!own) throw new Error('No own channel linked.');
  const prev = storage.getOwnChannelVideos();
  const prevIds = prev.map((v) => v.videoId);
  const next = await youtubeAdapter.recentUploads(own.channelId, 50);
  const { hypotheses, tagged } = applyHypothesisTagging(prevIds, next, storage.getHypotheses());
  if (Object.keys(tagged).length > 0) {
    for (const h of hypotheses) {
      const before = storage.getHypotheses().find((x) => x.id === h.id);
      if (!before || JSON.stringify(before.appliedAuto) !== JSON.stringify(h.appliedAuto)) {
        await storage.upsertHypothesis(h);
      }
    }
  }
  await storage.setOwnChannelVideos(next);
  await storage.setOwnChannelRefreshedAt(new Date().toISOString());
  const added = next.map((v) => v.videoId).filter((id) => !prevIds.includes(id));
  return { added, totalNow: next.length };
}
