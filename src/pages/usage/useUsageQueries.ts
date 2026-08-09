import { useMemo } from 'react';
import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { Granularity, type QueryUsageResponse } from '@/gen/agynio/api/metering/v1/metering_pb';
import { queryUsage } from '@/lib/metering';
import type { UsageQueryConfig } from '@/lib/usageConsumers';
import type { UsageRange } from './range';

export type UsageQueryMap = Record<string, UseQueryResult<QueryUsageResponse, Error>>;

export type UsageQueryState = {
  byKey: UsageQueryMap;
  queries: Array<UseQueryResult<QueryUsageResponse, Error>>;
  isPending: boolean;
  isError: boolean;
  /** Whether anything in this section was actually used in the window. */
  hasData: boolean;
};

/**
 * Runs one section's queries. Each tab owns its own set rather than the page
 * running all of them: the inactive tabs are unmounted, so their queries — and
 * the consumer queries for whichever level they are grouped at — never fire.
 */
export function useUsageQueries(
  organizationId: string,
  range: UsageRange | null,
  configs: UsageQueryConfig[],
): UsageQueryState {
  const enabled = Boolean(range && organizationId);

  const queries = useQueries({
    queries: configs.map((config) => ({
      queryKey: ['metering', organizationId, range?.key ?? 'none', range?.granularity, range?.timeZone, config.key],
      queryFn: () => {
        if (!range) throw new Error('Usage range not available.');
        return queryUsage({
          organizationId,
          start: range.start,
          end: range.end,
          unit: config.unit,
          labelFilters: config.labelFilters,
          groupBy: config.groupBy,
          granularity: config.useRangeGranularity ? range.granularity : config.granularity,
          timeZone: range.timeZone,
        });
      },
      enabled,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    })),
  });

  const byKey = useMemo(
    () => Object.fromEntries(configs.map((config, index) => [config.key, queries[index]])) as UsageQueryMap,
    [configs, queries],
  );

  return {
    byKey,
    queries,
    isPending: enabled && queries.some((query) => query.isPending),
    isError: enabled && queries.some((query) => query.isError),
    hasData: enabled && queries.some((query) => (query.data?.buckets ?? []).some((bucket) => bucket.value !== 0n)),
  };
}

export const RANGE_GRANULARITY_FALLBACK = Granularity.DAY;
