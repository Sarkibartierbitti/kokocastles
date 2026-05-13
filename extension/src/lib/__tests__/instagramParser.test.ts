import { describe, it, expect } from 'vitest';
import { parseInstagramProfile, parseHandleFromUrl } from '../platforms/instagram';

const FIXTURE_HTML = `
<html>
<head>
<meta property="og:url" content="https://www.instagram.com/cooluser/" />
<meta property="og:title" content="Cool User" />
<script type="application/ld+json">
{
  "@type": "ProfilePage",
  "video": [
    {
      "url": "https://www.instagram.com/reel/ABC123/",
      "description": "first reel",
      "uploadDate": "2026-05-01T00:00:00Z",
      "thumbnailUrl": "https://cdn/x.jpg",
      "interactionStatistic": { "userInteractionCount": 12345 }
    },
    {
      "url": "https://www.instagram.com/reel/DEF456/",
      "description": "second reel",
      "thumbnailUrl": "https://cdn/y.jpg",
      "interactionStatistic": { "userInteractionCount": 9999 }
    }
  ]
}
</script>
</head>
<body></body>
</html>
`;

describe('parseInstagramProfile', () => {
  it('extracts channel + videos from ld+json', () => {
    const r = parseInstagramProfile(FIXTURE_HTML);
    expect(r.channelId).toBe('cooluser');
    expect(r.channelTitle).toBe('Cool User');
    expect(r.videos).toHaveLength(2);
    expect(r.videos[0]).toMatchObject({
      videoId: 'ABC123',
      title: 'first reel',
      viewCount: 12345,
      thumbnailUrl: 'https://cdn/x.jpg',
    });
  });

  it('empty / malformed HTML returns empty videos', () => {
    expect(parseInstagramProfile('').videos).toEqual([]);
    expect(parseInstagramProfile('<html><script type="application/ld+json">not json</script></html>').videos).toEqual([]);
  });
});

describe('parseHandleFromUrl (instagram)', () => {
  it('handles full URL', () => {
    expect(parseHandleFromUrl('https://www.instagram.com/cooluser/')).toBe('cooluser');
  });

  it('handles bare handle', () => {
    expect(parseHandleFromUrl('@bareuser')).toBe('bareuser');
    expect(parseHandleFromUrl('plainuser')).toBe('plainuser');
  });
});
