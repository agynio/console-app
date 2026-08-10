import { Granularity, Unit, type UsageBucket } from '@/gen/agynio/api/metering/v1/metering_pb';
import { USAGE_GROUP_COLUMNS, type UsageGroupBy, type UsageGroupColumn } from '@/hooks/useUsageGroups';

export type UsageQueryConfig = {
  key: string;
  unit: Unit;
  granularity: Granularity;
  useRangeGranularity?: boolean;
  labelFilters?: Record<string, string>;
  groupBy?: string;
};

// A subscription is a flat fee: its tokens have no marginal cost, and summing
// them alongside API tokens produces a bill that does not exist. Every token
// query that feeds a spend view therefore filters to resource=model. The
// distinct resource value is the only thing keeping the two apart.
export const METERED_MODEL_TOKENS = { resource: 'model' } as const;

// The other half of that split, shown apart rather than summed in. Without it
// the LLM tab reads as empty for an organization running on a subscription,
// which is the whole of its usage and none of its bill.
export const SUBSCRIPTION_TOKENS = { resource: 'subscription' } as const;

/** The sections with a consumer ranking. Each picks its own level. */
export type ConsumerMetric = 'llm' | 'compute' | 'storage';

// One ranking's queries at one level. Each section is built separately because
// the level is the section's own, and the workload level sums two columns.
export function consumerQueryConfigs(metric: ConsumerMetric, level: UsageGroupBy): UsageQueryConfig[] {
  return USAGE_GROUP_COLUMNS[level].flatMap((column): UsageQueryConfig[] => {
    if (metric === 'llm') {
      return [
        {
          key: `llm-consumers-input-${column}`,
          unit: Unit.TOKENS,
          granularity: Granularity.TOTAL,
          labelFilters: { ...METERED_MODEL_TOKENS, kind: 'input' },
          groupBy: column,
        },
        {
          key: `llm-consumers-output-${column}`,
          unit: Unit.TOKENS,
          granularity: Granularity.TOTAL,
          labelFilters: { ...METERED_MODEL_TOKENS, kind: 'output' },
          groupBy: column,
        },
      ];
    }
    if (metric === 'compute') {
      return [
        {
          key: `compute-consumers-${column}`,
          unit: Unit.FLAVOR_SECONDS,
          granularity: Granularity.TOTAL,
          groupBy: column,
        },
      ];
    }
    return [
      {
        key: `storage-consumers-${column}`,
        unit: Unit.GB_SECONDS,
        granularity: Granularity.TOTAL,
        labelFilters: { kind: 'storage' },
        groupBy: column,
      },
    ];
  });
}

/**
 * The query keys a section's ranking reads, each paired with the column it
 * groups by. The pairing is what lets a resolved id be looked up against the one
 * service that owns it instead of being probed against several.
 */
export function consumerQuerySources(
  metric: ConsumerMetric,
  level: UsageGroupBy,
): Array<{ key: string; column: UsageGroupColumn }> {
  return USAGE_GROUP_COLUMNS[level].flatMap((column) =>
    consumerQueryConfigs(metric, level)
      .filter((config) => config.groupBy === column)
      .map((config) => ({ key: config.key, column })),
  );
}

// A row with no value for the grouped column is not a consumer of it. Those
// rows come back ungrouped from every column queried, so counting them would
// add usage that belongs to nobody in the ranking, once per column.
export function identifiedGroupTotals(buckets: UsageBucket[]): Map<string, bigint> {
  return buckets.reduce((map, bucket) => {
    if (!bucket.groupValue) return map;
    map.set(bucket.groupValue, (map.get(bucket.groupValue) ?? 0n) + bucket.value);
    return map;
  }, new Map<string, bigint>());
}
