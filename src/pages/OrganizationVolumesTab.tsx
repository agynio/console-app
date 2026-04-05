import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentsClient } from '@/api/client';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Input } from '@/components/Input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Volume } from '@/gen/agynio/api/agents/v1/agents_pb';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

export function OrganizationVolumesTab() {
  const { id } = useParams();
  const organizationId = id ?? '';
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createDescription, setCreateDescription] = useState('');
  const [createMountPath, setCreateMountPath] = useState('');
  const [createSize, setCreateSize] = useState('');
  const [createPersistent, setCreatePersistent] = useState(true);
  const [createMountError, setCreateMountError] = useState('');
  const [createSizeError, setCreateSizeError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editVolumeId, setEditVolumeId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editMountPath, setEditMountPath] = useState('');
  const [editSize, setEditSize] = useState('');
  const [editPersistent, setEditPersistent] = useState(true);
  const [editMountError, setEditMountError] = useState('');
  const [editSizeError, setEditSizeError] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const volumesQuery = useQuery({
    queryKey: ['volumes', organizationId, 'list'],
    queryFn: () => agentsClient.listVolumes({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const createVolumeMutation = useMutation({
    mutationFn: (payload: {
      persistent: boolean;
      mountPath: string;
      size: string;
      description: string;
      organizationId: string;
    }) => agentsClient.createVolume(payload),
    onSuccess: () => {
      toast.success('Volume created.');
      void queryClient.invalidateQueries({ queryKey: ['volumes', organizationId, 'list'] });
      setCreateOpen(false);
      setCreateDescription('');
      setCreateMountPath('');
      setCreateSize('');
      setCreatePersistent(true);
      setCreateMountError('');
      setCreateSizeError('');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create volume.');
    },
  });

  const updateVolumeMutation = useMutation({
    mutationFn: (payload: { id: string; persistent?: boolean; mountPath?: string; size?: string; description?: string }) =>
      agentsClient.updateVolume(payload),
    onSuccess: () => {
      toast.success('Volume updated.');
      void queryClient.invalidateQueries({ queryKey: ['volumes', organizationId, 'list'] });
      setEditOpen(false);
      setEditVolumeId(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update volume.');
    },
  });

  const deleteVolumeMutation = useMutation({
    mutationFn: (volumeId: string) => agentsClient.deleteVolume({ id: volumeId }),
    onSuccess: () => {
      toast.success('Volume deleted.');
      void queryClient.invalidateQueries({ queryKey: ['volumes', organizationId, 'list'] });
      setDeleteTargetId(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete volume.');
    },
  });

  const handleCreate = () => {
    const trimmedMount = createMountPath.trim();
    const trimmedSize = createSize.trim();
    let hasError = false;

    if (!trimmedMount) {
      setCreateMountError('Mount path is required.');
      hasError = true;
    } else if (!trimmedMount.startsWith('/')) {
      setCreateMountError('Mount path must start with /.');
      hasError = true;
    } else if (createMountError) {
      setCreateMountError('');
    }

    if (!trimmedSize) {
      setCreateSizeError('Size is required.');
      hasError = true;
    } else if (createSizeError) {
      setCreateSizeError('');
    }

    if (hasError) return;

    createVolumeMutation.mutate({
      persistent: createPersistent,
      mountPath: trimmedMount,
      size: trimmedSize,
      description: createDescription.trim(),
      organizationId,
    });
  };

  const handleCreateOpenChange = (open: boolean) => {
    setCreateOpen(open);
    if (!open) {
      setCreateDescription('');
      setCreateMountPath('');
      setCreateSize('');
      setCreatePersistent(true);
      setCreateMountError('');
      setCreateSizeError('');
    }
  };

  const handleEditOpen = (volume: Volume) => {
    const volumeId = volume.meta?.id;
    if (!volumeId) {
      toast.error('Missing volume ID.');
      return;
    }
    setEditVolumeId(volumeId);
    setEditDescription(volume.description);
    setEditMountPath(volume.mountPath);
    setEditSize(volume.size);
    setEditPersistent(volume.persistent);
    setEditMountError('');
    setEditSizeError('');
    setEditOpen(true);
  };

  const handleEditSave = () => {
    const trimmedMount = editMountPath.trim();
    const trimmedSize = editSize.trim();
    let hasError = false;

    if (!trimmedMount) {
      setEditMountError('Mount path is required.');
      hasError = true;
    } else if (!trimmedMount.startsWith('/')) {
      setEditMountError('Mount path must start with /.');
      hasError = true;
    } else if (editMountError) {
      setEditMountError('');
    }

    if (!trimmedSize) {
      setEditSizeError('Size is required.');
      hasError = true;
    } else if (editSizeError) {
      setEditSizeError('');
    }

    if (hasError) return;
    if (!editVolumeId) {
      toast.error('Missing volume ID.');
      return;
    }

    updateVolumeMutation.mutate({
      id: editVolumeId,
      mountPath: trimmedMount,
      size: trimmedSize,
      description: editDescription.trim(),
      persistent: editPersistent,
    });
  };

  const handleEditOpenChange = (open: boolean) => {
    setEditOpen(open);
    if (!open) {
      setEditVolumeId(null);
      setEditDescription('');
      setEditMountPath('');
      setEditSize('');
      setEditPersistent(true);
      setEditMountError('');
      setEditSizeError('');
    }
  };

  const handleDeleteOpen = (volume: Volume) => {
    const volumeId = volume.meta?.id;
    if (!volumeId) {
      toast.error('Missing volume ID.');
      return;
    }
    setDeleteTargetId(volumeId);
  };

  const volumes = volumesQuery.data?.volumes ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
        <h3 className="text-lg font-semibold text-[var(--agyn-dark)]" data-testid="organization-volumes-heading">
          Volumes
        </h3>
        <p className="text-sm text-[var(--agyn-gray)]">Storage volumes for this organization.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleCreateOpenChange(true)}
          data-testid="organization-volumes-create"
        >
          Add volume
        </Button>
      </div>
      {volumesQuery.isPending ? <div className="text-sm text-[var(--agyn-gray)]">Loading volumes...</div> : null}
      {volumesQuery.isError ? <div className="text-sm text-[var(--agyn-gray)]">Failed to load volumes.</div> : null}
      {volumes.length === 0 && !volumesQuery.isPending ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="organization-volumes-empty">
          <CardContent className="py-10 text-center text-sm text-[var(--agyn-gray)]">
            No volumes provisioned.
          </CardContent>
        </Card>
      ) : null}
      {volumes.length > 0 ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="organization-volumes-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-[var(--agyn-gray)] md:grid-cols-[2fr_1fr_1fr_1fr_140px]"
              data-testid="organization-volumes-header"
            >
              <span>Volume</span>
              <span>Mount Path</span>
              <span>Size</span>
              <span>Persistent</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-[var(--agyn-border-subtle)]">
              {volumes.map((volume) => (
                <div
                  key={volume.meta?.id ?? volume.mountPath}
                  className="grid items-center gap-2 px-6 py-4 text-sm text-[var(--agyn-dark)] md:grid-cols-[2fr_1fr_1fr_1fr_140px]"
                  data-testid="organization-volume-row"
                >
                  <div>
                    <div className="font-medium" data-testid="organization-volume-description">
                      {volume.description || 'Volume'}
                    </div>
                    <div className="text-xs text-[var(--agyn-gray)]" data-testid="organization-volume-id">
                      {volume.meta?.id ?? '—'}
                    </div>
                  </div>
                  <span className="text-xs text-[var(--agyn-gray)]" data-testid="organization-volume-mount">
                    {volume.mountPath || '—'}
                  </span>
                  <span className="text-xs text-[var(--agyn-gray)]" data-testid="organization-volume-size">
                    {volume.size || '—'}
                  </span>
                  <Badge
                    variant={volume.persistent ? 'secondary' : 'outline'}
                    data-testid="organization-volume-persistent"
                  >
                    {volume.persistent ? 'Yes' : 'No'}
                  </Badge>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditOpen(volume)}
                      data-testid="organization-volume-edit"
                    >
                      Edit
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDeleteOpen(volume)}
                      data-testid="organization-volume-delete"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
      <Dialog open={createOpen} onOpenChange={handleCreateOpenChange}>
        <DialogContent data-testid="organization-volumes-create-dialog">
          <DialogHeader>
            <DialogTitle data-testid="organization-volumes-create-title">Add volume</DialogTitle>
            <DialogDescription data-testid="organization-volumes-create-description">
              Provision a new storage volume for the organization.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              label="Description"
              value={createDescription}
              onChange={(event) => setCreateDescription(event.target.value)}
              data-testid="organization-volumes-create-description-input"
            />
            <Input
              label="Mount Path"
              placeholder="/data"
              value={createMountPath}
              onChange={(event) => {
                setCreateMountPath(event.target.value);
                if (createMountError) setCreateMountError('');
              }}
              error={createMountError}
              data-testid="organization-volumes-create-mount"
            />
            <Input
              label="Size"
              placeholder="10Gi"
              value={createSize}
              onChange={(event) => {
                setCreateSize(event.target.value);
                if (createSizeError) setCreateSizeError('');
              }}
              error={createSizeError}
              data-testid="organization-volumes-create-size"
            />
            <label className="flex items-center gap-2 text-sm text-[var(--agyn-dark)]">
              <input
                type="checkbox"
                checked={createPersistent}
                onChange={(event) => setCreatePersistent(event.target.checked)}
                className="h-4 w-4 rounded border border-[var(--agyn-border-subtle)] accent-[var(--agyn-blue)]"
                data-testid="organization-volumes-create-persistent"
              />
              Persistent
            </label>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="organization-volumes-create-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreate}
              disabled={createVolumeMutation.isPending}
              data-testid="organization-volumes-create-submit"
            >
              {createVolumeMutation.isPending ? 'Adding...' : 'Add volume'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={editOpen} onOpenChange={handleEditOpenChange}>
        <DialogContent data-testid="organization-volumes-edit-dialog">
          <DialogHeader>
            <DialogTitle data-testid="organization-volumes-edit-title">Edit volume</DialogTitle>
            <DialogDescription data-testid="organization-volumes-edit-description">
              Update volume settings for this organization.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              label="Description"
              value={editDescription}
              onChange={(event) => setEditDescription(event.target.value)}
              data-testid="organization-volumes-edit-description-input"
            />
            <Input
              label="Mount Path"
              value={editMountPath}
              onChange={(event) => {
                setEditMountPath(event.target.value);
                if (editMountError) setEditMountError('');
              }}
              error={editMountError}
              data-testid="organization-volumes-edit-mount"
            />
            <Input
              label="Size"
              placeholder="10Gi"
              value={editSize}
              onChange={(event) => {
                setEditSize(event.target.value);
                if (editSizeError) setEditSizeError('');
              }}
              error={editSizeError}
              data-testid="organization-volumes-edit-size"
            />
            <label className="flex items-center gap-2 text-sm text-[var(--agyn-dark)]">
              <input
                type="checkbox"
                checked={editPersistent}
                onChange={(event) => setEditPersistent(event.target.checked)}
                className="h-4 w-4 rounded border border-[var(--agyn-border-subtle)] accent-[var(--agyn-blue)]"
                data-testid="organization-volumes-edit-persistent"
              />
              Persistent
            </label>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="organization-volumes-edit-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="primary"
              size="sm"
              onClick={handleEditSave}
              disabled={updateVolumeMutation.isPending}
              data-testid="organization-volumes-edit-submit"
            >
              {updateVolumeMutation.isPending ? 'Saving...' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(deleteTargetId)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTargetId(null);
          }
        }}
        title="Delete volume"
        description="This will permanently remove the volume."
        confirmLabel="Delete volume"
        variant="danger"
        onConfirm={() => {
          if (deleteTargetId) {
            deleteVolumeMutation.mutate(deleteTargetId);
          }
        }}
        isPending={deleteVolumeMutation.isPending}
      />
    </div>
  );
}
