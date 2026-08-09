import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Granularity, Unit } from '@/gen/agynio/api/metering/v1/metering_pb';
import { useUsageGroups, type UsageGroupBy } from '@/hooks/useUsageGroups';
import { bucketTimestamp, fillTimeBuckets, formatRangeLabel } from '@/lib/chartTheme';
import { formatUsageHours, formatUsageHoursNumber, microsToHours } from '@/lib/usage';
import { consumerQueryConfigs, consumerQuerySources, identifiedGroupTotals, type UsageQueryConfig } from '@/lib/usageConsumers';
import { ConsumerChartCard, TimeSeriesChartCard, UsageMetricCard, type TimePoint } from './cards';
import type { UsageRange } from './range';
import { useUsageQueries } from './useUsageQueries';
import { buildConsumerRows, consumerTotals, sectionSources, sumBuckets, useConsumerRefs } from './shared';

const fixedConfigs: UsageQueryConfig[] = [
  { key: 'compute-flavor-total', unit: Unit.FLAVOR_SECONDS, granularity: Granularity.TOTAL },
  { key: 'compute-flavor-daily', unit: Unit.FLAVOR_SECONDS, granularity: Granularity.DAY, useRangeGranularity: true },
  { key: 'compute-flavor-tiers-total', unit: Unit.FLAVOR_SECONDS, granularity: Granularity.TOTAL, groupBy: 'flavor' },
];

export function ComputeSection({ organizationId, range }: { organizationId: string; range: UsageRange | null }) {
  const [groupBy, setGroupBy] = useState<UsageGroupBy>('workload');
  const configs = useMemo(() => [...fixedConfigs, ...consumerQueryConfigs('compute', groupBy)], [groupBy]);
  const { byKey, isPending, hasData } = useUsageQueries(organizationId, range, configs);

  const granularity = range?.granularity ?? Granularity.DAY;

  const points: TimePoint[] = useMemo(() => {
    if (!range) return [];
    const buckets = byKey['compute-flavor-daily']?.data?.buckets ?? [];
    const merged = new Map<number, TimePoint>();
    buckets.forEach((bucket) => {
      if (!bucket.timestamp) return;
      const timestamp = bucketTimestamp(bucket);
      const point = merged.get(timestamp) ?? { timestamp, hours: 0 };
      point.hours += microsToHours(bucket.value);
      merged.set(timestamp, point);
    });
    const sorted = Array.from(merged.values()).sort((left, right) => left.timestamp - right.timestamp);
    return fillTimeBuckets(sorted, granularity, range, (timestamp) => ({ timestamp, hours: 0 }));
  }, [byKey, granularity, range]);

  const flavorTotals = useMemo(() => {
    const totals = identifiedGroupTotals(byKey['compute-flavor-tiers-total']?.data?.buckets ?? []);
    return Array.from(totals.entries())
      .map(([flavor, value]) => ({ flavor, hours: microsToHours(value) }))
      .sort((left, right) => right.hours - left.hours);
  }, [byKey]);
  const flavorSum = flavorTotals.reduce((total, entry) => total + entry.hours, 0);

  const consumerSources = sectionSources(byKey, consumerQuerySources('compute', groupBy));
  const totals = consumerTotals(consumerSources, microsToHours);
  const { resolveGroup } = useUsageGroups(useConsumerRefs(totals));
  const consumerRows = buildConsumerRows(totals, resolveGroup);

  if (!range) return null;
  if (!isPending && !hasData) {
    return (
      <Card className="py-4" data-testid="organization-usage-compute-empty">
        <CardContent className="px-4 text-sm text-muted-foreground">No compute usage for this period.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="organization-usage-compute-section">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" data-testid="organization-usage-compute-metrics">
        <UsageMetricCard
          label="Flavor-hours"
          value={formatUsageHours(sumBuckets(byKey['compute-flavor-total']))}
          helper={flavorTotals.length ? `Across ${flavorTotals.length} flavor${flavorTotals.length === 1 ? '' : 's'}` : undefined}
          isLoading={byKey['compute-flavor-total']?.isPending ?? true}
          isError={byKey['compute-flavor-total']?.isError ?? false}
          testId="organization-usage-compute-flavor"
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <TimeSeriesChartCard
          title="Usage over time"
          subtitle={`Flavor-hours \u00b7 ${formatRangeLabel(range.start, range.end)}`}
          testId="organization-usage-compute-daily-chart"
          isLoading={byKey['compute-flavor-daily']?.isPending ?? true}
          isError={byKey['compute-flavor-daily']?.isError ?? false}
          points={points}
          granularity={granularity}
          series={[{ key: 'hours', name: 'Flavor-hours', color: 'var(--color-chart-1)' }]}
          format={(value) => formatUsageHoursNumber(value)}
        />
        <FlavorBreakdown
          rows={flavorTotals}
          total={flavorSum}
          isLoading={byKey['compute-flavor-tiers-total']?.isPending ?? true}
          isError={byKey['compute-flavor-tiers-total']?.isError ?? false}
        />
      </div>

      <ConsumerChartCard
        rows={consumerRows}
        level={groupBy}
        onLevelChange={setGroupBy}
        isLoading={consumerSources.some((source) => source.query?.isPending)}
        isError={consumerSources.some((source) => source.query?.isError)}
        testId="organization-usage-compute-consumers-chart"
        format={(value) => formatUsageHoursNumber(value)}
        fallbackColor="var(--color-chart-1)"
        subtitle="Flavor-hours"
      />
    </div>
  );
}

/**
 * A share-of-total list rather than a ranked chart. Most organizations run one
 * flavor, and a one-bar bar chart is a number wearing a chart's chrome; the
 * list degrades to a labelled meter at one and still reads as a ranking at ten.
 */
function FlavorBreakdown({
  rows,
  total,
  isLoading,
  isError,
}: {
  rows: Array<{ flavor: string; hours: number }>;
  total: number;
  isLoading: boolean;
  isError: boolean;
}) {
  return (
    <Card className="gap-0 border-border py-4" data-testid="organization-usage-compute-flavors-chart">
      <CardHeader className="gap-0.5 px-4 pb-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">By flavor</CardTitle>
        <div className="text-xs text-muted-foreground">Share of flavor-hours</div>
      </CardHeader>
      <CardContent className="px-4 pt-3">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : isError ? (
          <div className="text-sm text-muted-foreground">Failed to load chart data.</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No usage data for this period.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((row) => {
              const share = total > 0 ? (row.hours / total) * 100 : 0;
              return (
                <div key={row.flavor} className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1">
                  <span className="text-sm text-foreground">{row.flavor}</span>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {formatUsageHoursNumber(row.hours)} h · {share.toFixed(share < 10 ? 1 : 0)}%
                  </span>
                  <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-chart-1" style={{ width: `${share}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
