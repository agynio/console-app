import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Granularity, Unit, type UsageBucket } from '@/gen/agynio/api/metering/v1/metering_pb';
import { bucketTimestamp, fillTimeBuckets } from '@/lib/chartTheme';
import { formatUsageNumber, formatUsageValue, microsToNumber } from '@/lib/usage';
import type { UsageQueryConfig } from '@/lib/usageConsumers';
import { TimeSeriesChartCard, UsageMetricCard, type TimePoint } from './cards';
import type { UsageRange } from './range';
import { useUsageQueries } from './useUsageQueries';
import { sumBuckets } from './shared';

const configs: UsageQueryConfig[] = [
  { key: 'platform-threads-total', unit: Unit.COUNT, granularity: Granularity.TOTAL, labelFilters: { kind: 'thread' } },
  { key: 'platform-messages-total', unit: Unit.COUNT, granularity: Granularity.TOTAL, labelFilters: { kind: 'message' } },
  {
    key: 'platform-threads-daily',
    unit: Unit.COUNT,
    granularity: Granularity.DAY,
    useRangeGranularity: true,
    labelFilters: { kind: 'thread' },
  },
  {
    key: 'platform-messages-daily',
    unit: Unit.COUNT,
    granularity: Granularity.DAY,
    useRangeGranularity: true,
    labelFilters: { kind: 'message' },
  },
];

function accumulate(target: Map<number, TimePoint>, buckets: UsageBucket[], key: string) {
  buckets.forEach((bucket) => {
    if (!bucket.timestamp) return;
    const timestamp = bucketTimestamp(bucket);
    const point = target.get(timestamp) ?? { timestamp, threads: 0, messages: 0 };
    point[key] += microsToNumber(bucket.value);
    target.set(timestamp, point);
  });
}

export function PlatformSection({ organizationId, range }: { organizationId: string; range: UsageRange | null }) {
  const { byKey, isPending, hasData } = useUsageQueries(organizationId, range, configs);
  const granularity = range?.granularity ?? Granularity.DAY;

  const points: TimePoint[] = useMemo(() => {
    if (!range) return [];
    const merged = new Map<number, TimePoint>();
    accumulate(merged, byKey['platform-threads-daily']?.data?.buckets ?? [], 'threads');
    accumulate(merged, byKey['platform-messages-daily']?.data?.buckets ?? [], 'messages');
    const sorted = Array.from(merged.values()).sort((left, right) => left.timestamp - right.timestamp);
    return fillTimeBuckets(sorted, granularity, range, (timestamp) => ({ timestamp, threads: 0, messages: 0 }));
  }, [byKey, granularity, range]);

  const threadsTotal = sumBuckets(byKey['platform-threads-total']);
  const messagesTotal = sumBuckets(byKey['platform-messages-total']);
  const threadsCount = microsToNumber(threadsTotal);

  if (!range) return null;
  if (!isPending && !hasData) {
    return (
      <Card className="py-4" data-testid="organization-usage-platform-empty">
        <CardContent className="px-4 text-sm text-muted-foreground">No platform activity for this period.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="organization-usage-platform-section">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" data-testid="organization-usage-platform-metrics">
        <UsageMetricCard
          label="Threads created"
          value={formatUsageValue(threadsTotal)}
          isLoading={byKey['platform-threads-total']?.isPending ?? true}
          isError={byKey['platform-threads-total']?.isError ?? false}
          testId="organization-usage-platform-threads"
        />
        <UsageMetricCard
          label="Messages sent"
          value={formatUsageValue(messagesTotal)}
          helper={
            threadsCount > 0
              ? `${(microsToNumber(messagesTotal) / threadsCount).toFixed(1)} per thread`
              : undefined
          }
          isLoading={byKey['platform-messages-total']?.isPending ?? true}
          isError={byKey['platform-messages-total']?.isError ?? false}
          testId="organization-usage-platform-messages"
        />
      </div>

      <TimeSeriesChartCard
        title="Activity over time"
        testId="organization-usage-platform-daily-chart"
        isLoading={
          (byKey['platform-threads-daily']?.isPending ?? true) || (byKey['platform-messages-daily']?.isPending ?? true)
        }
        isError={
          (byKey['platform-threads-daily']?.isError ?? false) || (byKey['platform-messages-daily']?.isError ?? false)
        }
        points={points}
        granularity={granularity}
        series={[
          { key: 'threads', name: 'Threads', color: 'var(--color-chart-1)' },
          { key: 'messages', name: 'Messages', color: 'var(--color-chart-2)' },
        ]}
        format={(value) => formatUsageNumber(value)}
      />
    </div>
  );
}
