import { cn } from '@/lib/utils';
import type { StepId } from './useSetupWizard';

type SetupStepperProps = {
  steps: { id: StepId; label: string }[];
  current: number;
};

/**
 * A count and a rail rather than five labelled circles. The labels name things
 * — model access, files tool — that mean nothing until the step that teaches
 * them, and at full weight they outshout the question being asked.
 */
export function SetupStepper({ steps, current }: SetupStepperProps) {
  const step = steps[current];

  return (
    <div className="flex items-center gap-3" data-testid="setup-stepper">
      <span className="text-sm text-muted-foreground">
        Step {current + 1} of {steps.length}
      </span>
      <ol
        className="flex items-center gap-1"
        aria-label={step ? `Step ${current + 1} of ${steps.length}: ${step.label}` : undefined}
      >
        {steps.map((entry, index) => (
          <li
            key={entry.id}
            aria-current={index === current ? 'step' : undefined}
            className={cn(
              'h-[3px] rounded-full transition-all',
              index === current ? 'w-4 bg-primary' : 'w-1.5',
              index < current && 'bg-primary/40',
              index > current && 'bg-border',
            )}
          />
        ))}
      </ol>
    </div>
  );
}
