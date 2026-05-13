import { describe, it, expect } from 'vitest';
import { splitDraftParagraphs, mergeParagraphs, joinParagraphs } from '../writerSteps';

describe('splitDraftParagraphs', () => {
  it('empty input → empty', () => {
    expect(splitDraftParagraphs('')).toEqual([]);
  });

  it('single paragraph → one entry', () => {
    expect(splitDraftParagraphs('hello world')).toEqual(['hello world']);
  });

  it('splits on blank line(s)', () => {
    expect(splitDraftParagraphs('one\n\ntwo\n\n\nthree')).toEqual(['one', 'two', 'three']);
  });

  it('trims and drops empty fragments', () => {
    expect(splitDraftParagraphs('\n\n  one  \n\n\n\n  two  \n\n')).toEqual(['one', 'two']);
  });
});

describe('mergeParagraphs', () => {
  it('replaces target paragraph', () => {
    expect(mergeParagraphs(['a', 'b', 'c'], 1, 'B')).toEqual(['a', 'B', 'c']);
  });

  it('returns input untouched on out-of-bounds index', () => {
    expect(mergeParagraphs(['a'], 5, 'X')).toEqual(['a']);
    expect(mergeParagraphs(['a'], -1, 'X')).toEqual(['a']);
  });
});

describe('joinParagraphs', () => {
  it('joins with double newlines', () => {
    expect(joinParagraphs(['a', 'b', 'c'])).toBe('a\n\nb\n\nc');
  });
});
