import { describe, expect, it } from 'vitest';
import { isValidGoDuration } from '@/lib/duration';

describe('duration utilities', () => {
  it('accepts valid Go durations', () => {
    const validValues = ['30s', '5m', '1h30m', '1.5h', '.5s', '-5m', '+5m'];

    validValues.forEach((value) => {
      expect(isValidGoDuration(value)).toBe(true);
    });
  });

  it('rejects invalid Go durations', () => {
    const invalidValues = ['', '30', '1d', 'abc', '1h30'];

    invalidValues.forEach((value) => {
      expect(isValidGoDuration(value)).toBe(false);
    });
  });
});
