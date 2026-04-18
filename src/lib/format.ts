import type { Timestamp } from '@bufbuild/protobuf/wkt';
import type { ComputeResources } from '@/gen/agynio/api/agents/v1/agents_pb';
import { AppVisibility } from '@/gen/agynio/api/apps/v1/apps_pb';
import { AuthMethod } from '@/gen/agynio/api/llm/v1/llm_pb';
import { MembershipRole, MembershipStatus } from '@/gen/agynio/api/organizations/v1/organizations_pb';
import { ContainerStatus, RunnerStatus, WorkloadStatus } from '@/gen/agynio/api/runners/v1/runners_pb';
import { SecretProviderType } from '@/gen/agynio/api/secrets/v1/secrets_pb';
import { ThreadStatus } from '@/gen/agynio/api/threads/v1/threads_pb';
import { ClusterRole, DeviceStatus } from '@/gen/agynio/api/users/v1/users_pb';

export const EMPTY_PLACEHOLDER = '—';

function toDate(timestamp: Timestamp): Date {
  const millis = Number(timestamp.seconds) * 1000 + Math.floor(timestamp.nanos / 1_000_000);
  return new Date(millis);
}

export function timestampToMillis(timestamp?: Timestamp | null): number {
  if (!timestamp) return 0;
  return toDate(timestamp).getTime();
}

export function formatTimestamp(timestamp?: Timestamp | null, options?: Intl.DateTimeFormatOptions): string {
  if (!timestamp) return EMPTY_PLACEHOLDER;
  const formatter = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...options,
  });
  return formatter.format(toDate(timestamp));
}

export function formatDateOnly(timestamp?: Timestamp | null): string {
  return formatTimestamp(timestamp, { dateStyle: 'medium' });
}

export function formatLabelPairs(labels: Record<string, string>): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return EMPTY_PLACEHOLDER;
  return entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
}

export function formatComputeResources(resources?: ComputeResources): string {
  if (!resources) return EMPTY_PLACEHOLDER;
  const parts: string[] = [];
  if (resources.requestsCpu) parts.push(`req-cpu: ${resources.requestsCpu}`);
  if (resources.requestsMemory) parts.push(`req-mem: ${resources.requestsMemory}`);
  if (resources.limitsCpu) parts.push(`lim-cpu: ${resources.limitsCpu}`);
  if (resources.limitsMemory) parts.push(`lim-mem: ${resources.limitsMemory}`);
  return parts.length > 0 ? parts.join(', ') : EMPTY_PLACEHOLDER;
}

export function truncate(value?: string | null, maxLength = 100): string {
  if (!value) return EMPTY_PLACEHOLDER;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...`;
}

export function formatRunnerStatus(status: RunnerStatus): string {
  if (status === RunnerStatus.ENROLLED) return 'Enrolled';
  if (status === RunnerStatus.PENDING) return 'Pending';
  if (status === RunnerStatus.OFFLINE) return 'Offline';
  return 'Unspecified';
}

export function formatDeviceStatus(status: DeviceStatus): string {
  if (status === DeviceStatus.PENDING) return 'Pending';
  if (status === DeviceStatus.ENROLLED) return 'Enrolled';
  return 'Unspecified';
}

export function formatWorkloadStatus(status: WorkloadStatus): string {
  if (status === WorkloadStatus.STARTING) return 'Starting';
  if (status === WorkloadStatus.RUNNING) return 'Running';
  if (status === WorkloadStatus.STOPPING) return 'Stopping';
  if (status === WorkloadStatus.STOPPED) return 'Stopped';
  if (status === WorkloadStatus.FAILED) return 'Failed';
  return 'Unspecified';
}

export function formatContainerStatus(status: ContainerStatus): string {
  if (status === ContainerStatus.RUNNING) return 'Running';
  if (status === ContainerStatus.TERMINATED) return 'Terminated';
  if (status === ContainerStatus.WAITING) return 'Waiting';
  return 'Unspecified';
}

export function summarizeContainers(containers: Array<{ status: ContainerStatus }>): string {
  if (containers.length === 0) return EMPTY_PLACEHOLDER;
  const counts: Record<string, number> = {};
  containers.forEach((container) => {
    const label = formatContainerStatus(container.status);
    counts[label] = (counts[label] ?? 0) + 1;
  });
  const order = ['Running', 'Terminated', 'Waiting', 'Unspecified'];
  const parts: string[] = [];
  order.forEach((label) => {
    const count = counts[label];
    if (count) {
      parts.push(`${label} (${count})`);
    }
  });
  return parts.length > 0 ? parts.join(', ') : EMPTY_PLACEHOLDER;
}

export function formatAppVisibility(visibility: AppVisibility): string {
  if (visibility === AppVisibility.PUBLIC) return 'Public';
  if (visibility === AppVisibility.INTERNAL) return 'Internal';
  return 'Unspecified';
}

export function formatClusterRole(role?: ClusterRole): string {
  if (role === ClusterRole.ADMIN) return 'Admin';
  if (role === ClusterRole.UNSPECIFIED) return 'None';
  return 'Unknown';
}

export function formatAuthMethod(method?: AuthMethod): string {
  if (method === AuthMethod.BEARER) return 'Bearer';
  if (method === AuthMethod.UNSPECIFIED) return 'Unspecified';
  return 'Unspecified';
}

export function formatSecretProviderType(type: SecretProviderType): string {
  if (type === SecretProviderType.VAULT) return 'Vault';
  return 'Unspecified';
}

export function formatMembershipRole(role?: MembershipRole): string {
  if (role === MembershipRole.OWNER) return 'Owner';
  if (role === MembershipRole.MEMBER) return 'Member';
  return 'Unspecified';
}

export function formatMembershipStatus(status?: MembershipStatus): string {
  if (status === MembershipStatus.ACTIVE) return 'Active';
  if (status === MembershipStatus.PENDING) return 'Pending';
  if (status === MembershipStatus.UNSPECIFIED) return 'Unspecified';
  return 'Unspecified';
}

export function formatThreadStatus(status?: ThreadStatus): string {
  if (status === ThreadStatus.ACTIVE) return 'Active';
  if (status === ThreadStatus.ARCHIVED) return 'Archived';
  if (status === ThreadStatus.UNSPECIFIED) return 'Unspecified';
  return 'Unspecified';
}
