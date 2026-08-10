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
import { copyText } from '@/lib/clipboard';
import { downloadTextFile } from '@/lib/download';
import { toast } from 'sonner';

type CreateDeviceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type IssuedDevice = { id: string; jwt: string };

export function CreateDeviceDialog({ open, onOpenChange }: CreateDeviceDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [issued, setIssued] = useState<IssuedDevice | null>(null);

  const createDeviceMutation = useMutation({
    mutationFn: (payload: { name: string }) => usersClient.createDevice(payload),
    onSuccess: (response) => {
      setIssued({ id: response.device?.meta?.id ?? '', jwt: response.enrollmentJwt });
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
    setIssued(null);
  };

  const closeDialog = () => {
    onOpenChange(false);
    resetState();
  };

  // A shown-once JWT leaves on an explicit Done, not on a stray click outside.
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && issued) return;
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

  const handleDownloadJwt = () => {
    if (!issued) return;
    downloadTextFile(issued.jwt, issued.id ? `device-${issued.id}.jwt` : 'device.jwt');
    toast.success('Enrollment JWT downloaded.');
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={issued ? 'sm:max-w-2xl' : undefined}
        showCloseButton={!issued}
        data-testid="devices-create-dialog"
      >
        <DialogHeader>
          <DialogTitle data-testid="devices-create-title">{issued ? 'Enrollment JWT' : 'Add device'}</DialogTitle>
          <DialogDescription data-testid="devices-create-description">
            {issued
              ? 'Shown once — copy or download it before closing.'
              : 'Register a device for OpenZiti network access.'}
          </DialogDescription>
        </DialogHeader>
        {issued ? (
          <div className="space-y-4">
            <pre
              className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-muted p-3 font-mono text-xs text-foreground"
              data-testid="devices-jwt-value"
            >
              {issued.jwt}
            </pre>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyText(issued.jwt, 'Enrollment JWT copied.')}
                data-testid="devices-jwt-copy"
              >
                Copy JWT
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownloadJwt} data-testid="devices-jwt-download">
                Download .jwt
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
        {issued ? null : (
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
