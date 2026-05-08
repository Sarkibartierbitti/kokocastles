import type { Databank, DatabankVideoRef, PlatformId } from '~/types';

export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'Name is required';
  if (trimmed.length > 80) return 'Name must be 80 characters or fewer';
  return null;
}

export function refKey(ref: DatabankVideoRef | { platform: PlatformId; videoId: string }): string {
  return `${ref.platform}::${ref.videoId}`;
}

export function dedupeRefs(refs: DatabankVideoRef[]): DatabankVideoRef[] {
  const seen = new Set<string>();
  const out: DatabankVideoRef[] = [];
  for (const r of refs) {
    const k = refKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

export function findById(dbs: Databank[], id: string): Databank | null {
  return dbs.find((d) => d.id === id) ?? null;
}

export function buildIndex(dbs: Databank[]): Map<string, Set<string>> {
  const idx = new Map<string, Set<string>>();
  for (const db of dbs) {
    for (const r of db.videoRefs) {
      const k = refKey(r);
      const s = idx.get(k) ?? new Set<string>();
      s.add(db.id);
      idx.set(k, s);
    }
  }
  return idx;
}

export function newDatabank(name: string): Databank {
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    createdAt: new Date().toISOString(),
    videoRefs: [],
  };
}
