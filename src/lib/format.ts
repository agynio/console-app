import type { Timestamp } from '@bufbuild/protobuf/wkt';
import type { ComputeResources } from '@/gen/agynio/api/agents/v1/agents_pb';
import { AuthMethod } from '@/gen/agynio/api/llm/v1/llm_pb';
import { MembershipRole, MembershipStatus } from '@/gen/agynio/api/organizations/v1/organizations_pb';
import { RunnerStatus } from '@/gen/agynio/api/runners/v1/runners_pb';
import { ClusterRole } from '@/gen/agynio/api/users/v1/users_pb';

function toDate(timestamp: Timestamp): Date {
  const millis = Number(timestamp.seconds) * 1000 + Math.floor(timestamp.nanos / 1_000_000);
  return new Date(millis);
}

export function formatTimestamp(timestamp?: Timestamp | null, options?: Intl.DateTimeFormatOptions): string {
  if (!timestamp) return '—';
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
  if (entries.length === 0) return '—';
  return entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
}

export function formatComputeResources(resources?: ComputeResources): string {
  if (!resources) return '—';
  const parts: string[] = [];
  if (resources.requestsCpu) parts.push(`req-cpu: ${resources.requestsCpu}`);
  if (resources.requestsMemory) parts.push(`req-mem: ${resources.requestsMemory}`);
  if (resources.limitsCpu) parts.push(`lim-cpu: ${resources.limitsCpu}`);
  if (resources.limitsMemory) parts.push(`lim-mem: ${resources.limitsMemory}`);
  return parts.length > 0 ? parts.join(', ') : '—';
}

export function formatRunnerStatus(status: RunnerStatus): string {
  if (status === RunnerStatus.ENROLLED) return 'Enrolled';
  if (status === RunnerStatus.PENDING) return 'Pending';
  if (status === RunnerStatus.OFFLINE) return 'Offline';
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
