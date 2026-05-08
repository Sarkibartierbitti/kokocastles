import { describe, it, expect } from 'vitest';
import { aggregateHooks, aggregateScripts } from '../aggregators';
import type { DeepAnalysis, PlatformId, TranscriptSegment } from '~/types';

const sampleDeep = (overrides: Partial<DeepAnalysis['hook']> = {}): DeepAnalysis => ({
  hook: {
    type: 'visual',
    spoken: 'You will not believe this',
    onScreen: 'WAIT FOR IT',
    visualFormat: 'jump-cut close-up',
    ...overrides,
  },
  structure: [],
  pacing: { avgCutSec: 1.2, rhythm: 'fast' },
  techniques: ['hook', 'cliffhanger'],
});

describe('aggregateHooks', () => {
  it('returns empty array when no deep entries', () => {
    expect(aggregateHooks([], [])).toEqual([]);
  });

  it('extracts hook fields from each deep entry', () => {
    const deeps = [
      { platform: 'youtube' as PlatformId, videoId: 'v1', deep: sampleDeep({ spoken: 'Hook one' }) },
      { platform: 'youtube' as PlatformId, videoId: 'v2', deep: sampleDeep({ spoken: 'Hook two' }) },
    ];
    const hooks = aggregateHooks(deeps, []);
    expect(hooks).toHaveLength(2);
    expect(hooks[0].spoken).toBe('Hook one');
    expect(hooks[1].videoId).toBe('v2');
  });

  it('joins audio hook from transcript 0–5s window', () => {
    const segs: TranscriptSegment[] = [
      { start: 0, dur: 2, text: 'Hey there' },
      { start: 2, dur: 3, text: 'check this out' },
      { start: 6, dur: 4, text: 'beyond window' },
    ];
    const deeps = [{ platform: 'youtube' as PlatformId, videoId: 'v1', deep: sampleDeep() }];
    const hooks = aggregateHooks(deeps, [{ platform: 'youtube', videoId: 'v1', segments: segs }]);
    expect(hooks[0].audioHook).toContain('Hey there');
    expect(hooks[0].audioHook).toContain('check this out');
    expect(hooks[0].audioHook).not.toContain('beyond window');
  });

  it('audioHook is empty string when no transcript', () => {
    const deeps = [{ platform: 'youtube' as PlatformId, videoId: 'v1', deep: sampleDeep() }];
    const hooks = aggregateHooks(deeps, []);
    expect(hooks[0].audioHook).toBe('');
  });
});

describe('aggregateScripts', () => {
  it('returns empty when no transcripts', () => {
    expect(aggregateScripts([])).toEqual([]);
  });

  it('builds full text from each transcript', () => {
    const t1: TranscriptSegment[] = [
      { start: 0, dur: 1, text: 'first line' },
      { start: 1, dur: 1, text: 'second line' },
    ];
    const t2: TranscriptSegment[] = [{ start: 0, dur: 1, text: 'only line' }];
    const scripts = aggregateScripts([
      { platform: 'youtube', videoId: 'a', segments: t1 },
      { platform: 'youtube', videoId: 'b', segments: t2 },
    ]);
    expect(scripts).toHaveLength(2);
    expect(scripts[0].fullText).toBe('first line second line');
    expect(scripts[1].videoId).toBe('b');
  });
});
