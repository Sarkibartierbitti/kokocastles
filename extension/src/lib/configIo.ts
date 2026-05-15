/**
 * Dev config import/export. Dumps the small, user-owned slice of
 * browser.storage.local (keys, watchlist, persona, ownChannel, hypotheses,
 * databanks, ideas, writer threads, settings, platform flags). Skips large
 * per-video caches so the file stays under ~100 KB.
 */

/** Prefixes excluded from export — they are recomputable from sources. */
const EXCLUDE_PREFIXES = [
  'koko.triage.',
  'koko.deep.',
  'koko.transcript.',
  'koko.hookCategory.',
  'koko.frame.',
  'koko.hidden.',
  'koko.platformWarn.',
  'koko.ytQuotaToday',
];

export interface ConfigBundle {
  version: 1;
  exportedAt: string;
  entries: Record<string, unknown>;
}

export function filterExportable(all: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(all)) {
    if (!k.startsWith('koko.')) continue;
    if (EXCLUDE_PREFIXES.some((p) => k.startsWith(p))) continue;
    out[k] = v;
  }
  return out;
}

export function buildBundle(all: Record<string, unknown>): ConfigBundle {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    entries: filterExportable(all),
  };
}

export function parseBundle(json: string): ConfigBundle {
  const j = JSON.parse(json);
  if (!j || typeof j !== 'object') throw new Error('Invalid bundle: not an object.');
  if (j.version !== 1) throw new Error(`Unsupported bundle version: ${j.version}`);
  if (!j.entries || typeof j.entries !== 'object') throw new Error('Invalid bundle: missing entries.');
  for (const k of Object.keys(j.entries)) {
    if (!k.startsWith('koko.')) throw new Error(`Invalid bundle: bad key "${k}" (must start with koko.)`);
  }
  return j as ConfigBundle;
}
