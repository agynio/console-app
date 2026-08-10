import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type PrivateResourceAccess } from '@/gen/agynio/api/networks/v1/networks_pb';
import { principalValue, type PrincipalOption } from '@/hooks/usePrincipalOptions';
import { formatPrincipalType } from '@/lib/networks';

type GrantDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: PrincipalOption[];
  existingGrants: PrivateResourceAccess[];
  onSubmit: (option: PrincipalOption) => void;
  isSubmitting: boolean;
};

export function GrantDialog({
  open,
  onOpenChange,
  options,
  existingGrants,
  onSubmit,
  isSubmitting,
}: GrantDialogProps) {
  const [selectedValue, setSelectedValue] = useState('');

  const grantedKeys = useMemo(
    () => new Set(existingGrants.map((grant) => principalValue({ type: grant.principalType, id: grant.principalId }))),
    [existingGrants],
  );
  const selectableOptions = options.filter((option) => !grantedKeys.has(principalValue(option)));
  const selectedOption = selectableOptions.find((option) => principalValue(option) === selectedValue);


  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setSelectedValue('');
    }
  };


  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="grant-dialog">
        <DialogHeader>
          <DialogTitle>Add resource access</DialogTitle>
          <DialogDescription>Grant this private resource to an agent, environment, user, app, or group.</DialogDescription>
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
