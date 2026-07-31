import type { ReactNode } from 'react';
import { CheckIcon, ChevronDownIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

type FilterBarProps = {
  children: ReactNode;
  /** Shows the reset control. Omit for a bar whose filters cannot be cleared. */
  onClear?: () => void;
  isActive?: boolean;
  testId?: string;
};

/**
 * One row of same-height filter controls. Every control sizes itself, so a
 * caller never wraps one in a width box — that is what left the old bar with
 * ragged gaps between a 180px slot and the 100px button sitting in it.
 */
export function FilterBar({ children, onClear, isActive = false, testId }: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={testId}>
      {children}
      {onClear ? (
        <Button
          variant="ghost"
          className={cn('h-9 px-2 text-muted-foreground', !isActive && 'invisible')}
          onClick={onClear}
          disabled={!isActive}
          data-testid={testId ? `${testId}-clear` : 'filter-bar-clear'}
        >
          <XIcon className="size-4" />
          Clear
        </Button>
      ) : null}
    </div>
  );
}

type SingleSelectFilterProps = {
  label: string;
  /** Value meaning "unfiltered", and the wording shown for it in the menu. */
  anyValue: string;
  anyLabel: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  testId?: string;
};

/**
 * A one-of filter that wears the same trigger as {@link MultiSelectFilter}, so
 * a bar mixing single- and multi-choice filters still reads as one row.
 */
export function SingleSelectFilter({
  label,
  anyValue,
  anyLabel,
  value,
  options,
  onChange,
  testId,
}: SingleSelectFilterProps) {
  const isActive = value !== anyValue;
  const selectedLabel = options.find((option) => option.value === value)?.label;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn('h-9 min-w-[9rem] justify-between gap-2 font-normal', isActive && 'border-primary/50 bg-primary/5')}
          data-testid={testId}
          data-active={isActive || undefined}
        >
          <span className="truncate">
            <span className={cn(!isActive && 'text-muted-foreground')}>{label}</span>
            {isActive ? <span className="ml-1.5 text-foreground">{selectedLabel ?? value}</span> : null}
          </span>
          <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-64 overflow-y-auto">
        {[{ value: anyValue, label: anyLabel }, ...options].map((option) => (
          <DropdownMenuItem key={option.value} className="gap-2" onSelect={() => onChange(option.value)}>
            <CheckIcon className={cn('size-4 shrink-0', option.value === value ? 'opacity-100' : 'opacity-0')} />
            <span className="truncate">{option.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type DateRangeFilterProps = {
  label: string;
  fromValue: string;
  toValue: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  fromTestId?: string;
  toTestId?: string;
};

const dateInputClass =
  'bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-calendar-picker-indicator]:opacity-60';

/**
 * A date range reads as one filter, so it is drawn as one control rather than
 * two inputs under two stacked labels — which is what pushed them off the row.
 */
export function DateRangeFilter({
  label,
  fromValue,
  toValue,
  onFromChange,
  onToChange,
  fromTestId,
  toTestId,
}: DateRangeFilterProps) {
  const isActive = Boolean(fromValue || toValue);

  return (
    <div
      className={cn(
        'flex h-9 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs dark:bg-input/30',
        'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
        isActive && 'border-primary/50 bg-primary/5',
      )}
    >
      <span className="whitespace-nowrap text-muted-foreground">{label}</span>
      <input
        type="date"
        aria-label={`${label} from`}
        value={fromValue}
        onChange={(event) => onFromChange(event.target.value)}
        className={dateInputClass}
        data-testid={fromTestId}
      />
      <span className="text-muted-foreground">–</span>
      <input
        type="date"
        aria-label={`${label} to`}
        value={toValue}
        onChange={(event) => onToChange(event.target.value)}
        className={dateInputClass}
        data-testid={toTestId}
      />
    </div>
  );
}
