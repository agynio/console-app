import { useEffect, useState } from 'react';
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

/** The fields of an existing volume this dialog edits. */
export type EditableVolume = {
  id: string;
  name: string;
  mountPath: string;
  persistent: boolean;
  size: string;
  storageClass: string;
  ttl: string;
};

type CreateVolumeDialogProps = {
  environmentId: string;
  runnerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editing an existing volume rather than declaring a new one. */
  volume?: EditableVolume;
};

// The sentinel for "name no class", which resolves to the runner's default at
// provisioning time. Select cannot carry an empty string as a value.
const DEFAULT_STORAGE_CLASS = '__default__';

const PERSISTENT = 'persistent';
const EPHEMERAL = 'ephemeral';

/**
 * Persistence is chosen here rather than inferred from whether a size was
 * typed: the consequence is that a workload's files survive it stopping or do
 * not, which is too large to leave as a side effect of an empty field.
 *
 * The resource still makes size and persistence biconditional, so a size is
 * required for a persistent volume and carried by nothing else.
 */
export function CreateVolumeDialog({
  environmentId,
  runnerId,
  open,
  onOpenChange,
  volume,
}: CreateVolumeDialogProps) {
  const queryClient = useQueryClient();
  const editing = volume !== undefined;
  const [name, setName] = useState('');
  const [mountPath, setMountPath] = useState('');
  const [persistence, setPersistence] = useState(EPHEMERAL);
  const [size, setSize] = useState('');
  const [storageClass, setStorageClass] = useState(DEFAULT_STORAGE_CLASS);
  const [ttl, setTtl] = useState('');
  const [errors, setErrors] = useState<{ name?: string; mountPath?: string; size?: string }>({});

  const resetState = () => {
    setName('');
    setMountPath('');
    setPersistence(EPHEMERAL);
    setSize('');
    setStorageClass(DEFAULT_STORAGE_CLASS);
    setTtl('');
    setErrors({});
  };

  // Seeded when the dialog opens rather than on every render, so a field being
  // edited is not overwritten by the value it started from.
  useEffect(() => {
    if (!open) return;
    if (volume) {
      setName(volume.name);
      setMountPath(volume.mountPath);
      setPersistence(volume.persistent ? PERSISTENT : EPHEMERAL);
      setSize(volume.size);
      setStorageClass(volume.storageClass || DEFAULT_STORAGE_CLASS);
      setTtl(volume.ttl);
      setErrors({});
      return;
    }
    resetState();
  }, [open, volume]);

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

  const persistent = persistence === PERSISTENT;

  const saveVolume = useMutation({
    mutationFn: async (): Promise<void> => {
      // An ephemeral volume carries no size: sending one would be a number that
      // provisions nothing.
      const resolvedSize = persistent ? size.trim() : '';
      const resolvedClass = storageClass === DEFAULT_STORAGE_CLASS ? '' : storageClass;
      if (volume) {
        await agentsClient.updateVolume({
          id: volume.id,
          name: name.trim(),
          mountPath: mountPath.trim(),
          size: resolvedSize,
          persistent,
          storageClass: resolvedClass,
          ttl: ttl.trim(),
        });
        return;
      }
      await agentsClient.createVolume({
        target: { case: 'environmentId', value: environmentId },
        name: name.trim(),
        mountPath: mountPath.trim(),
        size: resolvedSize,
        persistent,
        storageClass: resolvedClass || undefined,
        ttl: ttl.trim() || undefined,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['environment-volumes', environmentId] });
      toast.success(editing ? 'Volume updated.' : 'Volume added.');
      onOpenChange(false);
      resetState();
    },
    onError: (error) => {
      const fallback = editing ? 'Failed to update the volume.' : 'Failed to add the volume.';
      toast.error(error instanceof Error ? error.message : fallback);
    },
  });

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetState();
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = () => {
    const nextErrors: { name?: string; mountPath?: string; size?: string } = {};
    if (!name.trim()) {
      nextErrors.name = 'Name is required.';
    }
    const trimmedPath = mountPath.trim();
    if (!trimmedPath) {
      nextErrors.mountPath = 'Mount path is required.';
    } else if (!trimmedPath.startsWith('/')) {
      nextErrors.mountPath = 'Mount path must be absolute.';
    }
    if (persistent && !size.trim()) {
      nextErrors.size = 'A persistent volume needs a size.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    saveVolume.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="create-volume-dialog">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit volume' : 'Add a volume'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Changes apply to workloads started from here on; disks already provisioned keep the shape they were created with.'
              : 'Every workload in this environment mounts it. One disk is provisioned per owner — per agent instance, per sandbox — from this one definition.'}
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
            {errors.mountPath ? (
              <p className="text-sm text-destructive">{errors.mountPath}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="volume-persistence">Persistence</Label>
            <Select value={persistence} onValueChange={setPersistence}>
              <SelectTrigger id="volume-persistence" data-testid="create-volume-persistence">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EPHEMERAL}>Ephemeral</SelectItem>
                <SelectItem value={PERSISTENT}>Persistent</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {persistent
                ? 'The disk survives workloads stopping.'
                : 'Scratch space, discarded when the workload stops.'}
            </p>
          </div>

          {persistent ? (
            <div className="space-y-2">
              <Label htmlFor="volume-size">Size</Label>
              <Input
                id="volume-size"
                value={size}
                onChange={(event) => setSize(event.target.value)}
                placeholder="10Gi"
                data-testid="create-volume-size"
              />
              {errors.size ? <p className="text-sm text-destructive">{errors.size}</p> : null}
            </div>
          ) : null}

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
              placeholder="720h"
              data-testid="create-volume-ttl"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saveVolume.isPending}
            data-testid="create-volume-submit"
          >
            {editing ? 'Save' : 'Add volume'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
