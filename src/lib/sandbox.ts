import { SandboxStatus } from '@/gen/agynio/api/agents/v1/agents_pb';

export function formatSandboxStatus(status?: SandboxStatus): string {
  if (status === SandboxStatus.STARTING) return 'Starting';
  if (status === SandboxStatus.RUNNING) return 'Running';
  if (status === SandboxStatus.STOPPED) return 'Stopped';
  if (status === SandboxStatus.FAILED) return 'Failed';
  if (status === SandboxStatus.TERMINATED) return 'Terminated';
  return 'Unspecified';
}

export function sandboxStatusVariant(
  status?: SandboxStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === SandboxStatus.RUNNING) return 'default';
  if (status === SandboxStatus.STARTING) return 'secondary';
  if (status === SandboxStatus.FAILED) return 'destructive';
  return 'outline';
}

/** Stop only applies while the sandbox still has a workload to tear down. */
export function canStopSandbox(status?: SandboxStatus): boolean {
  return status === SandboxStatus.STARTING || status === SandboxStatus.RUNNING;
}
