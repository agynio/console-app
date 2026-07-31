import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { groupsClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GroupSource } from '@/gen/agynio/api/groups/v1/groups_pb';
import {
  PrivateResourceAccessPrincipalType,
  type PrivateResourceAccess,
} from '@/gen/agynio/api/networks/v1/networks_pb';
import { principalValue, type PrincipalOption } from '@/hooks/usePrincipalOptions';
import { formatPrincipalType } from '@/lib/networks';

type GrantDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: PrincipalOption[];
  existingGrants: PrivateResourceAccess[];
  onSubmit: (option: PrincipalOption) => void;
  isSubmitting: boolean;
  organizationId: string;
};

export function GrantDialog({
  open,
  onOpenChange,
  options,
  existingGrants,
  onSubmit,
  isSubmitting,
  organizationId,
}: GrantDialogProps) {
  const queryClient = useQueryClient();
  const [selectedValue, setSelectedValue] = useState('');
  const [inlineGroupName, setInlineGroupName] = useState('');
  const [inlineGroupError, setInlineGroupError] = useState('');

  const grantedKeys = useMemo(
    () => new Set(existingGrants.map((grant) => principalValue({ type: grant.principalType, id: grant.principalId }))),
    [existingGrants],
  );
  const selectableOptions = options.filter((option) => !grantedKeys.has(principalValue(option)));
  const selectedOption = selectableOptions.find((option) => principalValue(option) === selectedValue);

  const createGroupMutation = useMutation({
    mutationFn: (name: string) => groupsClient.createGroup({ organizationId, name, description: '', source: GroupSource.PLATFORM }),
    onSuccess: (response) => {
      const group = response.group;
      const groupId = group?.meta?.id;
      if (!group || !groupId) return;
      toast.success('Group created.');
      void queryClient.invalidateQueries({ queryKey: ['groups', organizationId] });
      onSubmit({
        type: PrivateResourceAccessPrincipalType.GROUP,
        id: groupId,
        label: group.name,
        description: group.description || groupId,
      });
      setInlineGroupName('');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to create group.'),
  });

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setSelectedValue('');
      setInlineGroupName('');
      setInlineGroupError('');
    }
  };

  const createInlineGroup = () => {
    const name = inlineGroupName.trim();
    if (!/^[a-z0-9_-]{1,64}$/.test(name)) {
      setInlineGroupError('Use 1-64 lowercase letters, numbers, underscores, or hyphens.');
      return;
    }
    createGroupMutation.mutate(name);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="grant-dialog">
        <DialogHeader>
          <DialogTitle>Add resource access</DialogTitle>
          <DialogDescription>Grant this private resource to an agent, user, app, or group principal.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Principal</Label>
            <Select value={selectedValue} onValueChange={setSelectedValue}>
              <SelectTrigger className="w-full" data-testid="grant-principal-select"><SelectValue placeholder="Select a principal" /></SelectTrigger>
              <SelectContent>
                {selectableOptions.length === 0 ? (
                  <SelectItem value="__none" disabled>No principals available</SelectItem>
                ) : (
                  selectableOptions.map((option) => (
                    <SelectItem key={principalValue(option)} value={principalValue(option)}>
                      {option.label} ({formatPrincipalType(option.type)})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {selectedOption ? <p className="text-xs text-muted-foreground">{selectedOption.description}</p> : null}
          </div>
          <div className="rounded-md border border-border p-3">
            <Label htmlFor="inline-group-name">Create group inline</Label>
            <div className="mt-2 flex gap-2">
              <Input
                id="inline-group-name"
                value={inlineGroupName}
                onChange={(event) => {
                  setInlineGroupName(event.target.value);
                  setInlineGroupError('');
                }}
                placeholder="engineering"
                data-testid="grant-inline-group-name"
              />
              <Button variant="outline" onClick={createInlineGroup} disabled={createGroupMutation.isPending}>
                Create and grant
              </Button>
            </div>
            {inlineGroupError ? <p className="mt-2 text-xs text-destructive">{inlineGroupError}</p> : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          <Button onClick={() => selectedOption && onSubmit(selectedOption)} disabled={!selectedOption || isSubmitting} data-testid="grant-submit">
            {isSubmitting ? 'Granting...' : 'Grant access'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
