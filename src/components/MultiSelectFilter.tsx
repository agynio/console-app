import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
  const triggerLabel = selectedCount > 0 ? `${label} (${selectedCount})` : label;

  const applySelection = (nextSelected: Set<string>) => {
    const ordered = options.filter((option) => nextSelected.has(option.value)).map((option) => option.value);
    onChange(ordered);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" data-testid={testId} disabled={options.length === 0}>
          {triggerLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 max-h-72 overflow-y-auto">
        {options.length === 0 ? (
          <DropdownMenuItem disabled>{emptyLabel}</DropdownMenuItem>
        ) : (
          options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={selected.has(option.value)}
              onCheckedChange={(checked) => {
                const nextSelected = new Set(selected);
                if (checked) {
                  nextSelected.add(option.value);
                } else {
                  nextSelected.delete(option.value);
                }
                applySelection(nextSelected);
              }}
            >
              <div className="flex flex-col">
                <span>{option.label}</span>
                {option.secondary ? <span className="text-xs text-muted-foreground">{option.secondary}</span> : null}
              </div>
            </DropdownMenuCheckboxItem>
          ))
        )}
        {selectedCount > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                onChange([]);
              }}
            >
              Clear selections
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
