import { Granularity } from '@/gen/agynio/api/metering/v1/metering_pb';

export type RangeOption = '24h' | '7d' | '30d' | 'custom';

export type UsageRange = {
  start: Date;
  end: Date;
  /** Stable identity for the window, so a query key changes only when it does. */
  key: string;
  granularity: Granularity;
  timeZone: string;
};

export const rangeOptions: Array<{ value: RangeOption; label: string }> = [
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom range' },
];

export function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateInput(value: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map((segment) => Number(segment));
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function resolveGranularity(option: RangeOption, start: Date, end: Date): Granularity {
  // The granularity decides how many bars get drawn, so it is chosen to land
  // near 24-48 of them. Five-minute buckets over a day is 288 marks: at any card
  // width that is a 1px hairline each, and the stack segments stop being
  // distinguishable from one another. Periods with no usage still occupy their
  // slot, so the count is the whole window, not the rows metering returns.
  if (option === '24h') return Granularity.HOUR;
  if (option === '7d') return Granularity.SIX_HOURS;
  if (option === '30d') return Granularity.DAY;

  const rangeMs = end.getTime() - start.getTime();
  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * hourMs;
  if (rangeMs <= 3 * hourMs) return Granularity.FIVE_MINUTES;
  if (rangeMs <= 2 * dayMs) return Granularity.HOUR;
  if (rangeMs <= 14 * dayMs) return Granularity.SIX_HOURS;
  return Granularity.DAY;
}

export function buildRange(
  option: RangeOption,
  customStart: string,
  customEnd: string,
): { range: UsageRange | null; error: string } {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();
  const complete = (start: Date, end: Date) => ({
    range: {
      start,
      end,
      key: `${start.toISOString()}-${end.toISOString()}`,
      granularity: resolveGranularity(option, start, end),
      timeZone,
    },
    error: '',
  });

  if (option === '24h') return complete(new Date(now.getTime() - 24 * 60 * 60 * 1000), now);
  if (option === '7d' || option === '30d') {
    const days = option === '7d' ? 7 : 30;
    return complete(new Date(now.getTime() - days * 24 * 60 * 60 * 1000), now);
  }

  const startDate = parseDateInput(customStart);
  const endDate = parseDateInput(customEnd);
  if (!startDate || !endDate) {
    return { range: null, error: 'Select both a start and end date.' };
  }
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);
  if (startDate > endDate) {
    return { range: null, error: 'Start date must be before end date.' };
  }
  return complete(startDate, endDate);
}
