import { AgentInstanceState } from '@/gen/agynio/api/agents/v1/agents_pb';
import { EMPTY_PLACEHOLDER } from '@/lib/format';

export function formatInstanceState(state?: AgentInstanceState): string {
  if (state === AgentInstanceState.ACTIVE) return 'Active';
  if (state === AgentInstanceState.PAUSED) return 'Paused';
  if (state === AgentInstanceState.TERMINATED) return 'Terminated';
  return 'Unspecified';
}

export function instanceStateVariant(
  state?: AgentInstanceState,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (state === AgentInstanceState.ACTIVE) return 'default';
  if (state === AgentInstanceState.PAUSED) return 'secondary';
  if (state === AgentInstanceState.TERMINATED) return 'destructive';
  return 'outline';
}

/** Reason codes the agents service records when it pauses an instance. */
const PAUSE_REASON_LABELS: Record<string, string> = {
  idle_ttl_exceeded: 'Idle TTL exceeded',
  start_failures_exhausted: 'Start failures exhausted',
  volume_lost: 'Volume lost',
  runner_deprovisioned: 'Runner deprovisioned',
  manual: 'Paused manually',
};

/** Console-initiated pauses are recorded under this reason. */
export const MANUAL_PAUSE_REASON = 'manual';

export function formatPauseReason(reason?: string): string {
  const trimmed = reason?.trim();
  if (!trimmed) return EMPTY_PLACEHOLDER;
  return PAUSE_REASON_LABELS[trimmed] ?? trimmed;
}
