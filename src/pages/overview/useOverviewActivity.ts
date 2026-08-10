import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Granularity, Unit, type UsageBucket } from '@/gen/agynio/api/metering/v1/metering_pb';
import { timestampToMillis } from '@/lib/format';
import { queryUsage, sumUsageBuckets } from '@/lib/metering';

export const DAY_MS = 86_400_000;
export const ACTIVITY_WINDOW_DAYS = 7;

/**
 * Cached tokens are the share of the input that came from cache, not tokens on
 * top of it -- the LLM tab draws them as `input - cached` for the same reason.
 * Summing every kind counts that share twice, so the kinds are named.
 */
const COUNTED_TOKEN_KINDS = new Set(['input', 'output']);

/** A day of the token chart, already folded across the kinds that count. */
export type DailyTokens = { millis: number; tokens: bigint };

export type ActivityUsage = {
  /** Tokens over the window, and over the window before it, for the comparison. */
  tokens: bigint;
  previousTokens: bigint;
  /** Flavor-seconds, in micros, as metering reports them. */
  compute: bigint;
  threads: bigint;
  messages: bigint;
  /** Only days with usage come back, so the chart fills the rest itself. */
  daily: DailyTokens[];
  end: Date;
  isPending: boolean;
  isError: boolean;
};

type ActivityQuery = {
  key: string;
  unit: Unit;
  granularity: Granularity;
  start: Date;
  end?: Date;
  labelFilters?: Record<string, string>;
  groupBy?: string;
};

function sumTokenBuckets(buckets: UsageBucket[]): bigint {
  return sumUsageBuckets(buckets.filter((bucket) => COUNTED_TOKEN_KINDS.has(bucket.groupValue)));
}

function foldDailyTokens(buckets: UsageBucket[]): DailyTokens[] {
  const byDay = new Map<number, bigint>();
  buckets.forEach((bucket) => {
    if (!COUNTED_TOKEN_KINDS.has(bucket.groupValue)) return;
    const millis = timestampToMillis(bucket.timestamp);
    if (!millis) return;
    byDay.set(millis, (byDay.get(millis) ?? 0n) + bucket.value);
  });
  return Array.from(byDay, ([millis, tokens]) => ({ millis, tokens }));
}

/**
 * The window both the figures and the chart are read over. Rounded down to the
 * minute so a remount reuses the cached answer rather than asking again for a
 * range that moved by a second.
 */
function activityRange(): { start: Date; end: Date; previousStart: Date } {
  const end = new Date();
  end.setSeconds(0, 0);
  return {
    end,
    start: new Date(end.getTime() - ACTIVITY_WINDOW_DAYS * DAY_MS),
    previousStart: new Date(end.getTime() - 2 * ACTIVITY_WINDOW_DAYS * DAY_MS),
  };
}

/**
 * Token queries carry no resource filter on purpose. The usage tab excludes
 * subscription tokens because they are a flat fee and summing them produces a
 * bill that does not exist -- but this is a readout of what the organization
 * did, and a subscription's tokens are tokens it spent.
 *
 * They group by kind rather than filtering to one, because the figure wants two
 * of the three kinds and a filter only ever names one.
 */
export function useOverviewActivity(organizationId: string): ActivityUsage {
  const range = useMemo(activityRange, [organizationId]);

  const configs = useMemo<ActivityQuery[]>(
    () => [
      { key: 'tokens', unit: Unit.TOKENS, granularity: Granularity.TOTAL, start: range.start, groupBy: 'kind' },
      {
        key: 'tokens-previous',
        unit: Unit.TOKENS,
        granularity: Granularity.TOTAL,
        start: range.previousStart,
        end: range.start,
        groupBy: 'kind',
      },
      { key: 'tokens-daily', unit: Unit.TOKENS, granularity: Granularity.DAY, start: range.start, groupBy: 'kind' },
      { key: 'compute', unit: Unit.FLAVOR_SECONDS, granularity: Granularity.TOTAL, start: range.start },
      {
        key: 'threads',
        unit: Unit.COUNT,
        granularity: Granularity.TOTAL,
        start: range.start,
        labelFilters: { kind: 'thread' },
      },
      {
        key: 'messages',
        unit: Unit.COUNT,
        granularity: Granularity.TOTAL,
        start: range.start,
        labelFilters: { kind: 'message' },
      },
    ],
    [range],
  );

  const results = useQueries({
    queries: configs.map((config) => ({
      queryKey: ['metering', organizationId, 'overview', config.key, range.end.getTime()],
      queryFn: () =>
        queryUsage({
          organizationId,
          start: config.start,
          end: config.end ?? range.end,
          unit: config.unit,
          granularity: config.granularity,
          labelFilters: config.labelFilters,
          groupBy: config.groupBy,
        }),
      enabled: Boolean(organizationId),
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    })),
  });

  const [tokens, previousTokens, daily, compute, threads, messages] = results;

  return {
    tokens: sumTokenBuckets(tokens.data?.buckets ?? []),
    previousTokens: sumTokenBuckets(previousTokens.data?.buckets ?? []),
    compute: sumUsageBuckets(compute.data?.buckets ?? []),
    threads: sumUsageBuckets(threads.data?.buckets ?? []),
    messages: sumUsageBuckets(messages.data?.buckets ?? []),
    daily: foldDailyTokens(daily.data?.buckets ?? []),
    end: range.end,
    isPending: results.some((result) => result.isPending),
    isError: results.some((result) => result.isError),
  };
}
