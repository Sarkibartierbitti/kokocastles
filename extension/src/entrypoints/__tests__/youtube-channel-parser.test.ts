import { describe, it, expect } from 'vitest';
import { parseVideoRenderer, extractVideoItems } from '../youtube-channel.content';
import lockupSample from '../__fixtures__/lockupViewModel.sample.json';

describe('parseVideoRenderer — lockupViewModel', () => {
  it('extracts videoId, title, viewCount, durationSec, thumbnail from lockupViewModel', () => {
    const v = parseVideoRenderer({ lockupViewModel: lockupSample });
    expect(v).not.toBeNull();
    expect(v!.videoId).toBe('VrDknUDsrUk');
    expect(v!.title).toBe('Linnea, do not listen to this man...');
    expect(v!.viewCount).toBe(45000);
    expect(v!.durationSec).toBe(26);
    expect(v!.publishedAtRelative).toBe('3 weeks ago');
    expect(v!.thumbnailUrl).toBe('https://i.ytimg.com/vi/VrDknUDsrUk/hq.jpg?w=336');
  });

  it('skips lockupViewModel with non-VIDEO contentType', () => {
    const v = parseVideoRenderer({
      lockupViewModel: { ...lockupSample, contentType: 'LOCKUP_CONTENT_TYPE_PLAYLIST' },
    });
    expect(v).toBeNull();
  });

  it('still parses legacy videoRenderer shape', () => {
    const v = parseVideoRenderer({
      videoRenderer: {
        videoId: 'abc123',
        title: { runs: [{ text: 'old shape' }] },
        viewCountText: { simpleText: '1.2K views' },
        publishedTimeText: { simpleText: '2 days ago' },
        thumbnail: { thumbnails: [{ url: 'https://example.com/t1.jpg' }, { url: 'https://example.com/t2.jpg' }] },
        lengthText: { simpleText: '1:23' },
      },
    });
    expect(v).not.toBeNull();
    expect(v!.videoId).toBe('abc123');
    expect(v!.title).toBe('old shape');
    expect(v!.viewCount).toBe(1200);
    expect(v!.durationSec).toBe(83);
  });

  it('extractVideoItems collects richItemRenderer + lockupViewModel + videoRenderer', () => {
    const tab = {
      content: {
        items: [
          { richItemRenderer: { content: { lockupViewModel: lockupSample } } },
          { gridVideoRenderer: { videoId: 'g1' } },
          { other: { videoRenderer: { videoId: 'v1' } } },
        ],
      },
    };
    const items = extractVideoItems(tab);
    expect(items.length).toBeGreaterThanOrEqual(3);
  });
});
