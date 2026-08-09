import type { ComponentType, ReactNode } from 'react';
import { CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type ChoiceCardProps = {
  title: string;
  description: ReactNode;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  /** Leading mark, for a row of options that are easier to tell apart at a glance. */
  icon?: ComponentType<{ className?: string }>;
  /** Full-bleed panel above the text, showing what the option produces. */
  preview?: ReactNode;
  /** Shown under the description when the option cannot be taken here. */
  unavailableReason?: ReactNode;
  'data-testid'?: string;
};

/**
 * One option in a small set, presented as a card rather than a radio row: the
 * description carries as much weight as the label wherever the reader is being
 * taught what the options are. Where a preview is supplied it carries more —
 * seeing the end state answers the question before the copy is read.
 */
export function ChoiceCard({
  title,
  description,
  selected,
  onSelect,
  disabled,
  icon: Icon,
  preview,
  unavailableReason,
  'data-testid': testId,
}: ChoiceCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        'group flex w-full flex-col overflow-hidden rounded-lg border bg-card text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'border-primary' : 'border-border hover:bg-muted/50',
        disabled && 'cursor-not-allowed opacity-60 hover:bg-transparent',
      )}
      data-testid={testId}
    >
      {preview}
      <span className="flex flex-col gap-1 p-4">
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          {Icon ? <Icon className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}
          {title}
          {selected ? <CheckIcon className="ml-auto h-4 w-4 shrink-0" /> : null}
        </span>
        <span className="text-sm text-muted-foreground">{description}</span>
        {unavailableReason ? (
          <span className="mt-1 text-xs text-muted-foreground">{unavailableReason}</span>
        ) : null}
      </span>
    </button>
  );
}
