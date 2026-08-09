import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SortableHeader } from '@/components/SortableHeader';
import { useListControls } from '@/hooks/useListControls';
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
import { CreateVolumeDialog, type EditableVolume } from '@/components/CreateVolumeDialog';
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
  const [editing, setEditing] = useState<EditableVolume | null>(null);

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

  const volumes = data?.volumes ?? [];

  const listControls = useListControls({
    items: volumes,
    searchFields: [
      (volume) => volume.name,
      (volume) => volume.mountPath,
      (volume) => volume.storageClass ?? '',
    ],
    sortOptions: {
      name: (volume) => volume.name,
      mountPath: (volume) => volume.mountPath,
      persistence: (volume) => (volume.persistent ? 'persistent' : 'ephemeral'),
      size: (volume) => volume.size ?? '',
    },
    defaultSortKey: 'name',
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-sm flex-1">
          <Input
            placeholder="Search volumes..."
            value={listControls.searchTerm}
            onChange={(event) => listControls.setSearchTerm(event.target.value)}
            data-testid="list-search"
          />
        </div>
        {addButton}
      </div>

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
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[1.2fr_1.5fr_1fr_0.8fr_1fr_0.8fr_160px]"
              data-testid="environment-volumes-header"
            >
              <SortableHeader
                label="Name"
                sortKey="name"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Mount path"
                sortKey="mountPath"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Persistence"
                sortKey="persistence"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Size"
                sortKey="size"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <span>Storage class</span>
              <span>TTL</span>
              <span className="text-right">Actions</span>
            </div>
            {listControls.filteredItems.map((volume) => (
              <div
                key={volume.meta?.id}
                className="grid items-center gap-2 border-t border-border px-6 py-4 text-sm md:grid-cols-[1.2fr_1.5fr_1fr_0.8fr_1fr_0.8fr_160px]"
                data-testid="environment-volumes-row"
              >
                <span className="font-medium text-foreground">{volume.name || EMPTY_PLACEHOLDER}</span>
                <span className="text-muted-foreground">{volume.mountPath || EMPTY_PLACEHOLDER}</span>
                <span className="text-muted-foreground">
                  {volume.persistent ? 'Persistent' : 'Ephemeral'}
                </span>
                <span className="text-muted-foreground">{volume.size || EMPTY_PLACEHOLDER}</span>
                <span className="text-muted-foreground">{volume.storageClass || EMPTY_PLACEHOLDER}</span>
                <span className="text-muted-foreground">{volume.ttl || EMPTY_PLACEHOLDER}</span>
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setEditing({
                        id: volume.meta?.id ?? '',
                        name: volume.name,
                        mountPath: volume.mountPath,
                        persistent: volume.persistent,
                        size: volume.size,
                        storageClass: volume.storageClass ?? '',
                        ttl: volume.ttl ?? '',
                      })
                    }
                    data-testid="environment-volumes-edit"
                  >
                    Edit
                  </Button>
                  <Button
                    variant="destructive"
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
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <CreateVolumeDialog
        environmentId={environmentId}
        runnerId={runnerId}
        volume={editing ?? undefined}
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        key={editing?.id ?? 'edit'}
      />

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
