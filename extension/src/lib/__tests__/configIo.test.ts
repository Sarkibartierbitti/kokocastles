import { describe, it, expect } from 'vitest';
import { filterExportable, buildBundle, parseBundle } from '../configIo';

describe('filterExportable', () => {
  it('keeps koko.* user-owned keys', () => {
    const r = filterExportable({
      'koko.llmKey': 'sk-x',
      'koko.persona': { niche: 'x' },
      'koko.watchlist': [{ id: 'c' }],
      'other.unrelated': 1,
    });
    expect(Object.keys(r).sort()).toEqual(['koko.llmKey', 'koko.persona', 'koko.watchlist']);
  });

  it('strips large per-video caches', () => {
    const r = filterExportable({
      'koko.llmKey': 'sk-x',
      'koko.deep.youtube.v1': { hook: {} },
      'koko.transcript.youtube.v1': [],
      'koko.frame.youtube.v1': 'data:...',
      'koko.hookCategory.youtube.v1': 'Listicle',
      'koko.hidden.youtube.v1': true,
      'koko.platformWarn.instagram': 'msg',
      'koko.ytQuotaToday': { date: '', unitsUsed: 0 },
    });
    expect(Object.keys(r)).toEqual(['koko.llmKey']);
  });
});

describe('buildBundle / parseBundle', () => {
  it('round-trips', () => {
    const bundle = buildBundle({ 'koko.llmKey': 'sk-x', 'koko.persona': { niche: 'x' } });
    expect(bundle.version).toBe(1);
    const parsed = parseBundle(JSON.stringify(bundle));
    expect(parsed.entries['koko.llmKey']).toBe('sk-x');
  });

  it('rejects bad version', () => {
    expect(() => parseBundle(JSON.stringify({ version: 99, entries: {} }))).toThrow(/version/i);
  });

  it('rejects non-koko keys', () => {
    expect(() =>
      parseBundle(JSON.stringify({ version: 1, entries: { 'evil.key': 1 } }))
    ).toThrow(/koko\./);
  });

  it('rejects malformed JSON', () => {
    expect(() => parseBundle('{not-json')).toThrow();
  });
});
