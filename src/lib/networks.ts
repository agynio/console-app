import type { Timestamp } from '@bufbuild/protobuf/wkt';

import {
  PrivateResourceAccessPrincipalType,
  PrivateResourceProtocol,
  ProvisioningState,
  TunnelConnectivity,
  TunnelEnrollmentState,
  type PrivateResource,
} from '@/gen/agynio/api/networks/v1/networks_pb';
import { formatDuration, timestampToMillis } from '@/lib/format';

export function formatProvisioningState(state: ProvisioningState): string {
  if (state === ProvisioningState.ACTIVE) return 'Active';
  if (state === ProvisioningState.FAILED) return 'Failed';
  if (state === ProvisioningState.REMOVING) return 'Removing';
  return 'Unspecified';
}

export function provisioningStateVariant(
  state: ProvisioningState,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (state === ProvisioningState.FAILED) return 'destructive';
  if (state === ProvisioningState.ACTIVE) return 'default';
  return 'outline';
}

export function formatEnrollmentState(state: TunnelEnrollmentState): string {
  if (state === TunnelEnrollmentState.PENDING) return 'Pending';
  if (state === TunnelEnrollmentState.ENROLLED) return 'Enrolled';
  return 'Unspecified';
}

export function formatConnectivity(state: TunnelConnectivity): string {
  if (state === TunnelConnectivity.ONLINE) return 'Online';
  if (state === TunnelConnectivity.OFFLINE) return 'Offline';
  return 'Unspecified';
}

export function formatProtocol(protocol: PrivateResourceProtocol): string {
  if (protocol === PrivateResourceProtocol.TCP) return 'TCP';
  if (protocol === PrivateResourceProtocol.HTTP) return 'HTTP';
  if (protocol === PrivateResourceProtocol.HTTPS) return 'HTTPS';
  return 'Unspecified';
}

export function formatPrincipalType(type: PrivateResourceAccessPrincipalType): string {
  if (type === PrivateResourceAccessPrincipalType.AGENT) return 'Agent';
  if (type === PrivateResourceAccessPrincipalType.USER) return 'User';
  if (type === PrivateResourceAccessPrincipalType.APP) return 'App';
  if (type === PrivateResourceAccessPrincipalType.GROUP) return 'Group';
  if (type === PrivateResourceAccessPrincipalType.ENVIRONMENT) return 'Environment';
  return 'Principal';
}

/** Parses a comma-separated port list, dropping anything outside 1..65535. */
export function parsePorts(value: string): number[] {
  return value
    .split(',')
    .map((port) => Number(port.trim()))
    .filter((port) => Number.isInteger(port) && port > 0 && port <= 65535);
}

/**
 * The enrollment window. It only bounds enrolling, so it says nothing once a
 * tunnel has enrolled — callers show this for pending tunnels alone.
 */
export function formatEnrollmentExpiry(expiresAt?: Timestamp | null): { label: string; expired: boolean } | null {
  const millis = timestampToMillis(expiresAt);
  if (!millis) return null;
  const remaining = millis - Date.now();
  if (remaining <= 0) return { label: 'enrollment expired', expired: true };
  return { label: `enrollment expires in ${formatDuration(remaining, 1)}`, expired: false };
}

export function buildConnectionString(resource: PrivateResource): string {
  const protocol = formatProtocol(resource.protocol).toLowerCase();
  const port = resource.interceptPorts[0];
  return port ? `${protocol}://${resource.interceptHost}:${port}` : `${protocol}://${resource.interceptHost}`;
}

export function formatPortMapping(resource: PrivateResource): string {
  return resource.interceptPorts
    .map((port, index) => `${resource.interceptHost}:${port} -> ${resource.targetHost}:${resource.targetPorts[index]}`)
    .join(', ');
}
