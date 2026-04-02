import type { Timestamp } from '@bufbuild/protobuf/wkt';

function toDate(timestamp: Timestamp): Date {
  const millis = Number(timestamp.seconds) * 1000 + Math.floor(timestamp.nanos / 1_000_000);
  return new Date(millis);
}

export function formatTimestamp(timestamp?: Timestamp | null, options?: Intl.DateTimeFormatOptions): string {
  if (!timestamp) return '—';
  const formatter = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...options,
  });
  return formatter.format(toDate(timestamp));
}

export function formatDateOnly(timestamp?: Timestamp | null): string {
  return formatTimestamp(timestamp, { dateStyle: 'medium' });
}

export function formatLabelPairs(labels: Record<string, string>): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return '—';
  return entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
}
