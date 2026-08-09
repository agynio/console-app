import type { ReactNode } from 'react';
import { MARK_GAP } from '@/lib/chartTheme';

const CAP_RADIUS = 3;

type BarShapeProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  /** Set on the topmost segment of a stack; only that end gets the radius. */
  capped?: boolean;
  /** Set on every segment below the top one, which gives up 2px to the gap. */
  stacked?: boolean;
};

/**
 * A bar with a rounded data-end and a square baseline. Recharts' own `radius`
 * rounds a stacked segment at both ends, which reads as a floating pill rather
 * than something growing from the axis.
 */
export function BarShape({ x = 0, y = 0, width = 0, height = 0, fill, capped, stacked }: BarShapeProps) {
  const h = Math.max(0, stacked ? height - MARK_GAP : height);
  if (h <= 0 || width <= 0) return null;
  const top = y + (height - h);
  const r = capped ? Math.min(CAP_RADIUS, width / 2, h) : 0;
  const d = r
    ? `M${x},${top + h}V${top + r}a${r},${r} 0 0 1 ${r},-${r}h${width - 2 * r}a${r},${r} 0 0 1 ${r},${r}V${top + h}Z`
    : `M${x},${top}h${width}v${h}h${-width}Z`;
  return <path d={d} fill={fill} />;
}

/** The horizontal twin: the rounded end is the one the value grows toward. */
export function HorizontalBarShape({ x = 0, y = 0, width = 0, height = 0, fill }: BarShapeProps) {
  if (height <= 0 || width <= 0) return null;
  const r = Math.min(CAP_RADIUS, height / 2, width);
  const d = `M${x},${y}h${width - r}a${r},${r} 0 0 1 ${r},${r}v${height - 2 * r}a${r},${r} 0 0 1 ${-r},${r}H${x}Z`;
  return <path d={d} fill={fill} />;
}

/** Identity comes from the swatch, so the text stays in ink rather than the series colour. */
export function ChartLegend({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} aria-hidden />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function ChartTooltip({ title, rows }: { title: ReactNode; rows: Array<{ label: string; color?: string; value: string }> }) {
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-2 text-xs shadow-md">
      <div className="mb-1 text-muted-foreground">{title}</div>
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-1.5">
          {row.color ? <span className="size-2 rounded-full" style={{ backgroundColor: row.color }} aria-hidden /> : null}
          <span className="text-foreground">{row.label}</span>
          <span className="ml-auto pl-3.5 font-medium tabular-nums text-foreground">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

