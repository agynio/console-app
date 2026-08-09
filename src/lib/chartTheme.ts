import type { Timestamp } from '@bufbuild/protobuf/wkt';
import { Granularity, type UsageBucket } from '@/gen/agynio/api/metering/v1/metering_pb';
import type { UsageGroupKind } from '@/hooks/useUsageGroups';
import { timestampToMillis } from '@/lib/format';

/** The gap that separates touching marks. White does the separating, not a stroke. */
export const MARK_GAP = 2;

export const chartGrid = {
  stroke: 'var(--color-chart-grid)',
  strokeWidth: 1,
  vertical: false,
} as const;

export const chartAxis = {
  stroke: 'var(--color-chart-grid)',
  tick: { fill: 'var(--color-chart-axis)', fontSize: 11 },
  tickLine: false,
} as const;

/** Axis ticks are read as a column, so their digits have to line up. */
export const tickStyle = { fontVariantNumeric: 'tabular-nums' } as const;

/** 1,284 / 12.9k / 4.2M — axis ticks have no room for the full figure. */
export function compactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs % 1_000_000 ? 1 : 0)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(abs % 1_000 && abs < 10_000 ? 1 : 0)}k`;
  return String(Math.round(value * 100) / 100);
}

const granularityMillis: Partial<Record<Granularity, number>> = {
  [Granularity.FIVE_MINUTES]: 5 * 60_000,
  [Granularity.HOUR]: 60 * 60_000,
  [Granularity.SIX_HOURS]: 6 * 60 * 60_000,
  [Granularity.DAY]: 24 * 60 * 60_000,
};

/**
 * Metering returns no row for a bucket with no usage, so plotting the buckets
 * as they arrive draws non-consecutive periods side by side — an idle night
 * disappears and the busy hours read as continuous. This fills the gaps so the
 * axis measures time rather than the number of rows that came back.
 */
export function fillTimeBuckets<T extends { timestamp: number }>(
  entries: T[],
  granularity: Granularity,
  range: { start: Date; end: Date },
  empty: (timestamp: number) => T,
): T[] {
  const step = granularityMillis[granularity];
  if (!step || entries.length === 0) return entries;

  const byTimestamp = new Map(entries.map((entry) => [entry.timestamp, entry]));
  const first = Math.min(...byTimestamp.keys());
  // Walk from the first bucket the data actually has rather than from the range
  // start: the two are aligned to the same grid, and starting from the data
  // avoids inventing buckets on the far side of a partial first period.
  let cursor = first;
  while (cursor - step >= range.start.getTime()) cursor -= step;

  const filled: T[] = [];
  const end = Math.min(range.end.getTime(), Math.max(...byTimestamp.keys()));
  for (let timestamp = cursor; timestamp <= end; timestamp += step) {
    filled.push(byTimestamp.get(timestamp) ?? empty(timestamp));
  }
  return filled;
}

/**
 * Time labels carry the date once in the card subtitle, so a tick only needs
 * the position within the period. A tick per bucket is unreadable at
 * five-minute granularity, so most of them render blank.
 */
export function formatBucketTick(timestamp: number, granularity: Granularity): string {
  const date = new Date(timestamp);
  if (granularity === Granularity.DAY) {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
  }
  return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

export function bucketTimestamp(bucket: UsageBucket): number {
  return bucket.timestamp ? timestampToMillis(bucket.timestamp) : 0;
}

export function formatBucketTitle(timestamp: Timestamp | number | undefined, granularity: Granularity): string {
  if (timestamp === undefined) return '';
  const millis = typeof timestamp === 'number' ? timestamp : timestampToMillis(timestamp);
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    ...(granularity === Granularity.DAY ? {} : { timeStyle: 'short' }),
  }).format(new Date(millis));
}

/** Instances and sandboxes share one ranking, so the bar carries the kind. */
export const groupKindColors: Partial<Record<UsageGroupKind, string>> = {
  instance: 'var(--color-chart-1)',
  sandbox: 'var(--color-chart-2)',
};

export const kindLegendLabels: Partial<Record<UsageGroupKind, string>> = {
  instance: 'Agent instances',
  sandbox: 'Sandboxes',
};

/**
 * The window a chart covers, as a card subtitle. Two full timestamps is more
 * chrome than the chart itself, so the parts both ends share are said once.
 */
export function formatRangeLabel(start: Date, end: Date): string {
  const sameDay = start.toDateString() === end.toDateString();
  const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
  const withYear = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (sameDay) return withYear.format(start);
  if (start.getFullYear() === end.getFullYear()) return `${day.format(start)} – ${withYear.format(end)}`;
  return `${withYear.format(start)} – ${withYear.format(end)}`;
}
