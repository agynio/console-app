import type { TooltipContentProps } from 'recharts';

// Partial because recharts injects these when it clones the element, so the
// call site passes none of them.
type ChartTooltipProps = Partial<TooltipContentProps<number, string>> & {
  /** Turns a series value into what the tooltip should say about it. */
  format?: (value: number) => string;
};

/**
 * Recharts' own tooltip is inline-styled — a white box with a grey border and
 * series-coloured text — so it ignores the theme and looks foreign in dark mode.
 */
export function ChartTooltip({ active, payload, label, format }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 shadow-md">
      <div className="text-xs text-muted-foreground">{String(label ?? '')}</div>
      {payload.map((entry, index) => {
        const value = typeof entry.value === 'number' ? entry.value : Number(entry.value ?? 0);
        return (
          <div key={index} className="text-sm font-medium text-popover-foreground">
            {format ? format(value) : value.toLocaleString()}
          </div>
        );
      })}
    </div>
  );
}
