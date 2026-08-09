import { describe, expect, it } from 'vitest';
import { EMPTY_PLACEHOLDER, formatBytes, formatMillicores, truncateMiddle } from '@/lib/format';

describe('formatBytes', () => {
  it('reads an unallocated workload as blank rather than as zero bytes', () => {
    expect(formatBytes(0n)).toBe(EMPTY_PLACEHOLDER);
    expect(formatBytes(undefined)).toBe(EMPTY_PLACEHOLDER);
  });

  it('scales to binary units', () => {
    expect(formatBytes(900)).toBe('900 B');
    expect(formatBytes(1024)).toBe('1.0 KiB');
    expect(formatBytes(536_870_912n)).toBe('512 MiB');
    expect(formatBytes(2_147_483_648n)).toBe('2.0 GiB');
  });
});

describe('formatMillicores', () => {
  it('reads an unallocated workload as blank', () => {
    expect(formatMillicores(0)).toBe(EMPTY_PLACEHOLDER);
  });

  it('groups thousands', () => {
    expect(formatMillicores(250)).toBe('250 m');
    expect(formatMillicores(1500)).toBe('1,500 m');
  });
});

describe('truncateMiddle', () => {
  it('keeps the head and tail an operator matches against', () => {
    expect(truncateMiddle('ebff1f22-e389-4052-9915-5dc3b7415667')).toBe('ebff1f22…415667');
  });

  it('leaves a value that already fits', () => {
    expect(truncateMiddle('h52aAajfzF')).toBe('h52aAajfzF');
  });

  it('never returns more than it was given', () => {
    const value = 'a'.repeat(16);
    expect(truncateMiddle(value).length).toBeLessThan(value.length);
  });

  it('falls back to the placeholder', () => {
    expect(truncateMiddle('')).toBe(EMPTY_PLACEHOLDER);
  });
});
