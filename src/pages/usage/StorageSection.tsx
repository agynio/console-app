import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Granularity, Unit } from '@/gen/agynio/api/metering/v1/metering_pb';
import { useUsageGroups, type UsageGroupBy } from '@/hooks/useUsageGroups';
import { bucketTimestamp, fillTimeBuckets, formatRangeLabel } from '@/lib/chartTheme';
import { formatUsageHours, formatUsageHoursNumber, microsToHours } from '@/lib/usage';
import { consumerQueryConfigs, consumerQuerySources, type UsageQueryConfig } from '@/lib/usageConsumers';
import { ConsumerChartCard, TimeSeriesChartCard, UsageMetricCard, type TimePoint } from './cards';
import type { UsageRange } from './range';
import { useUsageQueries } from './useUsageQueries';
import { buildConsumerRows, consumerTotals, sectionSources, sumBuckets, useConsumerRefs } from './shared';

const fixedConfigs: UsageQueryConfig[] = [
  { key: 'storage-total', unit: Unit.GB_SECONDS, granularity: Granularity.TOTAL, labelFilters: { kind: 'storage' } },
  {
    key: 'storage-daily',
    unit: Unit.GB_SECONDS,
    granularity: Granularity.DAY,
    useRangeGranularity: true,
    labelFilters: { kind: 'storage' },
  },
];

export function StorageSection({ organizationId, range }: { organizationId: string; range: UsageRange | null }) {
  const [groupBy, setGroupBy] = useState<UsageGroupBy>('workload');
  const configs = useMemo(() => [...fixedConfigs, ...consumerQueryConfigs('storage', groupBy)], [groupBy]);
  const { byKey, isPending, hasData } = useUsageQueries(organizationId, range, configs);

  const granularity = range?.granularity ?? Granularity.DAY;

  const points: TimePoint[] = useMemo(() => {
    if (!range) return [];
    const merged = new Map<number, TimePoint>();
    (byKey['storage-daily']?.data?.buckets ?? []).forEach((bucket) => {
      if (!bucket.timestamp) return;
      const timestamp = bucketTimestamp(bucket);
      const point = merged.get(timestamp) ?? { timestamp, hours: 0 };
      point.hours += microsToHours(bucket.value);
      merged.set(timestamp, point);
    });
    const sorted = Array.from(merged.values()).sort((left, right) => left.timestamp - right.timestamp);
    return fillTimeBuckets(sorted, granularity, range, (timestamp) => ({ timestamp, hours: 0 }));
  }, [byKey, granularity, range]);

  const consumerSources = sectionSources(byKey, consumerQuerySources('storage', groupBy));
  const totals = consumerTotals(consumerSources, microsToHours);
  const { resolveGroup } = useUsageGroups(useConsumerRefs(totals));
  const consumerRows = buildConsumerRows(totals, resolveGroup);

  if (!range) return null;
  if (!isPending && !hasData) {
    return (
      <Card className="py-4" data-testid="organization-usage-storage-empty">
        <CardContent className="px-4 text-sm text-muted-foreground">No storage usage for this period.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="organization-usage-storage-section">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" data-testid="organization-usage-storage-metrics">
        <UsageMetricCard
          label="Storage-GB-hours"
          value={formatUsageHours(sumBuckets(byKey['storage-total']))}
          isLoading={byKey['storage-total']?.isPending ?? true}
          isError={byKey['storage-total']?.isError ?? false}
          testId="organization-usage-storage-total"
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <TimeSeriesChartCard
          title="Usage over time"
          subtitle={`GB-hours \u00b7 ${formatRangeLabel(range.start, range.end)}`}
          testId="organization-usage-storage-daily-chart"
          isLoading={byKey['storage-daily']?.isPending ?? true}
          isError={byKey['storage-daily']?.isError ?? false}
          points={points}
          granularity={granularity}
          series={[{ key: 'hours', name: 'GB-hours', color: 'var(--color-chart-5)' }]}
          format={(value) => formatUsageHoursNumber(value)}
        />
        <ConsumerChartCard
          rows={consumerRows}
          level={groupBy}
          onLevelChange={setGroupBy}
          isLoading={consumerSources.some((source) => source.query?.isPending)}
          isError={consumerSources.some((source) => source.query?.isError)}
          testId="organization-usage-storage-consumers-chart"
          format={(value) => formatUsageHoursNumber(value)}
          fallbackColor="var(--color-chart-5)"
          subtitle="GB-hours"
        />
      </div>
    </div>
  );
}
