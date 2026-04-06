import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
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
          <Input
            label="Organization Name"
            placeholder="Acme AI"
            value={organizationName}
            onChange={(event) => onOrganizationNameChange(event.target.value)}
            error={organizationNameError}
            data-testid={testId('name')}
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm" data-testid={testId('cancel')}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant="primary"
            size="sm"
            onClick={onSubmit}
            disabled={isSubmitting}
            data-testid={testId('submit')}
          >
            {isSubmitting ? 'Creating...' : 'Create organization'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
