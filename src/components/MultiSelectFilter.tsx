import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export type MultiSelectOption = {
  value: string;
  label: string;
  secondary?: string;
};

type MultiSelectFilterProps = {
  label: string;
  options: MultiSelectOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  testId?: string;
  emptyLabel?: string;
};

export function MultiSelectFilter({
  label,
  options,
  selectedValues,
  onChange,
  testId,
  emptyLabel = 'No options available',
}: MultiSelectFilterProps) {
  const selected = new Set(selectedValues);
  const selectedCount = selectedValues.length;
  const isActive = selectedCount > 0;

  // Naming the first selection beats a bare count: the common case is one
  // value, and "Status Active" reads without a second click.
  const firstSelectedLabel = options.find((option) => option.value === selectedValues[0])?.label;
  const summary = isActive
    ? selectedCount === 1
      ? (firstSelectedLabel ?? '1 selected')
      : `${firstSelectedLabel ?? selectedValues[0]} +${selectedCount - 1}`
    : '';

  const applySelection = (nextSelected: Set<string>) => {
    const ordered = options.filter((option) => nextSelected.has(option.value)).map((option) => option.value);
    onChange(ordered);
  };

  const toggle = (value: string) => {
    const nextSelected = new Set(selected);
    if (nextSelected.has(value)) {
      nextSelected.delete(value);
    } else {
      nextSelected.add(value);
    }
    applySelection(nextSelected);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'h-9 min-w-[9rem] justify-between gap-2 font-normal',
            isActive && 'border-primary/50 bg-primary/5',
          )}
          data-testid={testId}
          data-active={isActive || undefined}
        >
          <span className="truncate">
            <span className={cn(!isActive && 'text-muted-foreground')}>{label}</span>
            {summary ? <span className="ml-1.5 text-foreground">{summary}</span> : null}
          </span>
          <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-64 overflow-y-auto">
        {options.length === 0 ? (
          <DropdownMenuItem disabled>{emptyLabel}</DropdownMenuItem>
        ) : (
          options.map((option) => {
            const isSelected = selected.has(option.value);
            return (
              // Selecting keeps the menu open on purpose: picking several values
              // is the point, and dismissing costs a click per extra value.
              <DropdownMenuItem
                key={option.value}
                onSelect={(event) => {
                  event.preventDefault();
                  toggle(option.value);
                }}
                className="gap-2"
              >
                <CheckIcon className={cn('size-4 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')} />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate">{option.label}</span>
                  {option.secondary ? (
                    <span className="truncate text-xs text-muted-foreground">{option.secondary}</span>
                  ) : null}
                </div>
              </DropdownMenuItem>
            );
          })
        )}
        {isActive ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange([])}>Clear {label.toLowerCase()}</DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
