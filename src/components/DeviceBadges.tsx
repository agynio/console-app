import { Badge } from '@/components/ui/badge';
import { DeviceConnectivity, DeviceStatus } from '@/gen/agynio/api/users/v1/users_pb';
import { formatDeviceConnectivity, formatDeviceStatus } from '@/lib/format';

export function DeviceStatusBadge({ status }: { status: DeviceStatus }) {
  return (
    <Badge variant={status === DeviceStatus.ENROLLED ? 'default' : 'outline'}>{formatDeviceStatus(status)}</Badge>
  );
}

export function DeviceConnectivityBadge({ connectivity }: { connectivity: DeviceConnectivity }) {
  return (
    <Badge variant={connectivity === DeviceConnectivity.ONLINE ? 'default' : 'outline'}>
      {formatDeviceConnectivity(connectivity)}
    </Badge>
  );
}
