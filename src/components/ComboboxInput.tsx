import * as React from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { Popover as PopoverPrimitive } from 'radix-ui';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type ComboboxOption = {
  value: string;
  label: string;
  description?: string;
};

type ComboboxInputProps = {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  'data-testid'?: string;
};

/**
 * A text input that also offers a list to pick from.
 *
 * The typed value is authoritative: the list narrows as you type and a value
 * that matches nothing is still accepted. That is deliberate for fields whose
 * options are advisory rather than a closed set — a flavor is resolved against
 * the runner's catalog when a workload starts, so a name this list does not
 * know may still be valid by then.
 */
export function ComboboxInput({
  id,
  value,
  onValueChange,
  options,
  placeholder,
  emptyMessage = 'No options available',
  disabled,
  'data-testid': testId,
}: ComboboxInputProps) {
  const [open, setOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const query = value.trim().toLowerCase();
  const matches = query
    ? options.filter(
        (option) =>
          option.label.toLowerCase().includes(query) || option.value.toLowerCase().includes(query),
      )
    : options;
  // An exact match means the list has nothing left to offer.
  const visible = matches.length === 1 && matches[0].value === value ? [] : matches;

  const select = (option: ComboboxOption) => {
    onValueChange(option.value);
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <PopoverPrimitive.Root open={open && visible.length > 0} onOpenChange={setOpen}>
      <div className="relative">
        <PopoverPrimitive.Anchor asChild>
          <Input
            id={id}
            ref={inputRef}
            value={value}
            disabled={disabled}
            placeholder={placeholder}
            data-testid={testId}
            className="pr-9"
            onChange={(event) => {
              onValueChange(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setOpen(false);
              }
            }}
          />
        </PopoverPrimitive.Anchor>
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label="Show options"
          data-testid={testId ? `${testId}-toggle` : undefined}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          onClick={() => {
            setOpen((previous) => !previous);
            inputRef.current?.focus();
          }}
        >
          <ChevronDownIcon className="h-4 w-4" />
        </button>
      </div>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          // The list is a suggestion surface, not a modal: focus stays in the
          // input so typing is never interrupted by opening it.
          onOpenAutoFocus={(event) => event.preventDefault()}
          className={cn(
            'z-50 max-h-60 w-[var(--radix-popover-trigger-width)] overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md',
          )}
          style={{ width: 'var(--radix-popover-anchor-width)' }}
        >
          {visible.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">{emptyMessage}</p>
          ) : (
            visible.map((option) => (
              <button
                key={option.value}
                type="button"
                data-testid={testId ? `${testId}-option-${option.value}` : undefined}
                className="flex w-full min-w-0 flex-col items-start gap-0.5 rounded-sm px-2 py-1.5 text-left text-sm transition hover:bg-accent hover:text-accent-foreground"
                onClick={() => select(option)}
              >
                {/* A value can be longer than the field it fills - a tag naming
                    a commit, say - so it truncates rather than widening the
                    list past its anchor. */}
                <span className="w-full truncate">{option.label}</span>
                {option.description ? (
                  <span className="w-full truncate text-xs text-muted-foreground">{option.description}</span>
                ) : null}
              </button>
            ))
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
