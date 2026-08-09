import {
  ArrowUpLeftIcon,
  CheckIcon,
  LayoutGridIcon,
  LockIcon,
  MessageCircleIcon,
  ServerIcon,
  ShieldIcon,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SetupState } from './useSetupWizard';
import type { SetupDestination } from './destination';
import { Vendor } from '@/gen/agynio/api/llm/v1/llm_pb';
import { RUNTIMES } from './catalog';

type SetupFinishProps = {
  state: SetupState;
  /** Null when no sibling host is derivable; the pointer is then omitted. */
  target: SetupDestination | null;
  onDismiss: () => void;
};

type Capability = { icon: LucideIcon; label: string };

/** Section names, not sentences. What matters is recognising them in the sidebar later. */
const SHARED_CAPABILITIES: Capability[] = [
  { icon: LockIcon, label: 'Secrets & ENVs' },
  { icon: ServerIcon, label: 'Private resources' },
  { icon: ShieldIcon, label: 'Egress rules' },
];

const AGENT_LAST: Capability = { icon: LayoutGridIcon, label: 'Apps' };
const SANDBOX_LAST: Capability = { icon: MessageCircleIcon, label: 'Agents' };

export function SetupFinish({ state, target, onDismiss }: SetupFinishProps) {
  const isAgent = state.path === 'agent';
  const headline = isAgent ? `${state.agentName || 'Your agent'} is ready` : 'Sandbox is running';
  const subline = isAgent
    ? 'Say hello and it gets to work.'
    : 'Open a terminal and get to work.';

  const capabilities = [...SHARED_CAPABILITIES, isAgent ? AGENT_LAST : SANDBOX_LAST];

  // A Claude plan does not cover an autonomous agent, so the conversion move on
  // this path costs more than a click. Better stated here than discovered when
  // an agent will not start.
  const claudeSubscription =
    !isAgent &&
    state.llmMode === 'native' &&
    RUNTIMES.find((entry) => entry.id === state.runtime)?.vendor === Vendor.ANTHROPIC;

  return (
    <div className="fixed inset-0 z-30 bg-black/50 backdrop-blur-xs">
      {/* Clicking away is a real exit: if the only way out were the destination,
          the celebration would be a trap. */}
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 cursor-default"
        onClick={onDismiss}
        data-testid="setup-finish-scrim"
      />

      {/* Sits below the open switcher rather than inside it — the panel is the
          thing to click, and this only says so. */}
      {target ? (
        <div
          className="pointer-events-none absolute left-6 top-60 flex items-center gap-2 text-white"
          data-testid="setup-finish-pointer"
        >
          <ArrowUpLeftIcon className="h-6 w-6" />
          <span className="text-sm font-medium">{target.label}</span>
        </div>
      ) : null}

      <div className="pointer-events-none flex h-full items-center justify-center p-6">
        <div
          className="pointer-events-auto max-h-full w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card p-7"
          data-testid="setup-finish"
        >
          <div className="flex justify-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
              <CheckIcon className="h-6 w-6 text-primary" />
            </span>
          </div>
          <p
            className="mt-3 text-center text-lg font-semibold text-foreground"
            data-testid="setup-finish-built"
          >
            {headline}
          </p>
          <p className="mt-1 text-center text-sm text-muted-foreground">{subline}</p>

          <p className="mt-6 text-xs text-muted-foreground">Also here</p>
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3">
            {capabilities.map((capability) => (
              <div key={capability.label} className="flex items-center gap-2">
                <capability.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-sm text-foreground">{capability.label}</span>
              </div>
            ))}
          </div>

          {!isAgent ? (
            <p className="mt-4 text-xs text-muted-foreground">
              Stops after 30 minutes idle, and comes back on the same disks.
            </p>
          ) : null}
          {state.llmMode === 'native' ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Your plan&apos;s token isn&apos;t checked until first use.
            </p>
          ) : null}
          {claudeSubscription ? (
            <p className="mt-2 text-xs text-muted-foreground" data-testid="setup-finish-conversion">
              A Claude plan doesn&apos;t cover autonomous agents — an agent needs an API key and a
              second environment.
            </p>
          ) : null}

          <div className="mt-6 text-center">
            <Button variant="outline" size="sm" onClick={onDismiss} data-testid="setup-finish-exit">
              Explore the Console
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
