import { describe, it, expect } from 'vitest';
import { parseTikTokProfile, parseHandleFromUrl } from '../platforms/tiktok';

const PAYLOAD = {
  __DEFAULT_SCOPE__: {
    'webapp.user-detail': {
      userInfo: {
        user: { uniqueId: 'cooluser', nickname: 'Cool User' },
        itemList: [
          {
            id: '111',
            desc: 'first tt',
            createTime: 1746140000,
            stats: { playCount: 5000 },
            video: { cover: 'https://cdn/a.jpg', duration: 22 },
          },
          {
            id: '222',
            desc: 'second tt',
            createTime: 1746240000,
            stats: { playCount: 99 },
            video: { cover: 'https://cdn/b.jpg' },
          },
        ],
      },
    },
  },
};

const FIXTURE_HTML = `
<html>
<head></head>
<body>
<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">
${JSON.stringify(PAYLOAD)}
</script>
</body>
</html>
`;

describe('parseTikTokProfile', () => {
  it('extracts channel + videos from data blob', () => {
    const r = parseTikTokProfile(FIXTURE_HTML);
    expect(r.channelId).toBe('cooluser');
    expect(r.channelTitle).toBe('Cool User');
    expect(r.videos).toHaveLength(2);
    expect(r.videos[0]).toMatchObject({
      videoId: '111',
      title: 'first tt',
      viewCount: 5000,
      thumbnailUrl: 'https://cdn/a.jpg',
      durationSec: 22,
    });
  });

  it('empty / malformed blob returns empty videos', () => {
    expect(parseTikTokProfile('').videos).toEqual([]);
    expect(
      parseTikTokProfile(
        '<html><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">not json</script></html>'
      ).videos
    ).toEqual([]);
  });
});

describe('parseHandleFromUrl (tiktok)', () => {
  it('prefixes with @ for bare handles', () => {
    expect(parseHandleFromUrl('cooluser')).toBe('@cooluser');
    expect(parseHandleFromUrl('@bareuser')).toBe('@bareuser');
  });

  it('extracts from URL', () => {
    expect(parseHandleFromUrl('https://www.tiktok.com/@cooluser')).toBe('@cooluser');
  });
});
