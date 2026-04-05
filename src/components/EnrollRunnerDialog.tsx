import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { runnersClient } from '@/api/client';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { LabelsEditor } from '@/components/LabelsEditor';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createLabelEntry, entriesToLabels, type LabelEntry } from '@/lib/labels';
import { toast } from 'sonner';

type EnrollRunnerDialogTestIds = {
  dialog: string;
  title: string;
  description: string;
  nameInput: string;
  labelsHeading: string;
  labelsPrefix: string;
  cancel: string;
  submit: string;
  tokenLabel: string;
  tokenValue: string;
  tokenWarning: string;
  tokenCopy: string;
  tokenDone: string;
};

type EnrollRunnerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId?: string;
  description: string;
  namePlaceholder: string;
  testIds: EnrollRunnerDialogTestIds;
};

export function EnrollRunnerDialog({
  open,
  onOpenChange,
  organizationId,
  description,
  namePlaceholder,
  testIds,
}: EnrollRunnerDialogProps) {
  const queryClient = useQueryClient();
  const [runnerName, setRunnerName] = useState('');
  const [runnerNameError, setRunnerNameError] = useState('');
  const [labelEntries, setLabelEntries] = useState<LabelEntry[]>([createLabelEntry()]);
  const [serviceToken, setServiceToken] = useState('');

  const registerRunnerMutation = useMutation({
    mutationFn: (payload: { name: string; labels: Record<string, string> }) =>
      runnersClient.registerRunner(
        organizationId ? { ...payload, organizationId } : payload,
      ),
    onSuccess: (response) => {
      setServiceToken(response.serviceToken);
      if (organizationId) {
        void queryClient.invalidateQueries({ queryKey: ['runners', organizationId] });
      } else {
        void queryClient.invalidateQueries({ queryKey: ['runners', 'list'] });
      }
      toast.success('Runner enrolled.');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to enroll runner.');
    },
  });

  const resetState = () => {
    setRunnerName('');
    setRunnerNameError('');
    setLabelEntries([createLabelEntry()]);
    setServiceToken('');
  };

  const closeDialog = () => {
    onOpenChange(false);
    resetState();
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && serviceToken) return;
    if (!nextOpen) {
      resetState();
    }
    onOpenChange(nextOpen);
  };

  const handleEnrollRunner = () => {
    const trimmedName = runnerName.trim();
    if (!trimmedName) {
      setRunnerNameError('Runner name is required.');
      return;
    }
    setRunnerNameError('');
    registerRunnerMutation.mutate({ name: trimmedName, labels: entriesToLabels(labelEntries) });
  };

  const handleCopyToken = async () => {
    try {
      await navigator.clipboard.writeText(serviceToken);
      toast.success('Token copied to clipboard.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to copy token.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid={testIds.dialog}>
        <DialogHeader>
          <DialogTitle data-testid={testIds.title}>Enroll runner</DialogTitle>
          <DialogDescription data-testid={testIds.description}>{description}</DialogDescription>
        </DialogHeader>
        {serviceToken ? (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-[var(--agyn-dark)]" data-testid={testIds.tokenLabel}>
                Service token
              </div>
              <div
                className="mt-2 rounded-md border border-[var(--agyn-border-subtle)] bg-[var(--agyn-secondary)] p-3 text-xs font-mono text-[var(--agyn-dark)] break-all"
                data-testid={testIds.tokenValue}
              >
                {serviceToken}
              </div>
            </div>
            <p className="text-xs text-[var(--agyn-gray)]" data-testid={testIds.tokenWarning}>
              This token will not be shown again.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleCopyToken} data-testid={testIds.tokenCopy}>
                Copy token
              </Button>
              <Button variant="primary" size="sm" onClick={closeDialog} data-testid={testIds.tokenDone}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Input
              label="Runner Name"
              placeholder={namePlaceholder}
              value={runnerName}
              onChange={(event) => {
                setRunnerName(event.target.value);
                if (runnerNameError) setRunnerNameError('');
              }}
              error={runnerNameError}
              data-testid={testIds.nameInput}
            />
            <div className="space-y-2">
              <div className="text-sm font-medium text-[var(--agyn-dark)]" data-testid={testIds.labelsHeading}>
                Labels
              </div>
              <LabelsEditor value={labelEntries} onChange={setLabelEntries} testIdPrefix={testIds.labelsPrefix} />
            </div>
          </div>
        )}
        {serviceToken ? null : (
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid={testIds.cancel}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="primary"
              size="sm"
              onClick={handleEnrollRunner}
              disabled={registerRunnerMutation.isPending}
              data-testid={testIds.submit}
            >
              {registerRunnerMutation.isPending ? 'Enrolling...' : 'Enroll runner'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
