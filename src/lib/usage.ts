import { Unit } from '@/gen/agynio/api/metering/v1/metering_pb';
import { EMPTY_PLACEHOLDER } from '@/lib/format';

const MICRO_UNITS = 1_000_000;
const SECONDS_PER_HOUR = 3600;
const usageFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const hoursFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const hoursSmallFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const compactFormatter = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export function microsToNumber(value: bigint): number {
  return Number(value) / MICRO_UNITS;
}

export function microsToHours(value: bigint): number {
  return microsToNumber(value) / SECONDS_PER_HOUR;
}

export function formatUsageNumber(value?: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY_PLACEHOLDER;
  return usageFormatter.format(value);
}

export function formatUsageHoursNumber(value?: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY_PLACEHOLDER;
  if (value > 0 && value < 1) {
    return hoursSmallFormatter.format(value);
  }
  return hoursFormatter.format(value);
}

/** For a headline figure, where the exact token count says less than its size. */
export function formatUsageCompact(value?: bigint | null): string {
  if (value === null || value === undefined) return EMPTY_PLACEHOLDER;
  const number = microsToNumber(value);
  if (!Number.isFinite(number)) return EMPTY_PLACEHOLDER;
  if (number < 1000) return usageFormatter.format(number);
  return compactFormatter.format(number);
}

export function formatUsageValue(value?: bigint | null): string {
  if (value === null || value === undefined) return EMPTY_PLACEHOLDER;
  return formatUsageNumber(microsToNumber(value));
}

export function formatUsageHours(value?: bigint | null): string {
  if (value === null || value === undefined) return EMPTY_PLACEHOLDER;
  return formatUsageHoursNumber(microsToHours(value));
}

export function formatUsageUnit(unit: Unit): string {
  if (unit === Unit.TOKENS) return 'Tokens';
  if (unit === Unit.CORE_SECONDS) return 'Core seconds';
  if (unit === Unit.GB_SECONDS) return 'GB seconds';
  if (unit === Unit.FLAVOR_SECONDS) return 'Flavor seconds';
  if (unit === Unit.COUNT) return 'Count';
  return 'Unspecified';
}
