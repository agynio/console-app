import { useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { Code, ConnectError } from '@connectrpc/connect';
import type { UseQueryResult } from '@tanstack/react-query';
import { useQueries, useQuery } from '@tanstack/react-query';
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
import { llmClient, meteringClient } from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Granularity,
  QueryUsageResponseSchema,
  Unit,
  type QueryUsageResponse,
  type UsageBucket,
} from '@/gen/agynio/api/metering/v1/metering_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useIdentityHandles } from '@/hooks/useIdentityHandles';
import { formatDateOnly, formatTimestamp, timestampToMillis, truncate } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import {
  formatUsageHours,
  formatUsageHoursNumber,
  formatUsageNumber,
  formatUsageValue,
  microsToHours,
  microsToNumber,
} from '@/lib/usage';

type RangeOption = '24h' | '7d' | '30d' | 'custom';

type RangeSelection = {
  start: Date;
  end: Date;
};

type UsageQueryConfig = {
  key: string;
  unit: Unit;
  granularity: Granularity;
  useRangeGranularity?: boolean;
  labelFilters?: Record<string, string>;
  groupBy?: string;
};

type ChartSeries = {
  date: string;
  [key: string]: number | string;
};

type TopGroupBase = {
  id: string;
  label: string;
  detail?: string;
};

type TopGroup = TopGroupBase & {
  value: number;
};

type TopGroupSeries = TopGroupBase & {
  cpu: number;
  ram: number;
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
    useRangeGranularity: true,
    groupBy: 'kind',
  },
  {
    key: 'llm-consumers-input-total',
    unit: Unit.TOKENS,
    granularity: Granularity.TOTAL,
    labelFilters: { kind: 'input' },
    groupBy: 'identity_id',
  },
  {
    key: 'llm-consumers-output-total',
    unit: Unit.TOKENS,
    granularity: Granularity.TOTAL,
    labelFilters: { kind: 'output' },
    groupBy: 'identity_id',
  },
  {
    key: 'llm-models-input-total',
    unit: Unit.TOKENS,
    granularity: Granularity.TOTAL,
    labelFilters: { kind: 'input' },
    groupBy: 'resource_id',
  },
  {
    key: 'llm-models-output-total',
    unit: Unit.TOKENS,
    granularity: Granularity.TOTAL,
    labelFilters: { kind: 'output' },
    groupBy: 'resource_id',
  },
  { key: 'compute-cpu-total', unit: Unit.CORE_SECONDS, granularity: Granularity.TOTAL },
  {
    key: 'compute-ram-total',
    unit: Unit.GB_SECONDS,
    granularity: Granularity.TOTAL,
    labelFilters: { kind: 'ram' },
  },
  {
    key: 'compute-cpu-daily',
    unit: Unit.CORE_SECONDS,
    granularity: Granularity.DAY,
    useRangeGranularity: true,
  },
  {
    key: 'compute-ram-daily',
    unit: Unit.GB_SECONDS,
    granularity: Granularity.DAY,
    useRangeGranularity: true,
    labelFilters: { kind: 'ram' },
  },
  {
    key: 'compute-consumers-cpu-total',
    unit: Unit.CORE_SECONDS,
    granularity: Granularity.TOTAL,
    groupBy: 'identity_id',
  },
  {
    key: 'compute-consumers-ram-total',
    unit: Unit.GB_SECONDS,
    granularity: Granularity.TOTAL,
    labelFilters: { kind: 'ram' },
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
    useRangeGranularity: true,
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

function isUsageUnavailable(error: unknown): boolean {
  return error instanceof ConnectError && (error.code === Code.Unimplemented || error.code === Code.NotFound);
}

async function queryUsageSafely({
  organizationId,
  start,
  end,
  config,
  rangeGranularity,
  timeZone,
}: {
  organizationId: string;
  start: Timestamp;
  end: Timestamp;
  config: UsageQueryConfig;
  rangeGranularity: Granularity;
  timeZone: string;
}): Promise<QueryUsageResponse> {
  const granularity = config.useRangeGranularity ? rangeGranularity : config.granularity;
  try {
    return await meteringClient.queryUsage({
      orgId: organizationId,
      start,
      end,
      unit: config.unit,
      labelFilters: config.labelFilters ?? {},
      groupBy: config.groupBy ?? '',
      granularity,
      timeZone,
    });
  } catch (error) {
    if (isUsageUnavailable(error)) {
      return create(QueryUsageResponseSchema, { buckets: [] });
    }
    throw error;
  }
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
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
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

function resolveRangeGranularity(option: RangeOption, range: RangeSelection): Granularity {
  if (option === '24h') return Granularity.FIVE_MINUTES;
  if (option === '7d') return Granularity.HOUR;
  if (option === '30d') return Granularity.SIX_HOURS;

  const rangeMs = range.end.getTime() - range.start.getTime();
  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * hourMs;
  if (rangeMs <= dayMs) return Granularity.FIVE_MINUTES;
  if (rangeMs <= 7 * dayMs) return Granularity.HOUR;
  if (rangeMs <= 30 * dayMs) return Granularity.SIX_HOURS;
  return Granularity.DAY;
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

function mergeTotalsMaps(...maps: Array<Map<string, bigint>>): Map<string, bigint> {
  return maps.reduce((merged, map) => {
    map.forEach((value, key) => {
      merged.set(key, (merged.get(key) ?? 0n) + value);
    });
    return merged;
  }, new Map<string, bigint>());
}

function mapTotalsToNumbers(
  totals: Map<string, bigint>,
  valueTransform: (value: bigint) => number,
): Map<string, number> {
  const mapped = new Map<string, number>();
  totals.forEach((value, key) => {
    mapped.set(key, valueTransform(value));
  });
  return mapped;
}

function buildTopGroupIds(totals: Map<string, number>, limit = 5): string[] {
  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}

function buildTopGroups(
  totals: Map<string, number>,
  options: {
    limit?: number;
    labelResolver?: (id: string) => string;
    detailResolver?: (id: string) => string;
  } = {},
): TopGroup[] {
  const { limit = 5, labelResolver = (id: string) => id, detailResolver } = options;
  return Array.from(totals.entries())
    .map(([id, value]) => ({
      id,
      label: labelResolver(id),
      detail: detailResolver?.(id),
      value,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function buildTopGroupSeries(
  ids: string[],
  totals: { cpu: Map<string, number>; ram: Map<string, number> },
  options: { labelResolver?: (id: string) => string; detailResolver?: (id: string) => string } = {},
): TopGroupSeries[] {
  const { labelResolver = (id: string) => id, detailResolver } = options;
  return ids.map((id) => ({
    id,
    label: labelResolver(id),
    detail: detailResolver?.(id),
    cpu: totals.cpu.get(id) ?? 0,
    ram: totals.ram.get(id) ?? 0,
  }));
}

function formatBucketLabel(timestamp: Timestamp, granularity: Granularity): string {
  if (granularity === Granularity.DAY) {
    return formatDateOnly(timestamp);
  }
  return formatTimestamp(timestamp);
}

function buildLlmTokenSeries(buckets: UsageBucket[], granularity: Granularity): ChartSeries[] {
  const seriesMap = new Map<
    string,
    {
      timestamp: number;
      label: string;
      input: number;
      cached: number;
      output: number;
    }
  >();

  buckets.forEach((bucket) => {
    if (!bucket.timestamp) return;
    const timestamp = timestampToMillis(bucket.timestamp);
    const key = String(timestamp);
    const current = seriesMap.get(key) ?? {
      timestamp,
      label: formatBucketLabel(bucket.timestamp, granularity),
      input: 0,
      cached: 0,
      output: 0,
    };
    const groupKey = bucket.groupValue || 'unknown';
    const value = microsToNumber(bucket.value);
    if (groupKey === 'input') {
      current.input += value;
    }
    if (groupKey === 'cached') {
      current.cached += value;
    }
    if (groupKey === 'output') {
      current.output += value;
    }
    seriesMap.set(key, current);
  });

  return Array.from(seriesMap.values())
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((entry) => ({
      date: entry.label,
      input: entry.input - entry.cached,
      cached: entry.cached,
      output: entry.output,
    }));
}

function buildTimeSeriesMap(
  buckets: UsageBucket[],
  granularity: Granularity,
  valueTransform: (value: bigint) => number = microsToNumber,
): Map<string, { timestamp: number; label: string; value: number }> {
  return buckets.reduce((map, bucket) => {
    if (!bucket.timestamp) return map;
    const timestamp = timestampToMillis(bucket.timestamp);
    const key = String(timestamp);
    const entry = map.get(key) ?? {
      timestamp,
      label: formatBucketLabel(bucket.timestamp, granularity),
      value: 0,
    };
    entry.value += valueTransform(bucket.value);
    map.set(key, entry);
    return map;
  }, new Map<string, { timestamp: number; label: string; value: number }>());
}

function mergeTimeSeries(
  series: Record<string, Map<string, { timestamp: number; label: string; value: number }>>,
): ChartSeries[] {
  const merged = new Map<
    string,
    { timestamp: number; label: string; values: Record<string, number> }
  >();
  const keys = Object.keys(series);

  keys.forEach((key) => {
    series[key]?.forEach((entry, timestampKey) => {
      const current = merged.get(timestampKey) ?? {
        timestamp: entry.timestamp,
        label: entry.label,
        values: {},
      };
      current.values[key] = entry.value;
      current.timestamp = Math.min(current.timestamp, entry.timestamp);
      merged.set(timestampKey, current);
    });
  });

  return Array.from(merged.values())
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((entry) => {
      const values = keys.reduce<Record<string, number>>((acc, key) => {
        acc[key] = entry.values[key] ?? 0;
        return acc;
      }, {});
      return { date: entry.label, ...values };
    });
}

function formatTopGroupTooltipLabel(label: ReactNode, payload: readonly unknown[]): ReactNode {
  const entry = (payload[0] as { payload?: TopGroupBase } | undefined)?.payload;
  if (!entry?.id) return label;
  if (entry.detail) {
    if (!entry.label || entry.label === entry.detail) return entry.detail;
    return `${entry.label} (${entry.detail})`;
  }
  if (entry.label === entry.id) return entry.id;
  return `${entry.label} (${entry.id})`;
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
  const rangeGranularity = useMemo(
    () => (range ? resolveRangeGranularity(rangeOption, range) : Granularity.DAY),
    [rangeOption, range],
  );
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  const startTimestamp = range ? toTimestamp(range.start) : undefined;
  const endTimestamp = range ? toTimestamp(range.end) : undefined;
  const isRangeReady = Boolean(range && organizationId);

  const usageQueries = useQueries({
    queries: usageQueryConfigs.map((config) => ({
      queryKey: ['metering', organizationId, rangeKey, rangeGranularity, timeZone, config.key],
      queryFn: () => {
        if (!startTimestamp || !endTimestamp) {
          throw new Error('Usage range not available.');
        }
        return queryUsageSafely({
          organizationId,
          start: startTimestamp,
          end: endTimestamp,
          config,
          rangeGranularity,
          timeZone,
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
  const llmConsumersInputQuery = queriesByKey['llm-consumers-input-total'];
  const llmConsumersOutputQuery = queriesByKey['llm-consumers-output-total'];
  const llmModelsInputQuery = queriesByKey['llm-models-input-total'];
  const llmModelsOutputQuery = queriesByKey['llm-models-output-total'];

  const computeCpuQuery = queriesByKey['compute-cpu-total'];
  const computeRamQuery = queriesByKey['compute-ram-total'];
  const computeCpuDailyQuery = queriesByKey['compute-cpu-daily'];
  const computeRamDailyQuery = queriesByKey['compute-ram-daily'];
  const computeConsumersCpuQuery = queriesByKey['compute-consumers-cpu-total'];
  const computeConsumersRamQuery = queriesByKey['compute-consumers-ram-total'];

  const storageTotalQuery = queriesByKey['storage-total'];
  const storageDailyQuery = queriesByKey['storage-daily'];
  const storageConsumersQuery = queriesByKey['storage-consumers-total'];

  const platformThreadsQuery = queriesByKey['platform-threads-total'];
  const platformMessagesQuery = queriesByKey['platform-messages-total'];
  const platformThreadsDailyQuery = queriesByKey['platform-threads-daily'];
  const platformMessagesDailyQuery = queriesByKey['platform-messages-daily'];

  const modelsQuery = useQuery({
    queryKey: ['llm', 'models', organizationId],
    queryFn: () => llmClient.listModels({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const llmRequestsTotals = useMemo(
    () => groupTotalsByValue(llmRequestsQuery.data?.buckets ?? []),
    [llmRequestsQuery.data?.buckets],
  );
  const llmRequestSuccess = llmRequestsTotals.get('success') ?? 0n;
  const llmRequestFailed = llmRequestsTotals.get('failed') ?? 0n;

  const modelNameMap = useMemo(() => {
    const models = modelsQuery.data?.models ?? [];
    return new Map(
      models.flatMap((model) => {
        const modelId = model.meta?.id;
        return modelId ? ([[modelId, model.name]] as const) : [];
      }),
    );
  }, [modelsQuery.data?.models]);

  const llmDailySeries = useMemo(
    () => buildLlmTokenSeries(llmDailyQuery.data?.buckets ?? [], rangeGranularity),
    [llmDailyQuery.data?.buckets, rangeGranularity],
  );

  const llmConsumerTotals = useMemo(() => {
    const inputTotals = groupTotalsByValue(llmConsumersInputQuery.data?.buckets ?? []);
    const outputTotals = groupTotalsByValue(llmConsumersOutputQuery.data?.buckets ?? []);
    return mapTotalsToNumbers(mergeTotalsMaps(inputTotals, outputTotals), microsToNumber);
  }, [llmConsumersInputQuery.data?.buckets, llmConsumersOutputQuery.data?.buckets]);

  const llmModelTotals = useMemo(() => {
    const inputTotals = groupTotalsByValue(llmModelsInputQuery.data?.buckets ?? []);
    const outputTotals = groupTotalsByValue(llmModelsOutputQuery.data?.buckets ?? []);
    return mapTotalsToNumbers(mergeTotalsMaps(inputTotals, outputTotals), microsToNumber);
  }, [llmModelsInputQuery.data?.buckets, llmModelsOutputQuery.data?.buckets]);

  const computeConsumerCpuTotals = useMemo(
    () => mapTotalsToNumbers(groupTotalsByValue(computeConsumersCpuQuery.data?.buckets ?? []), microsToHours),
    [computeConsumersCpuQuery.data?.buckets],
  );
  const computeConsumerRamTotals = useMemo(
    () => mapTotalsToNumbers(groupTotalsByValue(computeConsumersRamQuery.data?.buckets ?? []), microsToHours),
    [computeConsumersRamQuery.data?.buckets],
  );

  const storageConsumerTotals = useMemo(
    () => mapTotalsToNumbers(groupTotalsByValue(storageConsumersQuery.data?.buckets ?? []), microsToHours),
    [storageConsumersQuery.data?.buckets],
  );

  const topLlmConsumerIds = useMemo(() => buildTopGroupIds(llmConsumerTotals), [llmConsumerTotals]);
  const topComputeConsumerIds = useMemo(() => {
    const cpuLeaders = buildTopGroupIds(computeConsumerCpuTotals);
    const ramLeaders = buildTopGroupIds(computeConsumerRamTotals);
    const candidates = Array.from(new Set([...cpuLeaders, ...ramLeaders]));
    return candidates
      .map((id) => ({
        id,
        rank: Math.max(computeConsumerCpuTotals.get(id) ?? 0, computeConsumerRamTotals.get(id) ?? 0),
      }))
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 5)
      .map(({ id }) => id);
  }, [computeConsumerCpuTotals, computeConsumerRamTotals]);
  const topStorageConsumerIds = useMemo(() => buildTopGroupIds(storageConsumerTotals), [storageConsumerTotals]);

  const identityIds = useMemo(
    () => Array.from(new Set([...topLlmConsumerIds, ...topComputeConsumerIds, ...topStorageConsumerIds])),
    [topLlmConsumerIds, topComputeConsumerIds, topStorageConsumerIds],
  );

  const { formatHandleLabel, formatHandleTooltip } = useIdentityHandles(identityIds);

  const llmConsumerSeries = useMemo(
    () =>
      buildTopGroups(llmConsumerTotals, {
        labelResolver: (id) => formatHandleLabel(id),
        detailResolver: (id) => formatHandleTooltip(id),
      }),
    [llmConsumerTotals, formatHandleLabel, formatHandleTooltip],
  );
  const llmModelSeries = useMemo(
    () => buildTopGroups(llmModelTotals, { labelResolver: (id) => modelNameMap.get(id) ?? id }),
    [llmModelTotals, modelNameMap],
  );

  const computeDailySeries = useMemo(
    () =>
      mergeTimeSeries({
        cpu: buildTimeSeriesMap(computeCpuDailyQuery.data?.buckets ?? [], rangeGranularity, microsToHours),
        ram: buildTimeSeriesMap(computeRamDailyQuery.data?.buckets ?? [], rangeGranularity, microsToHours),
      }),
    [computeCpuDailyQuery.data?.buckets, computeRamDailyQuery.data?.buckets, rangeGranularity],
  );
  const computeConsumersSeries = useMemo(
    () =>
      buildTopGroupSeries(
        topComputeConsumerIds,
        { cpu: computeConsumerCpuTotals, ram: computeConsumerRamTotals },
        {
          labelResolver: (id) => formatHandleLabel(id),
          detailResolver: (id) => formatHandleTooltip(id),
        },
      ),
    [
      computeConsumerCpuTotals,
      computeConsumerRamTotals,
      formatHandleLabel,
      formatHandleTooltip,
      topComputeConsumerIds,
    ],
  );

  const storageDailySeries = useMemo(
    () =>
      mergeTimeSeries({
        storage: buildTimeSeriesMap(storageDailyQuery.data?.buckets ?? [], rangeGranularity, microsToHours),
      }),
    [storageDailyQuery.data?.buckets, rangeGranularity],
  );
  const storageConsumersSeries = useMemo(
    () =>
      buildTopGroups(storageConsumerTotals, {
        labelResolver: (id) => formatHandleLabel(id),
        detailResolver: (id) => formatHandleTooltip(id),
      }),
    [storageConsumerTotals, formatHandleLabel, formatHandleTooltip],
  );

  const platformDailySeries = useMemo(
    () =>
      mergeTimeSeries({
        threads: buildTimeSeriesMap(platformThreadsDailyQuery.data?.buckets ?? [], rangeGranularity),
        messages: buildTimeSeriesMap(platformMessagesDailyQuery.data?.buckets ?? [], rangeGranularity),
      }),
    [platformThreadsDailyQuery.data?.buckets, platformMessagesDailyQuery.data?.buckets, rangeGranularity],
  );

  const hasUsageData =
    isRangeReady &&
    usageQueries.some((query) => (query.data?.buckets ?? []).some((bucket) => bucket.value !== 0n));
  const hasUsageError = isRangeReady && usageQueries.some((query) => query.isError);
  const isUsageLoading = isRangeReady && usageQueries.some((query) => query.isPending);

  const llmInputTotal = sumUsageBuckets(llmInputQuery.data?.buckets ?? []);
  const llmCachedTotal = sumUsageBuckets(llmCachedQuery.data?.buckets ?? []);
  const llmOutputTotal = sumUsageBuckets(llmOutputQuery.data?.buckets ?? []);
  const cachedInputHelper = useMemo(() => {
    if (llmInputQuery.isPending || llmInputQuery.isError) return undefined;
    return `of ${formatUsageValue(llmInputTotal)} input`;
  }, [llmInputQuery.isPending, llmInputQuery.isError, llmInputTotal]);

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
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5" data-testid="organization-usage-llm-metrics">
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
                helper={cachedInputHelper}
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
                label={`Requests (${statusLabels.success})`}
                value={formatUsageValue(llmRequestSuccess)}
                isLoading={llmRequestsQuery.isPending}
                isError={llmRequestsQuery.isError}
                testId="organization-usage-llm-requests-success"
              />
              <UsageMetricCard
                label={`Requests (${statusLabels.failed})`}
                value={formatUsageValue(llmRequestFailed)}
                isLoading={llmRequestsQuery.isPending}
                isError={llmRequestsQuery.isError}
                testId="organization-usage-llm-requests-failed"
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <UsageChartCard
                title="Tokens over time"
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
                    <Tooltip
                      formatter={(value) => formatUsageNumber(Number(value))}
                      labelFormatter={formatTopGroupTooltipLabel}
                    />
                    <Legend formatter={(value) => llmKindLabels[value as string] ?? value} />
                    <Bar dataKey="input" stackId="input" fill="var(--color-chart-1)" />
                    <Bar dataKey="cached" stackId="input" fill="var(--color-chart-2)" />
                    <Bar dataKey="output" stackId="output" fill="var(--color-chart-3)" />
                  </BarChart>
                </ResponsiveContainer>
              </UsageChartCard>
              <UsageChartCard
                title="Top consumers"
                isLoading={llmConsumersInputQuery.isPending || llmConsumersOutputQuery.isPending}
                isError={llmConsumersInputQuery.isError || llmConsumersOutputQuery.isError}
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
                    <Tooltip
                      formatter={(value) => formatUsageNumber(Number(value))}
                      labelFormatter={formatTopGroupTooltipLabel}
                    />
                    <Bar dataKey="value" fill="var(--color-chart-1)" />
                  </BarChart>
                </ResponsiveContainer>
              </UsageChartCard>
            </div>
            <UsageChartCard
              title="Top models"
              isLoading={llmModelsInputQuery.isPending || llmModelsOutputQuery.isPending || modelsQuery.isPending}
              isError={llmModelsInputQuery.isError || llmModelsOutputQuery.isError}
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
                  <Tooltip
                    formatter={(value) => formatUsageNumber(Number(value))}
                    labelFormatter={formatTopGroupTooltipLabel}
                  />
                  <Bar dataKey="value" fill="var(--color-chart-2)" />
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
                label="CPU-core-hours"
                value={formatUsageHours(computeCpuTotal)}
                isLoading={computeCpuQuery.isPending}
                isError={computeCpuQuery.isError}
                testId="organization-usage-compute-cpu"
              />
              <UsageMetricCard
                label="RAM-GB-hours"
                value={formatUsageHours(computeRamTotal)}
                isLoading={computeRamQuery.isPending}
                isError={computeRamQuery.isError}
                testId="organization-usage-compute-ram"
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <UsageChartCard
                title="CPU & RAM over time"
                isLoading={computeCpuDailyQuery.isPending || computeRamDailyQuery.isPending}
                isError={computeCpuDailyQuery.isError || computeRamDailyQuery.isError}
                isEmpty={computeDailySeries.length === 0}
                testId="organization-usage-compute-daily-chart"
              >
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={computeDailySeries} margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(value) => formatUsageHoursNumber(value)} />
                    <Tooltip formatter={(value) => formatUsageHoursNumber(Number(value))} />
                    <Legend />
                    <Bar dataKey="cpu" name="CPU-core-hours" fill="var(--color-chart-1)" />
                    <Bar dataKey="ram" name="RAM-GB-hours" fill="var(--color-chart-4)" />
                  </BarChart>
                </ResponsiveContainer>
              </UsageChartCard>
              <UsageChartCard
                title="Top agents"
                isLoading={computeConsumersCpuQuery.isPending || computeConsumersRamQuery.isPending}
                isError={computeConsumersCpuQuery.isError || computeConsumersRamQuery.isError}
                isEmpty={computeConsumersSeries.length === 0}
                testId="organization-usage-compute-consumers-chart"
              >
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={computeConsumersSeries} layout="vertical" margin={{ left: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(value) => formatUsageHoursNumber(value)} />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={120}
                      tickFormatter={(value) => truncate(value, 18)}
                    />
                    <Legend />
                    <Tooltip
                      formatter={(value) => formatUsageHoursNumber(Number(value))}
                      labelFormatter={formatTopGroupTooltipLabel}
                    />
                    <Bar dataKey="cpu" name="CPU-core-hours" fill="var(--color-chart-1)" />
                    <Bar dataKey="ram" name="RAM-GB-hours" fill="var(--color-chart-4)" />
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
                label="Storage GB-hours"
                value={formatUsageHours(storageTotal)}
                isLoading={storageTotalQuery.isPending}
                isError={storageTotalQuery.isError}
                testId="organization-usage-storage-total"
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <UsageChartCard
                title="Storage over time"
                isLoading={storageDailyQuery.isPending}
                isError={storageDailyQuery.isError}
                isEmpty={storageDailySeries.length === 0}
                testId="organization-usage-storage-daily-chart"
              >
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={storageDailySeries} margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(value) => formatUsageHoursNumber(value)} />
                    <Tooltip formatter={(value) => formatUsageHoursNumber(Number(value))} />
                    <Bar dataKey="storage" name="GB-hours" fill="var(--color-chart-3)" />
                  </BarChart>
                </ResponsiveContainer>
              </UsageChartCard>
              <UsageChartCard
                title="Top agents"
                isLoading={storageConsumersQuery.isPending}
                isError={storageConsumersQuery.isError}
                isEmpty={storageConsumersSeries.length === 0}
                testId="organization-usage-storage-consumers-chart"
              >
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={storageConsumersSeries} layout="vertical" margin={{ left: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(value) => formatUsageHoursNumber(value)} />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={120}
                      tickFormatter={(value) => truncate(value, 18)}
                    />
                    <Tooltip
                      formatter={(value) => formatUsageHoursNumber(Number(value))}
                      labelFormatter={formatTopGroupTooltipLabel}
                    />
                    <Bar dataKey="value" fill="var(--color-chart-3)" />
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
              title="Threads & messages over time"
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
                  <Tooltip
                    formatter={(value) => formatUsageNumber(Number(value))}
                    labelFormatter={formatTopGroupTooltipLabel}
                  />
                  <Legend />
                  <Bar dataKey="threads" name="Threads" fill="var(--color-chart-1)" />
                  <Bar dataKey="messages" name="Messages" fill="var(--color-chart-2)" />
                </BarChart>
              </ResponsiveContainer>
            </UsageChartCard>
          </section>
        </div>
      )}
    </div>
  );
}
