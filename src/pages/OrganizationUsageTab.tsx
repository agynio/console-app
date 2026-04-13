import { useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import type { UseQueryResult } from '@tanstack/react-query';
import { useQueries } from '@tanstack/react-query';
import { create } from '@bufbuild/protobuf';
import { TimestampSchema, type Timestamp } from '@bufbuild/protobuf/wkt';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { meteringClient } from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Granularity,
  Unit,
  type QueryUsageResponse,
  type UsageBucket,
} from '@/gen/agynio/api/metering/v1/metering_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { formatDateOnly, timestampToMillis, truncate } from '@/lib/format';
import { formatUsageNumber, formatUsageValue, microsToNumber } from '@/lib/usage';

type RangeOption = '24h' | '7d' | '30d' | 'custom';

type RangeSelection = {
  start: Date;
  end: Date;
};

type UsageQueryConfig = {
  key: string;
  unit: Unit;
  granularity: Granularity;
  labelFilters?: Record<string, string>;
  groupBy?: string;
};

type ChartSeries = {
  date: string;
  [key: string]: number | string;
};

const rangeOptions: Array<{ value: RangeOption; label: string }> = [
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom range' },
];

const usageQueryConfigs: UsageQueryConfig[] = [
  { key: 'llm-input-total', unit: Unit.TOKENS, granularity: Granularity.TOTAL, labelFilters: { kind: 'input' } },
  { key: 'llm-cached-total', unit: Unit.TOKENS, granularity: Granularity.TOTAL, labelFilters: { kind: 'cached' } },
  { key: 'llm-output-total', unit: Unit.TOKENS, granularity: Granularity.TOTAL, labelFilters: { kind: 'output' } },
  {
    key: 'llm-requests-total',
    unit: Unit.COUNT,
    granularity: Granularity.TOTAL,
    labelFilters: { kind: 'request' },
    groupBy: 'status',
  },
  {
    key: 'llm-daily-tokens',
    unit: Unit.TOKENS,
    granularity: Granularity.DAY,
    groupBy: 'kind',
  },
  {
    key: 'llm-consumers-total',
    unit: Unit.TOKENS,
    granularity: Granularity.TOTAL,
    groupBy: 'identity_id',
  },
  {
    key: 'llm-models-total',
    unit: Unit.TOKENS,
    granularity: Granularity.TOTAL,
    groupBy: 'resource_id',
  },
  { key: 'compute-cpu-total', unit: Unit.CORE_SECONDS, granularity: Granularity.TOTAL },
  {
    key: 'compute-ram-total',
    unit: Unit.GB_SECONDS,
    granularity: Granularity.TOTAL,
    labelFilters: { kind: 'ram' },
  },
  { key: 'compute-cpu-daily', unit: Unit.CORE_SECONDS, granularity: Granularity.DAY },
  {
    key: 'compute-ram-daily',
    unit: Unit.GB_SECONDS,
    granularity: Granularity.DAY,
    labelFilters: { kind: 'ram' },
  },
  {
    key: 'compute-consumers-total',
    unit: Unit.CORE_SECONDS,
    granularity: Granularity.TOTAL,
    groupBy: 'identity_id',
  },
  {
    key: 'storage-total',
    unit: Unit.GB_SECONDS,
    granularity: Granularity.TOTAL,
    labelFilters: { kind: 'storage' },
  },
  {
    key: 'storage-daily',
    unit: Unit.GB_SECONDS,
    granularity: Granularity.DAY,
    labelFilters: { kind: 'storage' },
  },
  {
    key: 'storage-consumers-total',
    unit: Unit.GB_SECONDS,
    granularity: Granularity.TOTAL,
    labelFilters: { kind: 'storage' },
    groupBy: 'identity_id',
  },
  {
    key: 'platform-threads-total',
    unit: Unit.COUNT,
    granularity: Granularity.TOTAL,
    labelFilters: { kind: 'thread' },
  },
  {
    key: 'platform-messages-total',
    unit: Unit.COUNT,
    granularity: Granularity.TOTAL,
    labelFilters: { kind: 'message' },
  },
  {
    key: 'platform-threads-daily',
    unit: Unit.COUNT,
    granularity: Granularity.DAY,
    labelFilters: { kind: 'thread' },
  },
  {
    key: 'platform-messages-daily',
    unit: Unit.COUNT,
    granularity: Granularity.DAY,
    labelFilters: { kind: 'message' },
  },
];

const llmKindLabels: Record<string, string> = {
  input: 'Input',
  cached: 'Cached',
  output: 'Output',
};

const statusLabels: Record<string, string> = {
  success: 'Success',
  failed: 'Failed',
};

function toTimestamp(date: Date): Timestamp {
  return create(TimestampSchema, {
    seconds: BigInt(Math.floor(date.getTime() / 1000)),
    nanos: 0,
  });
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateInput(value: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map((segment) => Number(segment));
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function buildRange(option: RangeOption, customStart: string, customEnd: string): {
  range: RangeSelection | null;
  error: string;
} {
  const now = new Date();
  if (option === '24h') {
    return {
      range: { start: new Date(now.getTime() - 24 * 60 * 60 * 1000), end: now },
      error: '',
    };
  }
  if (option === '7d' || option === '30d') {
    const days = option === '7d' ? 7 : 30;
    const start = new Date(now);
    start.setDate(start.getDate() - days);
    start.setHours(0, 0, 0, 0);
    return { range: { start, end: now }, error: '' };
  }

  const startDate = parseDateInput(customStart);
  const endDate = parseDateInput(customEnd);
  if (!startDate || !endDate) {
    return { range: null, error: 'Select both a start and end date.' };
  }
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);
  if (startDate > endDate) {
    return { range: null, error: 'Start date must be before end date.' };
  }
  return { range: { start: startDate, end: endDate }, error: '' };
}

function sumUsageBuckets(buckets: UsageBucket[]): bigint {
  return buckets.reduce((total, bucket) => total + bucket.value, 0n);
}

function groupTotalsByValue(buckets: UsageBucket[]): Map<string, bigint> {
  return buckets.reduce((map, bucket) => {
    const key = bucket.groupValue || 'unknown';
    map.set(key, (map.get(key) ?? 0n) + bucket.value);
    return map;
  }, new Map<string, bigint>());
}

function buildDailySeries(buckets: UsageBucket[], groups: string[]): ChartSeries[] {
  const seriesMap = new Map<string, { timestamp: number; values: Record<string, number> }>();

  buckets.forEach((bucket) => {
    if (!bucket.timestamp) return;
    const dateLabel = formatDateOnly(bucket.timestamp);
    const current = seriesMap.get(dateLabel) ?? {
      timestamp: timestampToMillis(bucket.timestamp),
      values: {},
    };
    const groupKey = bucket.groupValue || 'unknown';
    current.values[groupKey] = (current.values[groupKey] ?? 0) + microsToNumber(bucket.value);
    seriesMap.set(dateLabel, current);
  });

  return Array.from(seriesMap.entries())
    .sort((a, b) => a[1].timestamp - b[1].timestamp)
    .map(([date, entry]) => {
      const values = groups.reduce<Record<string, number>>((acc, group) => {
        acc[group] = entry.values[group] ?? 0;
        return acc;
      }, {});
      return { date, ...values };
    });
}

function buildDailySeriesMap(buckets: UsageBucket[]): Map<string, { timestamp: number; value: number }> {
  return buckets.reduce((map, bucket) => {
    if (!bucket.timestamp) return map;
    const label = formatDateOnly(bucket.timestamp);
    const entry = map.get(label) ?? { timestamp: timestampToMillis(bucket.timestamp), value: 0 };
    entry.value += microsToNumber(bucket.value);
    map.set(label, entry);
    return map;
  }, new Map<string, { timestamp: number; value: number }>());
}

function mergeDailySeries(
  series: Record<string, Map<string, { timestamp: number; value: number }>>,
): ChartSeries[] {
  const merged = new Map<string, { timestamp: number; values: Record<string, number> }>();
  const keys = Object.keys(series);

  keys.forEach((key) => {
    series[key]?.forEach((entry, date) => {
      const current = merged.get(date) ?? { timestamp: entry.timestamp, values: {} };
      current.values[key] = entry.value;
      current.timestamp = Math.min(current.timestamp, entry.timestamp);
      merged.set(date, current);
    });
  });

  return Array.from(merged.entries())
    .sort((a, b) => a[1].timestamp - b[1].timestamp)
    .map(([date, entry]) => {
      const values = keys.reduce<Record<string, number>>((acc, key) => {
        acc[key] = entry.values[key] ?? 0;
        return acc;
      }, {});
      return { date, ...values };
    });
}

function buildTopGroups(buckets: UsageBucket[], limit = 5): Array<{ label: string; value: number }> {
  const grouped = groupTotalsByValue(buckets);
  return Array.from(grouped.entries())
    .map(([label, value]) => ({ label, value: microsToNumber(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function UsageMetricCard({
  label,
  value,
  helper,
  isLoading,
  isError,
  testId,
}: {
  label: string;
  value: string;
  helper?: string;
  isLoading: boolean;
  isError: boolean;
  testId: string;
}) {
  return (
    <Card className="border-border" data-testid={testId}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-7 w-32" />
        ) : isError ? (
          <div className="text-sm text-muted-foreground">Failed to load.</div>
        ) : (
          <div className="text-2xl font-semibold text-foreground">{value}</div>
        )}
        {!isLoading && !isError && helper ? (
          <div className="mt-1 text-xs text-muted-foreground">{helper}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function UsageChartCard({
  title,
  isLoading,
  isError,
  isEmpty,
  testId,
  children,
}: {
  title: string;
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  testId: string;
  children: ReactNode;
}) {
  return (
    <Card className="border-border" data-testid={testId}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : isError ? (
          <div className="text-sm text-muted-foreground">Failed to load chart data.</div>
        ) : isEmpty ? (
          <div className="text-sm text-muted-foreground">No usage data for this period.</div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

export function OrganizationUsageTab() {
  useDocumentTitle('Usage');

  const { id } = useParams();
  const organizationId = id ?? '';

  const [rangeOption, setRangeOption] = useState<RangeOption>('24h');
  const [customStart, setCustomStart] = useState(() => formatDateInput(new Date(Date.now() - 6 * 86400000)));
  const [customEnd, setCustomEnd] = useState(() => formatDateInput(new Date()));

  const { range, error: rangeError } = useMemo(
    () => buildRange(rangeOption, customStart, customEnd),
    [rangeOption, customStart, customEnd],
  );
  const rangeKey = range ? `${range.start.toISOString()}-${range.end.toISOString()}` : 'invalid';

  const startTimestamp = range ? toTimestamp(range.start) : undefined;
  const endTimestamp = range ? toTimestamp(range.end) : undefined;
  const isRangeReady = Boolean(range && organizationId);

  const usageQueries = useQueries({
    queries: usageQueryConfigs.map((config) => ({
      queryKey: ['metering', organizationId, rangeKey, config.key],
      queryFn: () => {
        if (!startTimestamp || !endTimestamp) {
          throw new Error('Usage range not available.');
        }
        return meteringClient.queryUsage({
          orgId: organizationId,
          start: startTimestamp,
          end: endTimestamp,
          unit: config.unit,
          labelFilters: config.labelFilters ?? {},
          groupBy: config.groupBy ?? '',
          granularity: config.granularity,
        });
      },
      enabled: isRangeReady,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    })),
  });

  const queriesByKey = Object.fromEntries(
    usageQueryConfigs.map((config, index) => [config.key, usageQueries[index]]),
  ) as Record<string, UseQueryResult<QueryUsageResponse, Error>>;

  const llmInputQuery = queriesByKey['llm-input-total'];
  const llmCachedQuery = queriesByKey['llm-cached-total'];
  const llmOutputQuery = queriesByKey['llm-output-total'];
  const llmRequestsQuery = queriesByKey['llm-requests-total'];
  const llmDailyQuery = queriesByKey['llm-daily-tokens'];
  const llmConsumersQuery = queriesByKey['llm-consumers-total'];
  const llmModelsQuery = queriesByKey['llm-models-total'];

  const computeCpuQuery = queriesByKey['compute-cpu-total'];
  const computeRamQuery = queriesByKey['compute-ram-total'];
  const computeCpuDailyQuery = queriesByKey['compute-cpu-daily'];
  const computeRamDailyQuery = queriesByKey['compute-ram-daily'];
  const computeConsumersQuery = queriesByKey['compute-consumers-total'];

  const storageTotalQuery = queriesByKey['storage-total'];
  const storageDailyQuery = queriesByKey['storage-daily'];
  const storageConsumersQuery = queriesByKey['storage-consumers-total'];

  const platformThreadsQuery = queriesByKey['platform-threads-total'];
  const platformMessagesQuery = queriesByKey['platform-messages-total'];
  const platformThreadsDailyQuery = queriesByKey['platform-threads-daily'];
  const platformMessagesDailyQuery = queriesByKey['platform-messages-daily'];

  const llmRequestsTotals = useMemo(
    () => groupTotalsByValue(llmRequestsQuery.data?.buckets ?? []),
    [llmRequestsQuery.data?.buckets],
  );
  const llmRequestSuccess = llmRequestsTotals.get('success') ?? 0n;
  const llmRequestFailed = llmRequestsTotals.get('failed') ?? 0n;
  const llmRequestsTotal = Array.from(llmRequestsTotals.values()).reduce((sum, value) => sum + value, 0n);

  const llmDailySeries = useMemo(
    () => buildDailySeries(llmDailyQuery.data?.buckets ?? [], ['input', 'cached', 'output']),
    [llmDailyQuery.data?.buckets],
  );
  const llmConsumerSeries = useMemo(
    () => buildTopGroups(llmConsumersQuery.data?.buckets ?? []),
    [llmConsumersQuery.data?.buckets],
  );
  const llmModelSeries = useMemo(
    () => buildTopGroups(llmModelsQuery.data?.buckets ?? []),
    [llmModelsQuery.data?.buckets],
  );

  const computeDailySeries = useMemo(
    () =>
      mergeDailySeries({
        cpu: buildDailySeriesMap(computeCpuDailyQuery.data?.buckets ?? []),
        ram: buildDailySeriesMap(computeRamDailyQuery.data?.buckets ?? []),
      }),
    [computeCpuDailyQuery.data?.buckets, computeRamDailyQuery.data?.buckets],
  );
  const computeConsumersSeries = useMemo(
    () => buildTopGroups(computeConsumersQuery.data?.buckets ?? []),
    [computeConsumersQuery.data?.buckets],
  );

  const storageDailySeries = useMemo(
    () => mergeDailySeries({ storage: buildDailySeriesMap(storageDailyQuery.data?.buckets ?? []) }),
    [storageDailyQuery.data?.buckets],
  );
  const storageConsumersSeries = useMemo(
    () => buildTopGroups(storageConsumersQuery.data?.buckets ?? []),
    [storageConsumersQuery.data?.buckets],
  );

  const platformDailySeries = useMemo(
    () =>
      mergeDailySeries({
        threads: buildDailySeriesMap(platformThreadsDailyQuery.data?.buckets ?? []),
        messages: buildDailySeriesMap(platformMessagesDailyQuery.data?.buckets ?? []),
      }),
    [platformThreadsDailyQuery.data?.buckets, platformMessagesDailyQuery.data?.buckets],
  );

  const hasUsageData =
    isRangeReady &&
    usageQueries.some((query) => (query.data?.buckets ?? []).some((bucket) => bucket.value !== 0n));
  const hasUsageError = isRangeReady && usageQueries.some((query) => query.isError);
  const isUsageLoading = isRangeReady && usageQueries.some((query) => query.isPending);

  const llmInputTotal = sumUsageBuckets(llmInputQuery.data?.buckets ?? []);
  const llmCachedTotal = sumUsageBuckets(llmCachedQuery.data?.buckets ?? []);
  const llmOutputTotal = sumUsageBuckets(llmOutputQuery.data?.buckets ?? []);

  const computeCpuTotal = sumUsageBuckets(computeCpuQuery.data?.buckets ?? []);
  const computeRamTotal = sumUsageBuckets(computeRamQuery.data?.buckets ?? []);

  const storageTotal = sumUsageBuckets(storageTotalQuery.data?.buckets ?? []);
  const platformThreadsTotal = sumUsageBuckets(platformThreadsQuery.data?.buckets ?? []);
  const platformMessagesTotal = sumUsageBuckets(platformMessagesQuery.data?.buckets ?? []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4" data-testid="organization-usage-header">
        <div>
          <h2 className="text-base font-semibold text-foreground">Usage dashboard</h2>
          <p className="text-sm text-muted-foreground">
            Monitor consumption across LLM, compute, storage, and platform activity.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3" data-testid="organization-usage-range-select">
          <Select value={rangeOption} onValueChange={(value) => setRangeOption(value as RangeOption)}>
            <SelectTrigger>
              <SelectValue placeholder="Select range" />
            </SelectTrigger>
            <SelectContent>
              {rangeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {rangeOption === 'custom' ? (
        <div className="flex flex-wrap items-center gap-3" data-testid="organization-usage-custom-range">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Start date</span>
            <Input
              type="date"
              value={customStart}
              onChange={(event) => setCustomStart(event.target.value)}
              data-testid="organization-usage-custom-start"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">End date</span>
            <Input
              type="date"
              value={customEnd}
              onChange={(event) => setCustomEnd(event.target.value)}
              data-testid="organization-usage-custom-end"
            />
          </div>
        </div>
      ) : null}
      {rangeError ? <div className="text-sm text-destructive">{rangeError}</div> : null}
      {hasUsageError ? (
        <div className="text-sm text-muted-foreground">Some usage data failed to load.</div>
      ) : null}
      {!isRangeReady ? null : !isUsageLoading && !hasUsageData ? (
        <Card className="border-border" data-testid="organization-usage-empty">
          <CardContent className="text-sm text-muted-foreground">No usage data for this period.</CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          <section className="space-y-4" data-testid="organization-usage-llm-section">
            <div>
              <h3 className="text-base font-semibold text-foreground">LLM usage</h3>
              <p className="text-sm text-muted-foreground">Token consumption and request volume.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" data-testid="organization-usage-llm-metrics">
              <UsageMetricCard
                label="Input tokens"
                value={formatUsageValue(llmInputTotal)}
                isLoading={llmInputQuery.isPending}
                isError={llmInputQuery.isError}
                testId="organization-usage-llm-input"
              />
              <UsageMetricCard
                label="Cached tokens"
                value={formatUsageValue(llmCachedTotal)}
                isLoading={llmCachedQuery.isPending}
                isError={llmCachedQuery.isError}
                testId="organization-usage-llm-cached"
              />
              <UsageMetricCard
                label="Output tokens"
                value={formatUsageValue(llmOutputTotal)}
                isLoading={llmOutputQuery.isPending}
                isError={llmOutputQuery.isError}
                testId="organization-usage-llm-output"
              />
              <UsageMetricCard
                label="Requests"
                value={formatUsageValue(llmRequestsTotal)}
                helper={`${formatUsageValue(llmRequestSuccess)} ${statusLabels.success.toLowerCase()} / ${formatUsageValue(
                  llmRequestFailed,
                )} ${statusLabels.failed.toLowerCase()}`}
                isLoading={llmRequestsQuery.isPending}
                isError={llmRequestsQuery.isError}
                testId="organization-usage-llm-requests"
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <UsageChartCard
                title="Daily tokens by kind"
                isLoading={llmDailyQuery.isPending}
                isError={llmDailyQuery.isError}
                isEmpty={llmDailySeries.length === 0}
                testId="organization-usage-llm-daily-chart"
              >
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={llmDailySeries} margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(value) => formatUsageNumber(value)} />
                    <Tooltip formatter={(value) => formatUsageNumber(Number(value))} />
                    <Legend formatter={(value) => llmKindLabels[value as string] ?? value} />
                    <Bar dataKey="input" stackId="tokens" fill="var(--color-chart-1)" />
                    <Bar dataKey="cached" stackId="tokens" fill="var(--color-chart-2)" />
                    <Bar dataKey="output" stackId="tokens" fill="var(--color-chart-3)" />
                  </BarChart>
                </ResponsiveContainer>
              </UsageChartCard>
              <UsageChartCard
                title="Top consumers"
                isLoading={llmConsumersQuery.isPending}
                isError={llmConsumersQuery.isError}
                isEmpty={llmConsumerSeries.length === 0}
                testId="organization-usage-llm-consumers-chart"
              >
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={llmConsumerSeries} layout="vertical" margin={{ left: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(value) => formatUsageNumber(value)} />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={120}
                      tickFormatter={(value) => truncate(value, 18)}
                    />
                    <Tooltip formatter={(value) => formatUsageNumber(Number(value))} />
                    <Bar dataKey="value" fill="var(--color-chart-4)" />
                  </BarChart>
                </ResponsiveContainer>
              </UsageChartCard>
            </div>
            <UsageChartCard
              title="Top models"
              isLoading={llmModelsQuery.isPending}
              isError={llmModelsQuery.isError}
              isEmpty={llmModelSeries.length === 0}
              testId="organization-usage-llm-models-chart"
            >
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={llmModelSeries} layout="vertical" margin={{ left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(value) => formatUsageNumber(value)} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={160}
                    tickFormatter={(value) => truncate(value, 22)}
                  />
                  <Tooltip formatter={(value) => formatUsageNumber(Number(value))} />
                  <Bar dataKey="value" fill="var(--color-chart-5)" />
                </BarChart>
              </ResponsiveContainer>
            </UsageChartCard>
          </section>

          <section className="space-y-4" data-testid="organization-usage-compute-section">
            <div>
              <h3 className="text-base font-semibold text-foreground">Compute usage</h3>
              <p className="text-sm text-muted-foreground">CPU and RAM consumption over time.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2" data-testid="organization-usage-compute-metrics">
              <UsageMetricCard
                label="CPU core seconds"
                value={formatUsageValue(computeCpuTotal)}
                isLoading={computeCpuQuery.isPending}
                isError={computeCpuQuery.isError}
                testId="organization-usage-compute-cpu"
              />
              <UsageMetricCard
                label="RAM GB seconds"
                value={formatUsageValue(computeRamTotal)}
                isLoading={computeRamQuery.isPending}
                isError={computeRamQuery.isError}
                testId="organization-usage-compute-ram"
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <UsageChartCard
                title="Daily CPU & RAM"
                isLoading={computeCpuDailyQuery.isPending || computeRamDailyQuery.isPending}
                isError={computeCpuDailyQuery.isError || computeRamDailyQuery.isError}
                isEmpty={computeDailySeries.length === 0}
                testId="organization-usage-compute-daily-chart"
              >
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={computeDailySeries} margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(value) => formatUsageNumber(value)} />
                    <Tooltip formatter={(value) => formatUsageNumber(Number(value))} />
                    <Legend />
                    <Bar dataKey="cpu" name="CPU core seconds" fill="var(--color-chart-2)" />
                    <Bar dataKey="ram" name="RAM GB seconds" fill="var(--color-chart-3)" />
                  </BarChart>
                </ResponsiveContainer>
              </UsageChartCard>
              <UsageChartCard
                title="Top consumers"
                isLoading={computeConsumersQuery.isPending}
                isError={computeConsumersQuery.isError}
                isEmpty={computeConsumersSeries.length === 0}
                testId="organization-usage-compute-consumers-chart"
              >
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={computeConsumersSeries} layout="vertical" margin={{ left: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(value) => formatUsageNumber(value)} />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={120}
                      tickFormatter={(value) => truncate(value, 18)}
                    />
                    <Tooltip formatter={(value) => formatUsageNumber(Number(value))} />
                    <Bar dataKey="value" fill="var(--color-chart-1)" />
                  </BarChart>
                </ResponsiveContainer>
              </UsageChartCard>
            </div>
          </section>

          <section className="space-y-4" data-testid="organization-usage-storage-section">
            <div>
              <h3 className="text-base font-semibold text-foreground">Storage usage</h3>
              <p className="text-sm text-muted-foreground">Persistent storage allocation over time.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2" data-testid="organization-usage-storage-metrics">
              <UsageMetricCard
                label="Storage GB seconds"
                value={formatUsageValue(storageTotal)}
                isLoading={storageTotalQuery.isPending}
                isError={storageTotalQuery.isError}
                testId="organization-usage-storage-total"
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <UsageChartCard
                title="Daily storage"
                isLoading={storageDailyQuery.isPending}
                isError={storageDailyQuery.isError}
                isEmpty={storageDailySeries.length === 0}
                testId="organization-usage-storage-daily-chart"
              >
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={storageDailySeries} margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(value) => formatUsageNumber(value)} />
                    <Tooltip formatter={(value) => formatUsageNumber(Number(value))} />
                    <Bar dataKey="storage" name="Storage GB seconds" fill="var(--color-chart-4)" />
                  </BarChart>
                </ResponsiveContainer>
              </UsageChartCard>
              <UsageChartCard
                title="Top consumers"
                isLoading={storageConsumersQuery.isPending}
                isError={storageConsumersQuery.isError}
                isEmpty={storageConsumersSeries.length === 0}
                testId="organization-usage-storage-consumers-chart"
              >
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={storageConsumersSeries} layout="vertical" margin={{ left: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(value) => formatUsageNumber(value)} />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={120}
                      tickFormatter={(value) => truncate(value, 18)}
                    />
                    <Tooltip formatter={(value) => formatUsageNumber(Number(value))} />
                    <Bar dataKey="value" fill="var(--color-chart-5)" />
                  </BarChart>
                </ResponsiveContainer>
              </UsageChartCard>
            </div>
          </section>

          <section className="space-y-4" data-testid="organization-usage-platform-section">
            <div>
              <h3 className="text-base font-semibold text-foreground">Platform usage</h3>
              <p className="text-sm text-muted-foreground">Threads and messages created by this organization.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2" data-testid="organization-usage-platform-metrics">
              <UsageMetricCard
                label="Threads created"
                value={formatUsageValue(platformThreadsTotal)}
                isLoading={platformThreadsQuery.isPending}
                isError={platformThreadsQuery.isError}
                testId="organization-usage-platform-threads"
              />
              <UsageMetricCard
                label="Messages sent"
                value={formatUsageValue(platformMessagesTotal)}
                isLoading={platformMessagesQuery.isPending}
                isError={platformMessagesQuery.isError}
                testId="organization-usage-platform-messages"
              />
            </div>
            <UsageChartCard
              title="Daily threads & messages"
              isLoading={platformThreadsDailyQuery.isPending || platformMessagesDailyQuery.isPending}
              isError={platformThreadsDailyQuery.isError || platformMessagesDailyQuery.isError}
              isEmpty={platformDailySeries.length === 0}
              testId="organization-usage-platform-daily-chart"
            >
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={platformDailySeries} margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(value) => formatUsageNumber(value)} />
                  <Tooltip formatter={(value) => formatUsageNumber(Number(value))} />
                  <Legend />
                  <Bar dataKey="threads" name="Threads" fill="var(--color-chart-2)" />
                  <Bar dataKey="messages" name="Messages" fill="var(--color-chart-3)" />
                </BarChart>
              </ResponsiveContainer>
            </UsageChartCard>
          </section>
        </div>
      )}
    </div>
  );
}
