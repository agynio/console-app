import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usersClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

type CreateDeviceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CreateDeviceDialog({ open, onOpenChange }: CreateDeviceDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [enrollmentJwt, setEnrollmentJwt] = useState('');

  const createDeviceMutation = useMutation({
    mutationFn: (payload: { name: string }) => usersClient.createDevice(payload),
    onSuccess: (response) => {
      setEnrollmentJwt(response.enrollmentJwt);
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
      toast.success('Device created.');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create device.');
    },
  });

  const resetState = () => {
    setName('');
    setNameError('');
    setEnrollmentJwt('');
  };

  const closeDialog = () => {
    onOpenChange(false);
    resetState();
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && enrollmentJwt) return;
    if (!nextOpen) {
      resetState();
    }
    onOpenChange(nextOpen);
  };

  const handleCreateDevice = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError('Name is required.');
      return;
    }
    setNameError('');
    createDeviceMutation.mutate({ name: trimmedName });
  };

  const handleCopyJwt = async () => {
    try {
      await navigator.clipboard.writeText(enrollmentJwt);
      toast.success('JWT copied to clipboard.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to copy JWT.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="devices-create-dialog">
        <DialogHeader>
          <DialogTitle data-testid="devices-create-title">Add device</DialogTitle>
          <DialogDescription data-testid="devices-create-description">
            Register a device for OpenZiti network access.
          </DialogDescription>
        </DialogHeader>
        {enrollmentJwt ? (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-foreground" data-testid="devices-jwt-label">
                Enrollment JWT
              </div>
              <div
                className="mt-2 rounded-md border border-border bg-muted p-3 text-xs font-mono text-foreground break-all"
                data-testid="devices-jwt-value"
              >
                {enrollmentJwt}
              </div>
            </div>
            <p className="text-xs text-muted-foreground" data-testid="devices-jwt-warning">
              This JWT will not be shown again.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleCopyJwt} data-testid="devices-jwt-copy">
                Copy JWT
              </Button>
              <Button size="sm" onClick={closeDialog} data-testid="devices-jwt-done">
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="devices-name">Name</Label>
              <Input
                id="devices-name"
                placeholder="Laptop"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (nameError) setNameError('');
                }}
                data-testid="devices-name"
              />
              {nameError && <p className="text-sm text-destructive">{nameError}</p>}
            </div>
          </div>
        )}
        {enrollmentJwt ? null : (
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="devices-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={handleCreateDevice}
              disabled={createDeviceMutation.isPending}
              data-testid="devices-submit"
            >
              {createDeviceMutation.isPending ? 'Adding...' : 'Add device'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
