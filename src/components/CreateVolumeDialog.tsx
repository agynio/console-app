import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { agentsClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type CreateVolumeDialogProps = {
  environmentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Size is what makes a volume persistent. The resource makes the two
 * biconditional, so there is no separate toggle here to contradict it — given a
 * size the volume is a disk that survives workload stops, omitted it is
 * ephemeral scratch discarded with the workload.
 */
export function CreateVolumeDialog({ environmentId, open, onOpenChange }: CreateVolumeDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [mountPath, setMountPath] = useState('');
  const [size, setSize] = useState('');
  const [storageClass, setStorageClass] = useState('');
  const [ttl, setTtl] = useState('');
  const [errors, setErrors] = useState<{ name?: string; mountPath?: string }>({});

  const resetState = () => {
    setName('');
    setMountPath('');
    setSize('');
    setStorageClass('');
    setTtl('');
    setErrors({});
  };

  const createVolume = useMutation({
    mutationFn: () => {
      const trimmedSize = size.trim();
      return agentsClient.createVolume({
        target: { case: 'environmentId', value: environmentId },
        name: name.trim(),
        mountPath: mountPath.trim(),
        size: trimmedSize,
        persistent: trimmedSize !== '',
        storageClass: storageClass.trim() || undefined,
        ttl: ttl.trim() || undefined,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['environment-volumes', environmentId] });
      toast.success('Volume added.');
      onOpenChange(false);
      resetState();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to add the volume.');
    },
  });

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetState();
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = () => {
    const nextErrors: { name?: string; mountPath?: string } = {};
    if (!name.trim()) {
      nextErrors.name = 'Name is required.';
    }
    const trimmedPath = mountPath.trim();
    if (!trimmedPath) {
      nextErrors.mountPath = 'Mount path is required.';
    } else if (!trimmedPath.startsWith('/')) {
      nextErrors.mountPath = 'Mount path must be absolute.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    createVolume.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="create-volume-dialog">
        <DialogHeader>
          <DialogTitle>Add a volume</DialogTitle>
          <DialogDescription>
            Every workload in this environment mounts it. One disk is provisioned per owner — per
            agent instance, per sandbox — from this one definition.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="volume-name">Name</Label>
            <Input
              id="volume-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="workspace"
              data-testid="create-volume-name"
            />
            {errors.name ? <p className="text-sm text-destructive">{errors.name}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="volume-mount-path">Mount path</Label>
            <Input
              id="volume-mount-path"
              value={mountPath}
              onChange={(event) => setMountPath(event.target.value)}
              placeholder="/workspace"
              data-testid="create-volume-mount-path"
            />
            {errors.mountPath ? <p className="text-sm text-destructive">{errors.mountPath}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="volume-size">Size</Label>
            <Input
              id="volume-size"
              value={size}
              onChange={(event) => setSize(event.target.value)}
              placeholder="10Gi"
              data-testid="create-volume-size"
            />
            <p className="text-sm text-muted-foreground">
              {size.trim()
                ? 'Persistent: the disk survives workloads stopping.'
                : 'Left empty the volume is ephemeral — discarded when the workload stops.'}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="volume-storage-class">Storage class</Label>
            <Input
              id="volume-storage-class"
              value={storageClass}
              onChange={(event) => setStorageClass(event.target.value)}
              placeholder="Optional — the runner's default when empty"
              data-testid="create-volume-storage-class"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="volume-ttl">TTL</Label>
            <Input
              id="volume-ttl"
              value={ttl}
              onChange={(event) => setTtl(event.target.value)}
              placeholder="Optional — e.g. 720h"
              data-testid="create-volume-ttl"
            />
            <p className="text-sm text-muted-foreground">
              Deletes an owner's disk this long after its last workload stops.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createVolume.isPending}
            data-testid="create-volume-submit"
          >
            {createVolume.isPending ? 'Adding…' : 'Add volume'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
