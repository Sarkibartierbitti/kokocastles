import { describe, it, expect } from 'vitest';
import {
  validateName,
  refKey,
  dedupeRefs,
  findById,
  buildIndex,
} from '../databanks';
import type { Databank } from '~/types';

describe('databanks helpers', () => {
  describe('validateName', () => {
    it('rejects empty', () => {
      expect(validateName('')).toBe('Name is required');
      expect(validateName('   ')).toBe('Name is required');
    });

    it('rejects > 80 chars', () => {
      expect(validateName('x'.repeat(81))).toBe('Name must be 80 characters or fewer');
    });

    it('accepts valid', () => {
      expect(validateName('Hooks I love')).toBeNull();
    });

    it('accepts unicode', () => {
      expect(validateName('カワイイ hooks')).toBeNull();
    });
  });

  describe('refKey', () => {
    it('joins platform + videoId', () => {
      expect(refKey({ platform: 'youtube', videoId: 'abc', addedAt: '' })).toBe('youtube::abc');
    });
  });

  describe('dedupeRefs', () => {
    it('keeps first occurrence', () => {
      const refs = [
        { platform: 'youtube' as const, videoId: 'a', addedAt: '2026-01-01' },
        { platform: 'youtube' as const, videoId: 'a', addedAt: '2026-01-02' },
        { platform: 'youtube' as const, videoId: 'b', addedAt: '2026-01-03' },
      ];
      const out = dedupeRefs(refs);
      expect(out).toHaveLength(2);
      expect(out[0].addedAt).toBe('2026-01-01');
    });
  });

  describe('findById', () => {
    it('returns null when missing', () => {
      expect(findById([], 'x')).toBeNull();
    });

    it('returns the matching databank', () => {
      const dbs: Databank[] = [{ id: 'a', name: 'A', createdAt: '', videoRefs: [] }];
      expect(findById(dbs, 'a')?.name).toBe('A');
    });
  });

  describe('buildIndex', () => {
    it('builds a videoKey -> Set<databankId> map', () => {
      const dbs: Databank[] = [
        {
          id: 'd1', name: 'd1', createdAt: '', videoRefs: [
            { platform: 'youtube', videoId: 'a', addedAt: '' },
            { platform: 'youtube', videoId: 'b', addedAt: '' },
          ],
        },
        {
          id: 'd2', name: 'd2', createdAt: '', videoRefs: [
            { platform: 'youtube', videoId: 'a', addedAt: '' },
          ],
        },
      ];
      const idx = buildIndex(dbs);
      expect(idx.get('youtube::a')).toEqual(new Set(['d1', 'd2']));
      expect(idx.get('youtube::b')).toEqual(new Set(['d1']));
      expect(idx.get('youtube::c')).toBeUndefined();
    });
  });
});
