import type { SortDirection } from '@/hooks/useListControls';
import { cn } from '@/lib/utils';
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from 'lucide-react';

type SortableHeaderProps<SortKey extends string> = {
  label: string;
  sortKey: SortKey;
  activeSortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
  className?: string;
  testId?: string;
};

export function SortableHeader<SortKey extends string>({
  label,
  sortKey,
  activeSortKey,
  sortDirection,
  onSort,
  className,
  testId,
}: SortableHeaderProps<SortKey>) {
  const isActive = sortKey === activeSortKey;
  const icon = isActive
    ? sortDirection === 'asc'
      ? ArrowUpIcon
      : ArrowDownIcon
    : ArrowUpDownIcon;
  const Icon = icon;

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn('inline-flex items-center gap-1 text-left hover:text-foreground', className)}
      data-testid={testId}
    >
      <span>{label}</span>
      <Icon className={cn('h-3.5 w-3.5', isActive ? 'text-foreground' : 'text-muted-foreground')} />
    </button>
  );
}
