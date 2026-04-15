import { Unit } from '@/gen/agynio/api/metering/v1/metering_pb';
import { EMPTY_PLACEHOLDER } from '@/lib/format';

const MICRO_UNITS = 1_000_000;
const usageFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export function microsToNumber(value: bigint): number {
  return Number(value) / MICRO_UNITS;
}

export function formatUsageNumber(value?: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY_PLACEHOLDER;
  return usageFormatter.format(value);
}

export function formatUsageValue(value?: bigint | null): string {
  if (value === null || value === undefined) return EMPTY_PLACEHOLDER;
  return formatUsageNumber(microsToNumber(value));
}

export function formatUsageUnit(unit: Unit): string {
  if (unit === Unit.TOKENS) return 'Tokens';
  if (unit === Unit.CORE_SECONDS) return 'Core seconds';
  if (unit === Unit.GB_SECONDS) return 'GB seconds';
  if (unit === Unit.COUNT) return 'Count';
  return 'Unspecified';
}
