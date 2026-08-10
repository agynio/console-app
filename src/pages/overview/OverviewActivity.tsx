import { useMemo, type ReactNode } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { TrendingDownIcon, TrendingUpIcon } from 'lucide-react';
import { ChartTooltip } from '@/components/ChartTooltip';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatUsageCompact, formatUsageNumber, microsToHours, microsToNumber } from '@/lib/usage';
import { ACTIVITY_WINDOW_DAYS, DAY_MS, useOverviewActivity } from './useOverviewActivity';

type OverviewActivityProps = {
  organizationId: string;
  runnerCount: number;
};

const dayFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

/** Two points is a line with no context; three is the shortest chart worth drawing. */
const MIN_CHART_DAYS = 3;

/** Local calendar day, which is the grain metering buckets by. */
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** A headline reads better round: minutes matter under an hour, not over forty. */
function formatHours(micros: bigint): string {
  const hours = microsToHours(micros);
  if (hours === 0) return '0h';
  if (hours < 10) return `${hours.toFixed(1)}h`;
  return `${Math.round(hours)}h`;
}

function Metric({
  label,
  value,
  hint,
  isPending,
  testId,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  isPending: boolean;
  testId: string;
}) {
  return (
    <Card className="gap-1 border-border px-4 py-3" data-testid={testId}>
      <div className="text-xs text-muted-foreground">{label}</div>
      {isPending ? (
        <Skeleton className="h-7 w-20" />
      ) : (
        <div className="text-2xl font-semibold text-foreground">{value}</div>
      )}
      {!isPending && hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </Card>
  );
}

export function OverviewActivity({ organizationId, runnerCount }: OverviewActivityProps) {
  const activity = useOverviewActivity(organizationId);

  // Metering answers only with the days that had usage. The rest are filled in,
  // then the empty run before the first one is dropped: an organization two days
  // old should not be shown five days of nothing it could not have used.
  const series = useMemo(() => {
    const byDay = new Map<string, number>();
    activity.daily.forEach((day) => {
      byDay.set(dayKey(new Date(day.millis)), microsToNumber(day.tokens));
    });

    const days = Array.from({ length: ACTIVITY_WINDOW_DAYS }, (_, index) => {
      const day = new Date(activity.end.getTime() - (ACTIVITY_WINDOW_DAYS - 1 - index) * DAY_MS);
      return { label: dayFormatter.format(day), tokens: byDay.get(dayKey(day)) ?? 0 };
    });

    const first = days.findIndex((point) => point.tokens > 0);
    if (first < 0) return days;
    // Starts a day early so the shape has somewhere to rise from.
    return days.slice(Math.min(Math.max(first - 1, 0), days.length - MIN_CHART_DAYS));
  }, [activity.daily, activity.end]);

  const hasSeries = series.some((point) => point.tokens > 0);
  const edgeTicks = [series[0]?.label, series[series.length - 1]?.label].filter(Boolean);

  // A missing metering service answers with no buckets rather than an error, so
  // the same empty state covers both an idle organization and a deployment that
  // does not meter at all.
  const trend =
    activity.tokens === 0n
      ? null
      : activity.previousTokens === 0n
        ? { rising: true, label: 'nothing the week before' }
        : {
            rising: activity.tokens >= activity.previousTokens,
            label: `vs ${formatUsageCompact(activity.previousTokens)} the week before`,
          };
  const TrendIcon = trend?.rising ? TrendingUpIcon : TrendingDownIcon;

  return (
    <div className="space-y-3" data-testid="organization-overview-activity">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric
          label="Tokens"
          value={formatUsageCompact(activity.tokens)}
          isPending={activity.isPending}
          hint={
            trend ? (
              <span className="flex items-center gap-1" data-testid="organization-overview-token-trend">
                <TrendIcon className="h-3.5 w-3.5" />
                {trend.label}
              </span>
            ) : null
          }
          testId="organization-overview-tokens"
        />
        <Metric
          label="Compute"
          value={formatHours(activity.compute)}
          isPending={activity.isPending}
          hint={runnerCount > 0 ? `across ${runnerCount} ${runnerCount === 1 ? 'runner' : 'runners'}` : null}
          testId="organization-overview-compute"
        />
        <Metric
          label="Threads"
          value={formatUsageCompact(activity.threads)}
          isPending={activity.isPending}
          hint={`${formatUsageCompact(activity.messages)} messages`}
          testId="organization-overview-threads"
        />
      </div>

      <Card className="gap-3 border-border px-4 py-3" data-testid="organization-overview-token-chart">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-muted-foreground">Token use</span>
          <span className="text-xs text-muted-foreground">
            {hasSeries ? `Last ${series.length} days` : `Last ${ACTIVITY_WINDOW_DAYS} days`}
          </span>
        </div>
        {activity.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : activity.isError ? (
          <div className="py-6 text-sm text-muted-foreground">Failed to load usage.</div>
        ) : !hasSeries ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No model calls in the last {ACTIVITY_WINDOW_DAYS} days.
          </div>
        ) : (
          // An area rather than bars: it spans the card whatever the number of
          // days, where three bars in a week-wide chart read as three accidents.
          <ResponsiveContainer width="100%" height={112}>
            <AreaChart data={series} margin={{ top: 4, bottom: 0, left: 0, right: 0 }}>
              <defs>
                <linearGradient id="overview-tokens" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              {/* Only the ends are labelled: the shape carries the trend, the
                  tooltip carries the numbers. */}
              <XAxis
                dataKey="label"
                ticks={edgeTicks}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval={0}
              />
              <Tooltip
                cursor={{ stroke: 'var(--color-border)', strokeWidth: 1 }}
                content={<ChartTooltip format={(value) => `${formatUsageNumber(value)} tokens`} />}
              />
              <Area
                dataKey="tokens"
                type="monotone"
                stroke="var(--color-chart-1)"
                strokeWidth={2}
                fill="url(#overview-tokens)"
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}
