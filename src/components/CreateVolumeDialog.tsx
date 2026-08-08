import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { agentsClient, runnersClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  runnerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

// The sentinel for "name no class", which resolves to the runner's default at
// provisioning time. Select cannot carry an empty string as a value.
const DEFAULT_STORAGE_CLASS = '__default__';

/**
 * Size is what makes a volume persistent. The resource makes the two
 * biconditional, so there is no separate toggle here to contradict it — given a
 * size the volume is a disk that survives workload stops, omitted it is
 * ephemeral scratch discarded with the workload.
 */
export function CreateVolumeDialog({
  environmentId,
  runnerId,
  open,
  onOpenChange,
}: CreateVolumeDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [mountPath, setMountPath] = useState('');
  const [size, setSize] = useState('');
  const [storageClass, setStorageClass] = useState(DEFAULT_STORAGE_CLASS);
  const [ttl, setTtl] = useState('');
  const [errors, setErrors] = useState<{ name?: string; mountPath?: string }>({});

  const resetState = () => {
    setName('');
    setMountPath('');
    setSize('');
    setStorageClass(DEFAULT_STORAGE_CLASS);
    setTtl('');
    setErrors({});
  };

  // Storage classes are reported by the runner, not managed through platform
  // APIs, so the catalog of the runner this environment lands on is the only
  // set that can resolve. Only fetched while the dialog is open.
  const { data: storageClassData } = useQuery({
    queryKey: ['runner-storage-classes', runnerId],
    queryFn: () => runnersClient.listStorageClasses({ runnerId, pageSize: 200 }),
    enabled: open && Boolean(runnerId),
  });
  const storageClasses = storageClassData?.storageClasses ?? [];
  const defaultClass = storageClasses.find((entry) => entry.default);

  const createVolume = useMutation({
    mutationFn: () => {
      const trimmedSize = size.trim();
      return agentsClient.createVolume({
        target: { case: 'environmentId', value: environmentId },
        name: name.trim(),
        mountPath: mountPath.trim(),
        size: trimmedSize,
        persistent: trimmedSize !== '',
        storageClass: storageClass === DEFAULT_STORAGE_CLASS ? undefined : storageClass,
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
            <Select value={storageClass} onValueChange={setStorageClass}>
              <SelectTrigger id="volume-storage-class" data-testid="create-volume-storage-class">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_STORAGE_CLASS}>
                  {defaultClass ? `Runner default (${defaultClass.name})` : "The runner's default"}
                </SelectItem>
                {storageClasses
                  .filter((entry) => !entry.default)
                  .map((entry) => (
                    <SelectItem key={entry.name} value={entry.name}>
                      {entry.name}
                      {entry.deprecated ? ' — deprecated' : ''}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {/* Reported by the runner rather than managed here, and resolved
                  when the disk is provisioned -- so an empty catalog is a
                  runner that has not reported one, not an error. */}
              {storageClasses.length === 0
                ? "This runner has reported no storage classes; the volume uses whatever default it provisions with."
                : 'Reported by the runner this environment lands on.'}
            </p>
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
