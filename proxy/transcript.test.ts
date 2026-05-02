import { describe, it, expect } from 'vitest';
import { parseTimedTextXml } from './transcript';

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
