import { describe, it, expect } from 'vitest';
import { parseChannelInput } from '../youtube';

describe('parseChannelInput', () => {
  it('handles @handle URL', () => {
    expect(parseChannelInput('https://www.youtube.com/@MrBeast')).toEqual({ kind: 'handle', value: 'MrBeast' });
  });
  it('handles raw @handle', () => {
    expect(parseChannelInput('@MrBeast')).toEqual({ kind: 'handle', value: 'MrBeast' });
  });
  it('detects channel ID URL', () => {
    expect(parseChannelInput('https://youtube.com/channel/UC1234567890123456789012')).toEqual({
      kind: 'id',
      value: 'UC1234567890123456789012',
    });
  });
  it('detects /c/ legacy username', () => {
    expect(parseChannelInput('https://youtube.com/c/somename')).toEqual({ kind: 'username', value: 'somename' });
  });
  it('detects raw UC channel id', () => {
    expect(parseChannelInput('UCabcdefghijklmnopqrstuv')).toEqual({ kind: 'id', value: 'UCabcdefghijklmnopqrstuv' });
  });
  it('falls back to handle for bare names', () => {
    expect(parseChannelInput('whoever')).toEqual({ kind: 'handle', value: 'whoever' });
  });
});
