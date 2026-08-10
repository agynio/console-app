import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** A stated fact on a detail page: a label above its value, never a disabled input. */
export function DetailField({
  label,
  children,
  className,
  testId,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="break-words text-sm text-foreground" data-testid={testId}>
        {children}
      </div>
    </div>
  );
}
