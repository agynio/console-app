import { ChoiceCard } from '@/components/ChoiceCard';
import type { SetupPath } from './catalog';

type StepChoosePathProps = {
  value: SetupPath | null;
  onChoose: (path: SetupPath) => void;
};

/** What a conversation with an agent looks like, before the word "agent" means anything. */
const chatPreview = (
  <span className="flex min-h-20 flex-col gap-1.5 bg-primary/5 p-3">
    <span className="self-end rounded-lg bg-background px-2.5 py-1 text-xs text-foreground">
      Summarize today&apos;s errors
    </span>
    <span className="self-start rounded-lg bg-background px-2.5 py-1 text-xs text-muted-foreground">
      On it — checking the logs…
    </span>
  </span>
);

const sandboxPreview = (
  <span className="block min-h-20 bg-muted p-3 font-mono text-xs leading-relaxed">
    <span className="block">
      <span className="text-foreground">~/workspace</span>
      <span className="text-muted-foreground"> $ npm test</span>
    </span>
    <span className="block text-muted-foreground">12 passing</span>
  </span>
);

/**
 * Written as outcomes rather than as the platform's nouns, and shown before it
 * is written: a person four minutes into an account cannot sort themselves into
 * a taxonomy they have not been taught yet. The answer picks what this run
 * finishes with, not what the organization is.
 */
export function StepChoosePath({ value, onChoose }: StepChoosePathProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">What do you want to try first?</h2>
        <p className="text-sm text-muted-foreground">
          You can set up the other one right after.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <ChoiceCard
          title="Chat with an agent"
          description="An AI teammate that works on its own and reports back."
          preview={chatPreview}
          selected={value === 'agent'}
          onSelect={() => onChoose('agent')}
          data-testid="setup-path-agent"
        />
        <ChoiceCard
          title="Work in a sandbox"
          description="The same setup, with you at the keyboard: Claude Code or Codex, and a terminal in your browser."
          preview={sandboxPreview}
          selected={value === 'sandbox'}
          onSelect={() => onChoose('sandbox')}
          data-testid="setup-path-sandbox"
        />
      </div>
    </div>
  );
}
