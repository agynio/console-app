import { useQuery } from '@tanstack/react-query';

import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { agentsClient } from '@/api/client';
import { EMPTY_PLACEHOLDER } from '@/lib/format';

type EnvironmentVolumesTabProps = {
  environmentId: string;
};

/**
 * Volumes belong to the environment that mounts them. One disk is provisioned
 * per owner — per agent instance, per sandbox — so this lists definitions, not
 * the disks made from them; those appear under storage activity.
 */
export function EnvironmentVolumesTab({ environmentId }: EnvironmentVolumesTabProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['environment-volumes', environmentId],
    queryFn: () => agentsClient.listVolumes({ environmentId, pageSize: 200 }),
    enabled: Boolean(environmentId),
  });

  if (isLoading) {
    return (
      <Card className="border-border" data-testid="environment-volumes-loading">
        <CardContent className="py-6 text-sm text-muted-foreground">Loading volumes…</CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-border" data-testid="environment-volumes-error">
        <CardContent className="py-6 text-sm text-destructive">
          Unable to load volumes for this environment.
        </CardContent>
      </Card>
    );
  }

  const volumes = data?.volumes ?? [];

  // An environment declaring nothing persistent gives its workloads a container
  // filesystem discarded when they stop, which is easy to walk into unless it
  // is said here rather than left as an empty table.
  if (volumes.length === 0) {
    return (
      <Card className="border-border" data-testid="environment-volumes-empty">
        <CardContent className="space-y-2 py-6">
          <p className="text-sm text-foreground">This environment declares no volumes.</p>
          <p className="text-sm text-muted-foreground">
            Nothing written in a workload here survives it stopping — agents and sandboxes alike.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border" data-testid="environment-volumes-table">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Mount path</TableHead>
              <TableHead>Persistence</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Storage class</TableHead>
              <TableHead>TTL</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {volumes.map((volume) => (
              <TableRow key={volume.meta?.id} data-testid="environment-volumes-row">
                <TableCell className="font-medium text-foreground">{volume.name || EMPTY_PLACEHOLDER}</TableCell>
                <TableCell className="text-muted-foreground">{volume.mountPath || EMPTY_PLACEHOLDER}</TableCell>
                <TableCell className="text-muted-foreground">
                  {volume.persistent ? 'Persistent' : 'Ephemeral'}
                </TableCell>
                <TableCell className="text-muted-foreground">{volume.size || EMPTY_PLACEHOLDER}</TableCell>
                <TableCell className="text-muted-foreground">{volume.storageClass || EMPTY_PLACEHOLDER}</TableCell>
                <TableCell className="text-muted-foreground">{volume.ttl || EMPTY_PLACEHOLDER}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
