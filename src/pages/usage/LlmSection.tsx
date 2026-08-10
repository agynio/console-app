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
  SUBSCRIPTION_TOKENS,
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
  // Subscription tokens are read on their own rather than through the spend
  // queries above. A native call runs against a Subscription, so it carries no
  // Model to resolve -- model_name is what names which model actually ran.
  { key: 'llm-subscription-input-total', unit: Unit.TOKENS, granularity: Granularity.TOTAL, labelFilters: { ...SUBSCRIPTION_TOKENS, kind: 'input' } },
  { key: 'llm-subscription-output-total', unit: Unit.TOKENS, granularity: Granularity.TOTAL, labelFilters: { ...SUBSCRIPTION_TOKENS, kind: 'output' } },
  {
    key: 'llm-subscription-daily-tokens',
    unit: Unit.TOKENS,
    granularity: Granularity.DAY,
    useRangeGranularity: true,
    labelFilters: { ...SUBSCRIPTION_TOKENS },
    groupBy: 'kind',
  },
  {
    key: 'llm-subscription-models-input-total',
    unit: Unit.TOKENS,
    granularity: Granularity.TOTAL,
    labelFilters: { ...SUBSCRIPTION_TOKENS, kind: 'input' },
    groupBy: 'model_name',
  },
  {
    key: 'llm-subscription-models-output-total',
    unit: Unit.TOKENS,
    granularity: Granularity.TOTAL,
    labelFilters: { ...SUBSCRIPTION_TOKENS, kind: 'output' },
    groupBy: 'model_name',
  },
];

type TokenPoint = {
  timestamp: number;
  uncached: number;
  cached: number;
  output: number;
  subscriptionInput: number;
  subscriptionOutput: number;
};

const emptyPoint = (timestamp: number): TokenPoint => ({
  timestamp,
  uncached: 0,
  cached: 0,
  output: 0,
  subscriptionInput: 0,
  subscriptionOutput: 0,
});

/**
 * The subscription side is one segment per panel where the billable side is
 * split by cache. The stacks still measure the same thing: uncached + cached is
 * the input, so a subscription bar of that height is read against it directly.
 */
function buildTokenSeries(
  buckets: UsageBucket[],
  subscriptionBuckets: UsageBucket[],
  granularity: Granularity,
  range: UsageRange,
): TokenPoint[] {
  const byTimestamp = new Map<number, TokenPoint>();
  const pointAt = (bucket: UsageBucket) => {
    const timestamp = bucketTimestamp(bucket);
    const point = byTimestamp.get(timestamp) ?? emptyPoint(timestamp);
    byTimestamp.set(timestamp, point);
    return point;
  };

  buckets.forEach((bucket) => {
    if (!bucket.timestamp) return;
    const point = pointAt(bucket);
    const value = microsToNumber(bucket.value);
    if (bucket.groupValue === 'input') point.uncached += value;
    if (bucket.groupValue === 'cached') point.cached += value;
    if (bucket.groupValue === 'output') point.output += value;
  });

  // Cached is the share of the input served from cache, not tokens on top of
  // it, so it is left out here rather than added to the segment beside it.
  subscriptionBuckets.forEach((bucket) => {
    if (!bucket.timestamp) return;
    const point = pointAt(bucket);
    const value = microsToNumber(bucket.value);
    if (bucket.groupValue === 'input') point.subscriptionInput += value;
    if (bucket.groupValue === 'output') point.subscriptionOutput += value;
  });

  const points = Array.from(byTimestamp.values())
    .map((point) => ({ ...point, uncached: Math.max(0, point.uncached - point.cached) }))
    .sort((left, right) => left.timestamp - right.timestamp);

  return fillTimeBuckets(points, granularity, range, emptyPoint);
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
  const subscriptionInputTotal = sumBuckets(byKey['llm-subscription-input-total']);
  const subscriptionOutputTotal = sumBuckets(byKey['llm-subscription-output-total']);
  const subscriptionTotal = subscriptionInputTotal + subscriptionOutputTotal;

  const requestTotals = identifiedGroupTotals(byKey['llm-requests-total']?.data?.buckets ?? []);
  const succeeded = microsToNumber(requestTotals.get('success') ?? 0n);
  const failed = microsToNumber(requestTotals.get('failed') ?? 0n);
  const requestsTotal = succeeded + failed;

  const tokenSeries = useMemo(
    () =>
      range
        ? buildTokenSeries(
            byKey['llm-daily-tokens']?.data?.buckets ?? [],
            byKey['llm-subscription-daily-tokens']?.data?.buckets ?? [],
            granularity,
            range,
          )
        : [],
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
  // than through the ranking machinery the Group by control drives. The two
  // sides key differently -- a Model UUID against the model_name a native call
  // reports -- so each is resolved against the one that owns it.
  const modelRows: ConsumerRow[] = useMemo(() => {
    const rows = new Map<string, ConsumerRow>();
    const add = (id: string, label: string, detail: string, value: bigint) => {
      const row = rows.get(id) ?? { id, label, detail, value: 0 };
      rows.set(id, { ...row, value: row.value + microsToNumber(value) });
    };

    [byKey['llm-models-input-total'], byKey['llm-models-output-total']].forEach((query) => {
      identifiedGroupTotals(query?.data?.buckets ?? []).forEach((value, id) => {
        add(id, modelNames.get(id) ?? id, 'Model', value);
      });
    });
    [byKey['llm-subscription-models-input-total'], byKey['llm-subscription-models-output-total']].forEach((query) => {
      identifiedGroupTotals(query?.data?.buckets ?? []).forEach((value, name) => {
        add(`subscription:${name}`, name, 'Subscription', value);
      });
    });

    return Array.from(rows.values())
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

  const tokensEmpty = tokenSeries.every(
    (point) =>
      !point.uncached && !point.cached && !point.output && !point.subscriptionInput && !point.subscriptionOutput,
  );
  const rangeLabel = formatRangeLabel(range.start, range.end);

  return (
    <div className="space-y-4" data-testid="organization-usage-llm-section">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" data-testid="organization-usage-llm-metrics">
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
          label="Subscription tokens"
          value={formatUsageValue(subscriptionTotal)}
          // Named as not billed rather than left off the tab: a flat fee is not
          // zero usage, and the figures beside it cover only what is charged.
          // The input/output split is in the chart below, which has room for it.
          helper="Flat fee, not billed"
          isLoading={byKey['llm-subscription-input-total']?.isPending ?? true}
          isError={byKey['llm-subscription-input-total']?.isError ?? false}
          testId="organization-usage-llm-subscription"
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
              { label: 'Subscription (not billed)', color: 'var(--color-chart-4)' },
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
              {
                label: 'Subscription in',
                color: 'var(--color-chart-4)',
                value: formatUsageNumber(point.subscriptionInput),
              },
              {
                label: 'Subscription out',
                color: 'var(--color-chart-4)',
                value: formatUsageNumber(point.subscriptionOutput),
              },
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
            shape={<BarShape stacked />}
            isAnimationActive={false}
          />
          <Bar
            dataKey="subscriptionInput"
            stackId="input"
            fill="var(--color-chart-4)"
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
            stackId="output"
            fill="var(--color-chart-3)"
            maxBarSize={18}
            shape={<BarShape stacked />}
            isAnimationActive={false}
          />
          <Bar
            dataKey="subscriptionOutput"
            stackId="output"
            fill="var(--color-chart-4)"
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
  const rows = series.filter(
    (point) => point.uncached || point.cached || point.output || point.subscriptionInput || point.subscriptionOutput,
  );
  return (
    <div className="max-h-60 overflow-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="px-2 py-1.5 text-left font-medium">Period</th>
            <th className="px-2 py-1.5 text-right font-medium">Uncached</th>
            <th className="px-2 py-1.5 text-right font-medium">Cached</th>
            <th className="px-2 py-1.5 text-right font-medium">Output</th>
            <th className="px-2 py-1.5 text-right font-medium">Sub. in</th>
            <th className="px-2 py-1.5 text-right font-medium">Sub. out</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((point) => (
            <tr key={point.timestamp} className="border-t border-border">
              <td className="px-2 py-1.5">{formatBucketTitle(point.timestamp, granularity)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatUsageNumber(point.uncached)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatUsageNumber(point.cached)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatUsageNumber(point.output)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatUsageNumber(point.subscriptionInput)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatUsageNumber(point.subscriptionOutput)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
