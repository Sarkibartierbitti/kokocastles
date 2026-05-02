import { describe, it, expect } from 'vitest';
import { parseTimedTextXml, parseJson3 } from './transcript';

describe('parseTimedTextXml', () => {
  it('parses start, dur, text', () => {
    const xml = `<?xml version="1.0" encoding="utf-8" ?><transcript>
<text start="0" dur="1.5">hello</text>
<text start="1.5" dur="2">world &amp; friends</text>
</transcript>`;
    const segs = parseTimedTextXml(xml);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toEqual({ start: 0, dur: 1.5, text: 'hello' });
    expect(segs[1].text).toBe('world & friends');
  });
  it('decodes html entities', () => {
    const xml = `<text start="0" dur="1">it&#39;s &quot;fine&quot;</text>`;
    expect(parseTimedTextXml(xml)[0].text).toBe(`it's "fine"`);
  });
  it('returns [] when no <text> nodes', () => {
    expect(parseTimedTextXml('<x/>')).toEqual([]);
  });
});

describe('parseJson3', () => {
  it('parses events with tStartMs, dDurationMs, and segs', () => {
    const body = JSON.stringify({
      events: [
        { tStartMs: 0, dDurationMs: 1500, segs: [{ utf8: 'hello' }] },
        { tStartMs: 1500, dDurationMs: 2000, segs: [{ utf8: 'world & ' }, { utf8: 'friends' }] },
      ],
    });
    const segs = parseJson3(body);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toEqual({ start: 0, dur: 1.5, text: 'hello' });
    expect(segs[1]).toEqual({ start: 1.5, dur: 2, text: 'world & friends' });
  });
  it('skips events lacking segs or timing', () => {
    const body = JSON.stringify({
      events: [
        { tStartMs: 0, dDurationMs: 1000 },
        { segs: [{ utf8: 'orphan' }] },
        { tStartMs: 0, dDurationMs: 500, segs: [{ utf8: '   ' }] },
      ],
    });
    expect(parseJson3(body)).toEqual([]);
  });
});
