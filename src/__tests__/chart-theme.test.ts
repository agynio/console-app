import { describe, expect, it } from 'vitest';
import { Granularity } from '@/gen/agynio/api/metering/v1/metering_pb';
import { compactNumber, fillTimeBuckets } from '@/lib/chartTheme';
import { buildRange, type RangeOption } from '@/pages/usage/range';

const HOUR = 60 * 60 * 1000;

type Point = { timestamp: number; value: number };

function point(timestamp: number, value: number): Point {
  return { timestamp, value };
}

describe('fillTimeBuckets', () => {
  // Metering returns no row for a period with no usage. Plotting the rows as
  // they arrive draws non-consecutive hours side by side, so an idle night
  // vanishes and the busy hours read as one continuous run.
  it('inserts the periods metering had nothing to report for', () => {
    const start = new Date(0);
    const end = new Date(5 * HOUR);
    const filled = fillTimeBuckets(
      [point(0, 10), point(3 * HOUR, 40)],
      Granularity.HOUR,
      { start, end },
      (timestamp) => point(timestamp, 0),
    );

    expect(filled.map((entry) => entry.timestamp / HOUR)).toEqual([0, 1, 2, 3]);
    expect(filled.map((entry) => entry.value)).toEqual([10, 0, 0, 40]);
  });

  it('leaves an empty series alone rather than inventing a flat line', () => {
    const filled = fillTimeBuckets([], Granularity.HOUR, { start: new Date(0), end: new Date(HOUR) }, (timestamp) =>
      point(timestamp, 0),
    );
    expect(filled).toEqual([]);
  });

  // TOTAL has no period to step by, so there is nothing to fill between.
  it('passes non-bucketed granularities through untouched', () => {
    const entries = [point(0, 1), point(9 * HOUR, 2)];
    const filled = fillTimeBuckets(entries, Granularity.TOTAL, { start: new Date(0), end: new Date(9 * HOUR) }, (timestamp) =>
      point(timestamp, 0),
    );
    expect(filled).toBe(entries);
  });

  it('does not run past the end of the window', () => {
    const filled = fillTimeBuckets(
      [point(0, 1), point(2 * HOUR, 2)],
      Granularity.HOUR,
      { start: new Date(0), end: new Date(HOUR) },
      (timestamp) => point(timestamp, 0),
    );
    expect(filled.at(-1)?.timestamp).toBe(HOUR);
  });
});

describe('compactNumber', () => {
  it('keeps axis ticks to a few characters', () => {
    expect(compactNumber(0)).toBe('0');
    expect(compactNumber(950)).toBe('950');
    expect(compactNumber(1_000)).toBe('1k');
    expect(compactNumber(12_800)).toBe('13k');
    expect(compactNumber(1_500)).toBe('1.5k');
    expect(compactNumber(2_400_000)).toBe('2.4M');
  });
});

// The granularity is what decides how many bars get drawn, and gap-filling
// means the count is the whole window rather than the rows metering returns.
// Five-minute buckets over a day is 288 marks -- a 1px hairline each at any
// card width, with stack segments no longer distinguishable.
describe('range granularity', () => {
  const MARKS_PER_WINDOW: Array<[RangeOption, number]> = [
    ['24h', 24],
    ['7d', 28],
    ['30d', 30],
  ];

  const stepMs: Partial<Record<Granularity, number>> = {
    [Granularity.FIVE_MINUTES]: 5 * 60_000,
    [Granularity.HOUR]: 60 * 60_000,
    [Granularity.SIX_HOURS]: 6 * 60 * 60_000,
    [Granularity.DAY]: 24 * 60 * 60_000,
  };

  it.each(MARKS_PER_WINDOW)('draws a readable number of marks for %s', (option, expected) => {
    const { range } = buildRange(option, '', '');
    expect(range).not.toBeNull();
    const step = stepMs[range!.granularity];
    expect(step).toBeDefined();
    const marks = Math.round((range!.end.getTime() - range!.start.getTime()) / (step as number));
    expect(marks).toBe(expected);
  });

  it('keeps custom windows in the same band', () => {
    const marksFor = (days: number) => {
      const end = new Date();
      const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
      const { range } = buildRange(
        'custom',
        `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`,
        `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`,
      );
      const step = stepMs[range!.granularity] as number;
      return (range!.end.getTime() - range!.start.getTime()) / step;
    };

    // A one-day custom window spans two calendar dates, so it is wider than 24h.
    expect(marksFor(1)).toBeLessThanOrEqual(48);
    expect(marksFor(10)).toBeLessThanOrEqual(60);
    expect(marksFor(60)).toBeLessThanOrEqual(70);
  });
});
