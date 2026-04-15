import { describe, expect, it } from 'vitest';
import { formatUsageNumber, formatUsageUnit, formatUsageValue, microsToNumber } from '@/lib/usage';
import { EMPTY_PLACEHOLDER } from '@/lib/format';
import { Unit } from '@/gen/agynio/api/metering/v1/metering_pb';

describe('microsToNumber', () => {
  it('converts micro-units to numbers', () => {
    expect(microsToNumber(2500000n)).toBeCloseTo(2.5);
    expect(microsToNumber(1230000n)).toBeCloseTo(1.23);
  });
});

describe('formatUsageValue', () => {
  it('formats bigint values', () => {
    expect(formatUsageValue(1200000n)).toBe('1.2');
  });

  it('handles missing values', () => {
    expect(formatUsageValue(null)).toBe(EMPTY_PLACEHOLDER);
    expect(formatUsageValue(undefined)).toBe(EMPTY_PLACEHOLDER);
  });
});

describe('formatUsageNumber', () => {
  it('formats numeric values', () => {
    expect(formatUsageNumber(1234.56)).toBe('1,234.56');
  });

  it('handles invalid values', () => {
    expect(formatUsageNumber(null)).toBe(EMPTY_PLACEHOLDER);
    expect(formatUsageNumber(undefined)).toBe(EMPTY_PLACEHOLDER);
  });
});

describe('formatUsageUnit', () => {
  it('formats usage units', () => {
    expect(formatUsageUnit(Unit.TOKENS)).toBe('Tokens');
    expect(formatUsageUnit(Unit.CORE_SECONDS)).toBe('Core seconds');
    expect(formatUsageUnit(Unit.GB_SECONDS)).toBe('GB seconds');
    expect(formatUsageUnit(Unit.COUNT)).toBe('Count');
  });
});
