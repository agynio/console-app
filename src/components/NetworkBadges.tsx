import { Badge } from '@/components/ui/badge';
import {
  TunnelConnectivity,
  TunnelEnrollmentState,
  type ProvisioningState,
} from '@/gen/agynio/api/networks/v1/networks_pb';
import {
  formatConnectivity,
  formatEnrollmentState,
  formatProvisioningState,
  provisioningStateVariant,
} from '@/lib/networks';

export function ProvisioningBadge({ state }: { state: ProvisioningState }) {
  return <Badge variant={provisioningStateVariant(state)}>{formatProvisioningState(state)}</Badge>;
}

export function EnrollmentBadge({ state }: { state: TunnelEnrollmentState }) {
  return (
    <Badge variant={state === TunnelEnrollmentState.ENROLLED ? 'default' : 'outline'}>
      {formatEnrollmentState(state)}
    </Badge>
  );
}

export function ConnectivityBadge({ state }: { state: TunnelConnectivity }) {
  return (
    <Badge variant={state === TunnelConnectivity.ONLINE ? 'default' : 'outline'}>{formatConnectivity(state)}</Badge>
  );
}
