import { useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { USAGE_GROUP_OPTIONS, type UsageGroupBy, type UsageGroupKind } from '@/hooks/useUsageGroups';
import type { Granularity } from '@/gen/agynio/api/metering/v1/metering_pb';
import { BarShape, ChartLegend, ChartTooltip, HorizontalBarShape } from '@/lib/chartMarks';
import {
  chartAxis,
  chartGrid,
  compactNumber,
  formatBucketTick,
  formatBucketTitle,
  groupKindColors,
  kindLegendLabels,
  tickStyle,
} from '@/lib/chartTheme';
import { truncate } from '@/lib/format';

export type ConsumerRow = {
  id: string;
  label: string;
  detail?: string;
  kind?: UsageGroupKind;
  value: number;
};

function TableIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
      <path d="M2 6h12M6.5 6v7.5" />
    </svg>
  );
}

/**
 * Swaps the plot for the same numbers as text. A chart is not the only way a
 * value may be reachable — several series colours sit below 3:1 against the
 * surface, and this is the relief that makes that legal.
 */
function TableToggle({ pressed, onToggle }: { pressed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={pressed}
      aria-label={pressed ? 'Show as chart' : 'Show as table'}
      title={pressed ? 'Show as chart' : 'Show as table'}
      className="inline-flex size-7 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:bg-accent hover:text-foreground aria-pressed:border-border aria-pressed:bg-accent aria-pressed:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
    >
      <TableIcon />
    </button>
  );
}

export function UsageMetricCard({
  label,
  value,
  helper,
  emphasis,
  isLoading,
  isError,
  testId,
}: {
  label: string;
  value: string;
  helper?: ReactNode;
  /** Draws the figure in the destructive tone when the number is the problem. */
  emphasis?: 'destructive';
  isLoading: boolean;
  isError: boolean;
  testId: string;
}) {
  // The Card default is py-6 with a gap-6 between header and body -- sized for a
  // form, not for three short lines. A tile is label, figure, one note.
  return (
    <Card className="gap-0 border-border py-4" data-testid={testId}>
      <CardHeader className="px-4 pb-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pt-1.5">
        {isLoading ? (
          <Skeleton className="h-7 w-32" />
        ) : isError ? (
          <div className="text-sm text-muted-foreground">Failed to load.</div>
        ) : (
          <div
            className={`text-2xl font-semibold ${emphasis === 'destructive' ? 'text-destructive' : 'text-foreground'}`}
          >
            {value}
          </div>
        )}
        {!isLoading && !isError && helper ? (
          <div className="mt-1 text-xs text-muted-foreground">{helper}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function UsageChartCard({
  title,
  subtitle,
  action,
  table,
  isLoading,
  isError,
  isEmpty,
  testId,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  /** When given, the card offers a table twin of the same numbers. */
  table?: ReactNode;
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  testId: string;
  children: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  const canToggle = Boolean(table) && !isLoading && !isError && !isEmpty;

  return (
    <Card className="gap-0 border-border py-4" data-testid={testId}>
      <CardHeader className="gap-0.5 px-4 pb-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {subtitle ? <div className="text-xs text-muted-foreground">{subtitle}</div> : null}
        {action || canToggle ? (
          <CardAction>
            <div className="flex items-center gap-1.5">
              {action}
              {canToggle ? <TableToggle pressed={showTable} onToggle={() => setShowTable((open) => !open)} /> : null}
            </div>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="px-4 pt-3">
        {isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : isError ? (
          <div className="text-sm text-muted-foreground">Failed to load chart data.</div>
        ) : isEmpty ? (
          <div className="text-sm text-muted-foreground">No usage data for this period.</div>
        ) : showTable ? (
          table
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

export function GroupBySelect({
  level,
  onChange,
  testId,
}: {
  level: UsageGroupBy;
  onChange: (level: UsageGroupBy) => void;
  testId: string;
}) {
  return (
    <Select value={level} onValueChange={(value) => onChange(value as UsageGroupBy)}>
      <SelectTrigger size="sm" className="w-auto text-xs" data-testid={testId}>
        <SelectValue placeholder="Group by" />
      </SelectTrigger>
      <SelectContent>
        {USAGE_GROUP_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ConsumerTable({ rows, format }: { rows: ConsumerRow[]; format: (value: number) => string }) {
  return (
    <div className="max-h-60 overflow-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="px-2 py-1.5 text-left font-medium">Name</th>
            <th className="px-2 py-1.5 text-left font-medium">Type</th>
            <th className="px-2 py-1.5 text-right font-medium">Usage</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-border">
              <td className="px-2 py-1.5">{row.label}</td>
              <td className="px-2 py-1.5 text-muted-foreground">{row.detail ?? '—'}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{format(row.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Ranks whatever the selected level names. Instances and sandboxes rank
 * together rather than in two charts: the question is what cost the most, and
 * splitting it hides a sandbox outspending every agent.
 */
export function ConsumerChartCard({
  rows,
  level,
  onLevelChange,
  isLoading,
  isError,
  testId,
  format,
  fallbackColor,
  subtitle,
}: {
  rows: ConsumerRow[];
  level: UsageGroupBy;
  onLevelChange: (level: UsageGroupBy) => void;
  isLoading: boolean;
  isError: boolean;
  testId: string;
  format: (value: number) => string;
  fallbackColor: string;
  subtitle?: string;
}) {
  const kinds = Array.from(new Set(rows.flatMap((row) => (row.kind ? [row.kind] : []))));
  const legendKinds = kinds.filter((kind) => groupKindColors[kind]);

  return (
    <UsageChartCard
      title="Top consumers"
      subtitle={subtitle}
      action={<GroupBySelect level={level} onChange={onLevelChange} testId={`${testId}-group-by`} />}
      table={<ConsumerTable rows={rows} format={format} />}
      isLoading={isLoading}
      isError={isError}
      isEmpty={rows.length === 0}
      testId={testId}
    >
      <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 34 + 24)}>
        <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 56, top: 4, bottom: 4 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            width={140}
            axisLine={{ stroke: 'var(--color-chart-grid)' }}
            tickLine={false}
            tick={chartAxis.tick}
            style={tickStyle}
            tickFormatter={(value) => truncate(value, 20)}
          />
          <Tooltip
            cursor={{ fill: 'var(--color-chart-grid)', fillOpacity: 0.5 }}
            content={({ active, payload }) => {
              const row = active ? (payload?.[0]?.payload as ConsumerRow | undefined) : undefined;
              if (!row) return null;
              return (
                <ChartTooltip
                  title={row.detail ?? 'Consumer'}
                  rows={[
                    {
                      label: row.label,
                      color: (row.kind && groupKindColors[row.kind]) || fallbackColor,
                      value: format(row.value),
                    },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="value" barSize={18} shape={<HorizontalBarShape />} isAnimationActive={false}>
            {rows.map((row) => (
              <Cell key={row.id} fill={(row.kind && groupKindColors[row.kind]) || fallbackColor} />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              offset={8}
              className="fill-muted-foreground tabular-nums"
              fontSize={11}
              formatter={(value) => format(Number(value))}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {legendKinds.length > 1 ? (
        <ChartLegend
          items={legendKinds.map((kind) => ({
            label: kindLegendLabels[kind] ?? kind,
            color: groupKindColors[kind] as string,
          }))}
        />
      ) : null}
    </UsageChartCard>
  );
}

export type TimePoint = { timestamp: number } & Record<string, number>;

export type TimeSeries = { key: string; name: string; color: string };

/**
 * The single-series-per-period chart every section but LLM needs. Bars grow
 * from one baseline, the grid is a solid hairline, and the time axis thins its
 * own ticks rather than printing one per bucket.
 */
export function TimeSeriesChartCard({
  title,
  subtitle,
  testId,
  isLoading,
  isError,
  points,
  granularity,
  series,
  format,
}: {
  title: string;
  subtitle?: string;
  testId: string;
  isLoading: boolean;
  isError: boolean;
  points: TimePoint[];
  granularity: Granularity;
  series: TimeSeries[];
  format: (value: number) => string;
}) {
  const isEmpty = points.every((point) => series.every((entry) => !point[entry.key]));

  return (
    <UsageChartCard
      title={title}
      subtitle={subtitle}
      isLoading={isLoading}
      isError={isError}
      isEmpty={isEmpty}
      testId={testId}
      table={
        <div className="max-h-60 overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="px-2 py-1.5 text-left font-medium">Period</th>
                {series.map((entry) => (
                  <th key={entry.key} className="px-2 py-1.5 text-right font-medium">
                    {entry.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {points
                .filter((point) => series.some((entry) => point[entry.key]))
                .map((point) => (
                  <tr key={point.timestamp} className="border-t border-border">
                    <td className="px-2 py-1.5">{formatBucketTitle(point.timestamp, granularity)}</td>
                    {series.map((entry) => (
                      <td key={entry.key} className="px-2 py-1.5 text-right tabular-nums">
                        {format(point[entry.key])}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      }
    >
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={points} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
          <CartesianGrid {...chartGrid} />
          <XAxis
            dataKey="timestamp"
            axisLine={{ stroke: 'var(--color-chart-grid)' }}
            tickLine={false}
            tick={chartAxis.tick}
            style={tickStyle}
            minTickGap={48}
            tickFormatter={(value: number) => formatBucketTick(value, granularity)}
          />
          <YAxis
            width={48}
            axisLine={false}
            tickLine={false}
            tick={chartAxis.tick}
            style={tickStyle}
            tickFormatter={compactNumber}
          />
          <Tooltip
            cursor={{ fill: 'var(--color-chart-grid)', fillOpacity: 0.5 }}
            content={({ active, payload }) => {
              const point = active ? (payload?.[0]?.payload as TimePoint | undefined) : undefined;
              if (!point) return null;
              return (
                <ChartTooltip
                  title={formatBucketTitle(point.timestamp, granularity)}
                  rows={series.map((entry) => ({
                    label: entry.name,
                    color: entry.color,
                    value: format(point[entry.key]),
                  }))}
                />
              );
            }}
          />
          {series.map((entry) => (
            <Bar
              key={entry.key}
              dataKey={entry.key}
              fill={entry.color}
              maxBarSize={18}
              shape={<BarShape capped />}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      {series.length > 1 ? (
        <ChartLegend items={series.map((entry) => ({ label: entry.name, color: entry.color }))} />
      ) : null}
    </UsageChartCard>
  );
}
