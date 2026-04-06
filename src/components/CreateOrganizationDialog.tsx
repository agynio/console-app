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

type CreateOrganizationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationName: string;
  organizationNameError: string;
  onOrganizationNameChange: (value: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  testIdPrefix: string;
};

export function CreateOrganizationDialog({
  open,
  onOpenChange,
  organizationName,
  organizationNameError,
  onOrganizationNameChange,
  onSubmit,
  isSubmitting,
  testIdPrefix,
}: CreateOrganizationDialogProps) {
  const testId = (suffix: string) => `${testIdPrefix}-${suffix}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={testId('dialog')}>
        <DialogHeader>
          <DialogTitle data-testid={testId('title')}>Create organization</DialogTitle>
          <DialogDescription data-testid={testId('description')}>Set the organization name.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={testId('name')}>Organization Name</Label>
            <Input
              id={testId('name')}
              placeholder="Acme AI"
              value={organizationName}
              onChange={(event) => onOrganizationNameChange(event.target.value)}
              data-testid={testId('name')}
            />
            {organizationNameError && (
              <p className="text-sm text-destructive">{organizationNameError}</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm" data-testid={testId('cancel')}>
              Cancel
            </Button>
          </DialogClose>
          <Button size="sm" onClick={onSubmit} disabled={isSubmitting} data-testid={testId('submit')}>
            {isSubmitting ? 'Creating...' : 'Create organization'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
