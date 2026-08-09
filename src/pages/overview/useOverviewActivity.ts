import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Granularity, Unit, type UsageBucket } from '@/gen/agynio/api/metering/v1/metering_pb';
import { queryUsage, sumUsageBuckets } from '@/lib/metering';

export const DAY_MS = 86_400_000;
export const ACTIVITY_WINDOW_DAYS = 7;

export type ActivityUsage = {
  /** Tokens over the window, and over the window before it, for the comparison. */
  tokens: bigint;
  previousTokens: bigint;
  /** Flavor-seconds, in micros, as metering reports them. */
  compute: bigint;
  threads: bigint;
  messages: bigint;
  /** Only days with usage come back, so the chart fills the rest itself. */
  daily: UsageBucket[];
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
};

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
 */
export function useOverviewActivity(organizationId: string): ActivityUsage {
  const range = useMemo(activityRange, [organizationId]);

  const configs = useMemo<ActivityQuery[]>(
    () => [
      { key: 'tokens', unit: Unit.TOKENS, granularity: Granularity.TOTAL, start: range.start },
      {
        key: 'tokens-previous',
        unit: Unit.TOKENS,
        granularity: Granularity.TOTAL,
        start: range.previousStart,
        end: range.start,
      },
      { key: 'tokens-daily', unit: Unit.TOKENS, granularity: Granularity.DAY, start: range.start },
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
        }),
      enabled: Boolean(organizationId),
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    })),
  });

  const [tokens, previousTokens, daily, compute, threads, messages] = results;

  return {
    tokens: sumUsageBuckets(tokens.data?.buckets ?? []),
    previousTokens: sumUsageBuckets(previousTokens.data?.buckets ?? []),
    compute: sumUsageBuckets(compute.data?.buckets ?? []),
    threads: sumUsageBuckets(threads.data?.buckets ?? []),
    messages: sumUsageBuckets(messages.data?.buckets ?? []),
    daily: daily.data?.buckets ?? [],
    end: range.end,
    isPending: results.some((result) => result.isPending),
    isError: results.some((result) => result.isError),
  };
}
