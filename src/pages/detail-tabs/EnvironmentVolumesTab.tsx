import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CreateVolumeDialog } from '@/components/CreateVolumeDialog';
import { agentsClient } from '@/api/client';
import { EMPTY_PLACEHOLDER } from '@/lib/format';

type EnvironmentVolumesTabProps = {
  environmentId: string;
  // The environment's runner: a storage class is resolved against the catalog
  // of the runner the workload lands on, so only that runner's classes apply.
  runnerId: string;
};

type PendingRemoval = {
  id: string;
  name: string;
  persistent: boolean;
};

/**
 * Volumes belong to the environment that mounts them. One disk is provisioned
 * per owner — per agent instance, per sandbox — so this lists definitions, not
 * the disks made from them; those appear under storage activity.
 */
export function EnvironmentVolumesTab({ environmentId, runnerId }: EnvironmentVolumesTabProps) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['environment-volumes', environmentId],
    queryFn: () => agentsClient.listVolumes({ environmentId, pageSize: 200 }),
    enabled: Boolean(environmentId),
  });

  const removeVolume = useMutation({
    mutationFn: (id: string) => agentsClient.deleteVolume({ id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['environment-volumes', environmentId] });
      toast.success('Volume removed.');
      setPendingRemoval(null);
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error ? mutationError.message : 'Failed to remove the volume.',
      );
    },
  });

  const addButton = (
    <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="environment-volumes-add">
      Add volume
    </Button>
  );

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">{addButton}</div>

      {/* An environment declaring nothing persistent gives its workloads a
          container filesystem discarded when they stop, which is easy to walk
          into unless it is said here rather than left as an empty table. */}
      {volumes.length === 0 ? (
        <Card className="border-border" data-testid="environment-volumes-empty">
          <CardContent className="space-y-2 py-6">
            <p className="text-sm text-foreground">This environment declares no volumes.</p>
            <p className="text-sm text-muted-foreground">
              Nothing written in a workload here survives it stopping — agents and sandboxes alike.
            </p>
          </CardContent>
        </Card>
      ) : (
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
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {volumes.map((volume) => (
                  <TableRow key={volume.meta?.id} data-testid="environment-volumes-row">
                    <TableCell className="font-medium text-foreground">
                      {volume.name || EMPTY_PLACEHOLDER}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {volume.mountPath || EMPTY_PLACEHOLDER}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {volume.persistent ? 'Persistent' : 'Ephemeral'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {volume.size || EMPTY_PLACEHOLDER}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {volume.storageClass || EMPTY_PLACEHOLDER}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {volume.ttl || EMPTY_PLACEHOLDER}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setPendingRemoval({
                            id: volume.meta?.id ?? '',
                            name: volume.name,
                            persistent: volume.persistent,
                          })
                        }
                        data-testid="environment-volumes-remove"
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <CreateVolumeDialog
        environmentId={environmentId}
        runnerId={runnerId}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      <AlertDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemoval(null);
        }}
      >
        <AlertDialogContent data-testid="environment-volumes-remove-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pendingRemoval?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemoval?.persistent
                ? 'Every disk provisioned from this volume is deprovisioned with it, for every agent instance and sandbox. The data on them is not recoverable.'
                : 'Workloads in this environment stop mounting it. Nothing persistent is lost — the volume is ephemeral.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingRemoval && removeVolume.mutate(pendingRemoval.id)}
              disabled={removeVolume.isPending}
              data-testid="environment-volumes-remove-confirm"
            >
              {removeVolume.isPending ? 'Removing…' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
