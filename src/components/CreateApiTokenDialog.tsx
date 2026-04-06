import { useState } from 'react';
import { create } from '@bufbuild/protobuf';
import { TimestampSchema, type Timestamp } from '@bufbuild/protobuf/wkt';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

type CreateApiTokenDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type ExpirationOption = '30' | '60' | '90' | '365' | 'never';

const expirationOptions: Array<{ value: ExpirationOption; label: string; days?: number }> = [
  { value: '30', label: '30 days', days: 30 },
  { value: '60', label: '60 days', days: 60 },
  { value: '90', label: '90 days', days: 90 },
  { value: '365', label: '1 year', days: 365 },
  { value: 'never', label: 'Never' },
];

function futureTimestamp(days: number): Timestamp {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return create(TimestampSchema, { seconds: BigInt(Math.floor(date.getTime() / 1000)), nanos: 0 });
}

export function CreateApiTokenDialog({ open, onOpenChange }: CreateApiTokenDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [expiresOption, setExpiresOption] = useState<ExpirationOption>('never');
  const [plaintextToken, setPlaintextToken] = useState('');

  const createTokenMutation = useMutation({
    mutationFn: (payload: { name: string; expiresAt?: Timestamp }) => usersClient.createAPIToken(payload),
    onSuccess: (response) => {
      setPlaintextToken(response.plaintextToken);
      void queryClient.invalidateQueries({ queryKey: ['api-tokens'] });
      toast.success('API token created.');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create API token.');
    },
  });

  const resetState = () => {
    setName('');
    setNameError('');
    setExpiresOption('never');
    setPlaintextToken('');
  };

  const closeDialog = () => {
    onOpenChange(false);
    resetState();
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && plaintextToken) return;
    if (!nextOpen) resetState();
    onOpenChange(nextOpen);
  };

  const handleCreateToken = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError('Name is required.');
      return;
    }
    setNameError('');
    const expiration = expirationOptions.find((option) => option.value === expiresOption);
    const expiresAt = expiration?.days ? futureTimestamp(expiration.days) : undefined;
    createTokenMutation.mutate({ name: trimmedName, expiresAt });
  };

  const handleCopyToken = async () => {
    try {
      await navigator.clipboard.writeText(plaintextToken);
      toast.success('Token copied to clipboard.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to copy token.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="api-tokens-create-dialog">
        <DialogHeader>
          <DialogTitle data-testid="api-tokens-create-title">Create API token</DialogTitle>
          <DialogDescription data-testid="api-tokens-create-description">
            Issue a new token for programmatic API access.
          </DialogDescription>
        </DialogHeader>
        {plaintextToken ? (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-foreground" data-testid="api-token-token-label">
                API token
              </div>
              <div
                className="mt-2 rounded-md border border-border bg-muted p-3 text-xs font-mono text-foreground break-all"
                data-testid="api-token-token-value"
              >
                {plaintextToken}
              </div>
            </div>
            <p className="text-xs text-muted-foreground" data-testid="api-token-token-warning">
              This token will not be shown again.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleCopyToken} data-testid="api-token-copy">
                Copy token
              </Button>
              <Button size="sm" onClick={closeDialog} data-testid="api-token-done">
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="api-token-name">Name</Label>
              <Input
                id="api-token-name"
                placeholder="Automation token"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (nameError) setNameError('');
                }}
                data-testid="api-token-name"
              />
              {nameError && <p className="text-sm text-destructive">{nameError}</p>}
            </div>
            <div className="space-y-2">
              <div className="text-sm text-foreground">Expires</div>
              <Select value={expiresOption} onValueChange={(value) => setExpiresOption(value as ExpirationOption)}>
                <SelectTrigger data-testid="api-token-expires">
                  <SelectValue placeholder="Select expiration" />
                </SelectTrigger>
                <SelectContent>
                  {expirationOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        {plaintextToken ? null : (
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="api-token-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={handleCreateToken}
              disabled={createTokenMutation.isPending}
              data-testid="api-token-submit"
            >
              {createTokenMutation.isPending ? 'Creating...' : 'Create token'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
