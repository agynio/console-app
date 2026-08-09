import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { llmClient } from '@/api/client';
import { Card, CardContent } from '@/components/ui/card';
import { Granularity, Unit, type UsageBucket } from '@/gen/agynio/api/metering/v1/metering_pb';
import { useUsageGroups, type UsageGroupBy } from '@/hooks/useUsageGroups';
import { BarShape, ChartLegend, ChartTooltip, HorizontalBarShape } from '@/lib/chartMarks';
import {
  bucketTimestamp,
  chartAxis,
  chartGrid,
  compactNumber,
  fillTimeBuckets,
  formatBucketTick,
  formatBucketTitle,
  formatRangeLabel,
  tickStyle,
} from '@/lib/chartTheme';
import { truncate } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { formatUsageNumber, formatUsageValue, microsToNumber } from '@/lib/usage';
import {
  METERED_MODEL_TOKENS,
  consumerQueryConfigs,
  consumerQuerySources,
  identifiedGroupTotals,
  type UsageQueryConfig,
} from '@/lib/usageConsumers';
import { ConsumerChartCard, UsageChartCard, UsageMetricCard, type ConsumerRow } from './cards';
import type { UsageRange } from './range';
import { useUsageQueries } from './useUsageQueries';
import {
  buildConsumerRows,
  consumerTotals,
  sectionSources,
  sumBuckets,
  useConsumerRefs,
} from './shared';

const fixedConfigs: UsageQueryConfig[] = [
  { key: 'llm-input-total', unit: Unit.TOKENS, granularity: Granularity.TOTAL, labelFilters: { ...METERED_MODEL_TOKENS, kind: 'input' } },
  { key: 'llm-cached-total', unit: Unit.TOKENS, granularity: Granularity.TOTAL, labelFilters: { ...METERED_MODEL_TOKENS, kind: 'cached' } },
  { key: 'llm-output-total', unit: Unit.TOKENS, granularity: Granularity.TOTAL, labelFilters: { ...METERED_MODEL_TOKENS, kind: 'output' } },
  {
    key: 'llm-requests-total',
    unit: Unit.COUNT,
    granularity: Granularity.TOTAL,
    // Deliberately unfiltered: this counts calls, not spend, and a native-mode
    // call is still a call the organization made.
    labelFilters: { kind: 'request' },
    groupBy: 'status',
  },
  {
    key: 'llm-daily-tokens',
    unit: Unit.TOKENS,
    granularity: Granularity.DAY,
    useRangeGranularity: true,
    labelFilters: { ...METERED_MODEL_TOKENS },
    groupBy: 'kind',
  },
  {
    key: 'llm-models-input-total',
    unit: Unit.TOKENS,
    granularity: Granularity.TOTAL,
    labelFilters: { ...METERED_MODEL_TOKENS, kind: 'input' },
    groupBy: 'resource_id',
  },
  {
    key: 'llm-models-output-total',
    unit: Unit.TOKENS,
    granularity: Granularity.TOTAL,
    labelFilters: { ...METERED_MODEL_TOKENS, kind: 'output' },
    groupBy: 'resource_id',
  },
];

type TokenPoint = {
  timestamp: number;
  uncached: number;
  cached: number;
  output: number;
};

function buildTokenSeries(buckets: UsageBucket[], granularity: Granularity, range: UsageRange): TokenPoint[] {
  const byTimestamp = new Map<number, TokenPoint>();
  buckets.forEach((bucket) => {
    if (!bucket.timestamp) return;
    const timestamp = bucketTimestamp(bucket);
    const point = byTimestamp.get(timestamp) ?? { timestamp, uncached: 0, cached: 0, output: 0 };
    const value = microsToNumber(bucket.value);
    if (bucket.groupValue === 'input') point.uncached += value;
    if (bucket.groupValue === 'cached') point.cached += value;
    if (bucket.groupValue === 'output') point.output += value;
    byTimestamp.set(timestamp, point);
  });

  const points = Array.from(byTimestamp.values())
    .map((point) => ({ ...point, uncached: Math.max(0, point.uncached - point.cached) }))
    .sort((left, right) => left.timestamp - right.timestamp);

  return fillTimeBuckets(points, granularity, range, (timestamp) => ({
    timestamp,
    uncached: 0,
    cached: 0,
    output: 0,
  }));
}

export function LlmSection({ organizationId, range }: { organizationId: string; range: UsageRange | null }) {
  const [groupBy, setGroupBy] = useState<UsageGroupBy>('workload');

  const configs = useMemo(() => [...fixedConfigs, ...consumerQueryConfigs('llm', groupBy)], [groupBy]);
  const { byKey, isPending, hasData } = useUsageQueries(organizationId, range, configs);

  const modelsQuery = useQuery({
    queryKey: ['llm', 'models', organizationId],
    queryFn: () => llmClient.listModels({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const granularity = range?.granularity ?? Granularity.DAY;
  const inputTotal = sumBuckets(byKey['llm-input-total']);
  const cachedTotal = sumBuckets(byKey['llm-cached-total']);
  const outputTotal = sumBuckets(byKey['llm-output-total']);

  const requestTotals = identifiedGroupTotals(byKey['llm-requests-total']?.data?.buckets ?? []);
  const succeeded = microsToNumber(requestTotals.get('success') ?? 0n);
  const failed = microsToNumber(requestTotals.get('failed') ?? 0n);
  const requestsTotal = succeeded + failed;

  const tokenSeries = useMemo(
    () => (range ? buildTokenSeries(byKey['llm-daily-tokens']?.data?.buckets ?? [], granularity, range) : []),
    [byKey, granularity, range],
  );

  const consumerSources = sectionSources(byKey, consumerQuerySources('llm', groupBy));
  const totals = consumerTotals(consumerSources, microsToNumber);
  const { resolveGroup } = useUsageGroups(useConsumerRefs(totals));
  const consumerRows = buildConsumerRows(totals, resolveGroup);

  const modelNames = useMemo(() => {
    const models = modelsQuery.data?.models ?? [];
    return new Map(models.flatMap((model) => (model.meta?.id ? ([[model.meta.id, model.name]] as const) : [])));
  }, [modelsQuery.data?.models]);

  // Models are a resource, not a consumer level, so they are summed here rather
  // than through the ranking machinery the Group by control drives.
  const modelRows: ConsumerRow[] = useMemo(() => {
    const merged = new Map<string, bigint>();
    [byKey['llm-models-input-total'], byKey['llm-models-output-total']].forEach((query) => {
      identifiedGroupTotals(query?.data?.buckets ?? []).forEach((value, id) => {
        merged.set(id, (merged.get(id) ?? 0n) + value);
      });
    });
    return Array.from(merged.entries())
      .map(([id, value]) => ({ id, label: modelNames.get(id) ?? id, detail: 'Model', value: microsToNumber(value) }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 5);
  }, [byKey, modelNames]);

  if (!range) return null;
  if (!isPending && !hasData) {
    return (
      <Card className="py-4" data-testid="organization-usage-llm-empty">
        <CardContent className="px-4 text-sm text-muted-foreground">No LLM usage for this period.</CardContent>
      </Card>
    );
  }

  const tokensEmpty = tokenSeries.every((point) => !point.uncached && !point.cached && !point.output);
  const rangeLabel = formatRangeLabel(range.start, range.end);

  return (
    <div className="space-y-4" data-testid="organization-usage-llm-section">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" data-testid="organization-usage-llm-metrics">
        <UsageMetricCard
          label="Input tokens"
          value={formatUsageValue(inputTotal)}
          helper={`${formatUsageValue(cachedTotal)} served from cache`}
          isLoading={byKey['llm-input-total']?.isPending ?? true}
          isError={byKey['llm-input-total']?.isError ?? false}
          testId="organization-usage-llm-input"
        />
        <UsageMetricCard
          label="Output tokens"
          value={formatUsageValue(outputTotal)}
          helper={
            microsToNumber(inputTotal) > 0
              ? `${((microsToNumber(outputTotal) / microsToNumber(inputTotal)) * 100).toFixed(1)}% of input`
              : undefined
          }
          isLoading={byKey['llm-output-total']?.isPending ?? true}
          isError={byKey['llm-output-total']?.isError ?? false}
          testId="organization-usage-llm-output"
        />
        <UsageMetricCard
          label="Requests"
          value={formatUsageNumber(requestsTotal)}
          helper={`${formatUsageNumber(succeeded)} succeeded`}
          isLoading={byKey['llm-requests-total']?.isPending ?? true}
          isError={byKey['llm-requests-total']?.isError ?? false}
          testId="organization-usage-llm-requests-success"
        />
        <UsageMetricCard
          label="Failed requests"
          value={formatUsageNumber(failed)}
          // A failure rate is the number that needs acting on, so it wears the
          // destructive tone rather than reading as one neutral figure of four.
          emphasis={failed > 0 ? 'destructive' : undefined}
          helper={requestsTotal > 0 ? `${((failed / requestsTotal) * 100).toFixed(1)}% of all calls` : undefined}
          isLoading={byKey['llm-requests-total']?.isPending ?? true}
          isError={byKey['llm-requests-total']?.isError ?? false}
          testId="organization-usage-llm-requests-failed"
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <UsageChartCard
          title="Tokens over time"
          subtitle={rangeLabel}
          isLoading={byKey['llm-daily-tokens']?.isPending ?? true}
          isError={byKey['llm-daily-tokens']?.isError ?? false}
          isEmpty={tokensEmpty}
          testId="organization-usage-llm-daily-chart"
          table={<TokenTable series={tokenSeries} granularity={granularity} />}
        >
          <TokenPanels series={tokenSeries} granularity={granularity} />
          <ChartLegend
            items={[
              { label: 'Uncached input', color: 'var(--color-chart-1)' },
              { label: 'Cached input', color: 'var(--color-chart-2)' },
            ]}
          />
        </UsageChartCard>

        <ConsumerChartCard
          rows={consumerRows}
          level={groupBy}
          onLevelChange={setGroupBy}
          isLoading={consumerSources.some((source) => source.query?.isPending)}
          isError={consumerSources.some((source) => source.query?.isError)}
          testId="organization-usage-llm-consumers-chart"
          format={(value) => formatUsageNumber(value)}
          fallbackColor="var(--color-chart-1)"
          subtitle="Input + output tokens"
        />
      </div>

      <UsageChartCard
        title="By model"
        subtitle="Input + output tokens"
        isLoading={
          (byKey['llm-models-input-total']?.isPending ?? true) ||
          (byKey['llm-models-output-total']?.isPending ?? true) ||
          modelsQuery.isPending
        }
        isError={(byKey['llm-models-input-total']?.isError ?? false) || (byKey['llm-models-output-total']?.isError ?? false)}
        isEmpty={modelRows.length === 0}
        testId="organization-usage-llm-models-chart"
      >
        <ResponsiveContainer width="100%" height={Math.max(140, modelRows.length * 34 + 24)}>
          <BarChart data={modelRows} layout="vertical" margin={{ left: 8, right: 64, top: 4, bottom: 4 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="label"
              width={160}
              axisLine={{ stroke: 'var(--color-chart-grid)' }}
              tickLine={false}
              tick={chartAxis.tick}
              tickFormatter={(value) => truncate(value, 22)}
            />
            <Tooltip
              cursor={{ fill: 'var(--color-chart-grid)', fillOpacity: 0.5 }}
              content={({ active, payload }) => {
                const row = active ? (payload?.[0]?.payload as ConsumerRow | undefined) : undefined;
                if (!row) return null;
                return (
                  <ChartTooltip
                    title="Model"
                    rows={[{ label: row.label, color: 'var(--color-chart-1)', value: formatUsageNumber(row.value) }]}
                  />
                );
              }}
            />
            <Bar
              dataKey="value"
              barSize={18}
              fill="var(--color-chart-1)"
              shape={<HorizontalBarShape />}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="value"
                position="right"
                offset={8}
                className="fill-muted-foreground tabular-nums"
                fontSize={11}
                formatter={(value) => formatUsageNumber(Number(value))}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </UsageChartCard>
    </div>
  );
}

/**
 * Input and output share an x-axis and nothing else: output runs three orders
 * of magnitude smaller, so on one scale it is a flat line at zero. Two panels
 * with their own baselines is the honest reading; a second y-axis on one plot
 * would invent a correlation between them.
 */
function TokenPanels({ series, granularity }: { series: TokenPoint[]; granularity: Granularity }) {
  const tickFormatter = (value: number) => formatBucketTick(value, granularity);
  const cursor = { fill: 'var(--color-chart-grid)', fillOpacity: 0.5 };
  // syncId shares the hovered period across both panels, and that includes the
  // tooltip -- so only the panel the reading is drawn beside renders content.
  // The other keeps its Tooltip purely for the shared cursor.
  const tooltip = (
    <Tooltip
      cursor={cursor}
      content={({ active, payload }) => {
        const point = active ? (payload?.[0]?.payload as TokenPoint | undefined) : undefined;
        if (!point) return null;
        return (
          <ChartTooltip
            title={formatBucketTitle(point.timestamp, granularity)}
            rows={[
              { label: 'Uncached input', color: 'var(--color-chart-1)', value: formatUsageNumber(point.uncached) },
              { label: 'Cached input', color: 'var(--color-chart-2)', value: formatUsageNumber(point.cached) },
              { label: 'Output', color: 'var(--color-chart-3)', value: formatUsageNumber(point.output) },
            ]}
          />
        );
      }}
    />
  );

  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-foreground">Input</div>
      <ResponsiveContainer width="100%" height={168}>
        <BarChart data={series} margin={{ left: 0, right: 8, top: 4, bottom: 0 }} syncId="llm-tokens">
          <CartesianGrid {...chartGrid} />
          <XAxis dataKey="timestamp" hide />
          <YAxis
            width={48}
            axisLine={false}
            tickLine={false}
            tick={chartAxis.tick}
            style={tickStyle}
            tickFormatter={compactNumber}
          />
          {tooltip}
          <Bar
            dataKey="uncached"
            stackId="input"
            fill="var(--color-chart-1)"
            maxBarSize={18}
            shape={<BarShape stacked />}
            isAnimationActive={false}
          />
          <Bar
            dataKey="cached"
            stackId="input"
            fill="var(--color-chart-2)"
            maxBarSize={18}
            shape={<BarShape capped />}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>

      <div className="border-t border-border pt-2 text-xs font-medium text-foreground">Output</div>
      <ResponsiveContainer width="100%" height={92}>
        <BarChart data={series} margin={{ left: 0, right: 8, top: 4, bottom: 0 }} syncId="llm-tokens">
          <CartesianGrid {...chartGrid} />
          <XAxis
            dataKey="timestamp"
            axisLine={{ stroke: 'var(--color-chart-grid)' }}
            tickLine={false}
            tick={chartAxis.tick}
            style={tickStyle}
            minTickGap={48}
            tickFormatter={tickFormatter}
          />
          <YAxis
            width={48}
            axisLine={false}
            tickLine={false}
            tick={chartAxis.tick}
            style={tickStyle}
            tickCount={3}
            tickFormatter={compactNumber}
          />
          <Tooltip cursor={cursor} content={() => null} />
          <Bar
            dataKey="output"
            fill="var(--color-chart-3)"
            maxBarSize={18}
            shape={<BarShape capped />}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TokenTable({ series, granularity }: { series: TokenPoint[]; granularity: Granularity }) {
  const rows = series.filter((point) => point.uncached || point.cached || point.output);
  return (
    <div className="max-h-60 overflow-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="px-2 py-1.5 text-left font-medium">Period</th>
            <th className="px-2 py-1.5 text-right font-medium">Uncached</th>
            <th className="px-2 py-1.5 text-right font-medium">Cached</th>
            <th className="px-2 py-1.5 text-right font-medium">Output</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((point) => (
            <tr key={point.timestamp} className="border-t border-border">
              <td className="px-2 py-1.5">{formatBucketTitle(point.timestamp, granularity)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatUsageNumber(point.uncached)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatUsageNumber(point.cached)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatUsageNumber(point.output)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
