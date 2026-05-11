import { describe, it, expect } from 'vitest';
import { buildWriterPrompt } from '../writerPrompt';

describe('buildWriterPrompt', () => {
  it('always includes role/task/instructions/inputs/topic', () => {
    const out = buildWriterPrompt({
      topic: 'How sourdough bread changed my life',
      context: { usePersona: false, databankIds: [], files: [] },
      persona: null,
      databankBundles: [],
    });
    expect(out).toMatch(/<role>/);
    expect(out).toMatch(/<task>/);
    expect(out).toMatch(/<instructions>/);
    expect(out).toMatch(/<inputs>/);
    expect(out).toMatch(/<topic>\s*How sourdough bread changed my life\s*<\/topic>/);
  });

  it('omits persona block when usePersona is false', () => {
    const out = buildWriterPrompt({
      topic: 't',
      context: { usePersona: false, databankIds: [], files: [] },
      persona: { niche: 'baking', context: 'small business', styleSample: 's', attachedDatabankIds: [] },
      databankBundles: [],
    });
    expect(out).not.toMatch(/<persona>/);
  });

  it('includes persona when usePersona is true', () => {
    const out = buildWriterPrompt({
      topic: 't',
      context: { usePersona: true, databankIds: [], files: [] },
      persona: { niche: 'baking', context: 'small business', styleSample: 'short punchy', attachedDatabankIds: [] },
      databankBundles: [],
    });
    expect(out).toMatch(/<persona>/);
    expect(out).toMatch(/<niche>\s*baking\s*<\/niche>/);
    expect(out).toMatch(/<brand_context>/);
    expect(out).toMatch(/<writing_style_sample>/);
  });

  it('renders reference_videos when databank bundles provided', () => {
    const out = buildWriterPrompt({
      topic: 't',
      context: { usePersona: false, databankIds: ['x'], files: [] },
      persona: null,
      databankBundles: [
        {
          databankName: 'Winners',
          videos: [
            {
              video: {
                platform: 'youtube',
                videoId: 'v1',
                channelId: 'c1',
                channelTitle: 'Chan',
                title: 'Viral take',
                publishedAt: '',
                viewCount: 100,
                thumbnailUrl: '',
              },
              deep: {
                hook: {
                  type: 'curiosity',
                  spoken: 'You wont believe',
                  onScreen: '',
                  visualFormat: 'talking head',
                },
                structure: [],
                pacing: { avgCutSec: 1, rhythm: 'fast' },
                techniques: ['list', 'pattern interrupt'],
              },
              transcript: [{ start: 0, dur: 1, text: 'hello world' }],
            },
          ],
        },
      ],
    });
    expect(out).toMatch(/<reference_videos>/);
    expect(out).toMatch(/<databank name="Winners">/);
    expect(out).toMatch(/title="Viral take"/);
    expect(out).toMatch(/<techniques>list, pattern interrupt<\/techniques>/);
    expect(out).toMatch(/<transcript_excerpt>hello world<\/transcript_excerpt>/);
  });

  it('escapes XML special chars in user input', () => {
    const out = buildWriterPrompt({
      topic: 'a < b & c > d',
      context: { usePersona: false, databankIds: [], files: [] },
      persona: null,
      databankBundles: [],
    });
    expect(out).toMatch(/a &lt; b &amp; c &gt; d/);
  });

  it('includes uploaded files block when files present', () => {
    const out = buildWriterPrompt({
      topic: 't',
      context: { usePersona: false, databankIds: [], files: [{ name: 'notes.md', text: '# Idea' }] },
      persona: null,
      databankBundles: [],
    });
    expect(out).toMatch(/<uploaded_files>/);
    expect(out).toMatch(/<file name="notes.md">/);
    expect(out).toMatch(/# Idea/);
  });
});
