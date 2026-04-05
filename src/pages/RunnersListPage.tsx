import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { runnersClient } from '@/api/client';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { LabelsEditor } from '@/components/LabelsEditor';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatLabelPairs, formatRunnerStatus } from '@/lib/format';
import { createLabelEntry, entriesToLabels, type LabelEntry } from '@/lib/labels';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

export function RunnersListPage() {
  const queryClient = useQueryClient();
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [runnerName, setRunnerName] = useState('');
  const [runnerNameError, setRunnerNameError] = useState('');
  const [labelEntries, setLabelEntries] = useState<LabelEntry[]>([createLabelEntry()]);
  const [serviceToken, setServiceToken] = useState('');

  const runnersQuery = useQuery({
    queryKey: ['runners', 'list'],
    queryFn: () => runnersClient.listRunners({ pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const registerRunnerMutation = useMutation({
    mutationFn: (payload: { name: string; labels: Record<string, string> }) =>
      runnersClient.registerRunner(payload),
    onSuccess: (response) => {
      setServiceToken(response.serviceToken);
      void queryClient.invalidateQueries({ queryKey: ['runners', 'list'] });
      toast.success('Runner enrolled.');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to enroll runner.');
    },
  });

  const resetEnrollState = () => {
    setRunnerName('');
    setRunnerNameError('');
    setLabelEntries([createLabelEntry()]);
    setServiceToken('');
  };

  const closeEnrollDialog = () => {
    setEnrollOpen(false);
    resetEnrollState();
  };

  const handleEnrollOpenChange = (open: boolean) => {
    if (!open && serviceToken) return;
    if (open) {
      setEnrollOpen(true);
      return;
    }
    closeEnrollDialog();
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

  const runners = (runnersQuery.data?.runners ?? []).filter((runner) => !runner.organizationId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-[var(--agyn-dark)]" data-testid="runners-heading">
            Cluster Runners
          </h2>
          <p className="text-sm text-[var(--agyn-gray)]">Runners enrolled at the cluster level.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          data-testid="runners-enroll-button"
          onClick={() => setEnrollOpen(true)}
        >
          Enroll runner
        </Button>
      </div>
      {runnersQuery.isPending ? (
        <div className="text-sm text-[var(--agyn-gray)]">Loading runners...</div>
      ) : null}
      {runnersQuery.isError ? (
        <div className="text-sm text-[var(--agyn-gray)]">Failed to load runners.</div>
      ) : null}
      <Card className="border-[var(--agyn-border-subtle)]" data-testid="runners-table">
        <CardContent className="px-0">
          <div
            className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-[var(--agyn-gray)] md:grid-cols-[2fr_1fr_2fr_120px]"
            data-testid="runners-header"
          >
            <span>Runner</span>
            <span>Status</span>
            <span>Labels</span>
            <span className="text-right">Action</span>
          </div>
          <div className="divide-y divide-[var(--agyn-border-subtle)]">
            {runners.length === 0 ? (
              <div className="px-6 py-6 text-sm text-[var(--agyn-gray)]">No cluster runners yet.</div>
            ) : (
              runners.map((runner) => (
                <div
                  key={runner.meta?.id ?? runner.name}
                  className="grid items-center gap-2 px-6 py-4 text-sm text-[var(--agyn-dark)] md:grid-cols-[2fr_1fr_2fr_120px]"
                  data-testid="runners-row"
                >
                  <div>
                    <div className="font-medium" data-testid="runners-name">
                      {runner.name}
                    </div>
                    <div className="text-xs text-[var(--agyn-gray)]" data-testid="runners-id">
                      {runner.meta?.id}
                    </div>
                  </div>
                  <Badge variant="secondary" data-testid="runners-status">
                    {formatRunnerStatus(runner.status)}
                  </Badge>
                  <span className="text-xs text-[var(--agyn-gray)]" data-testid="runners-labels">
                    {formatLabelPairs(runner.labels)}
                  </span>
                  <div className="text-right">
                    <Button variant="outline" size="sm" asChild>
                      <NavLink to={`/runners/${runner.meta?.id ?? ''}`} data-testid="runners-view">
                        View
                      </NavLink>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
      <Dialog open={enrollOpen} onOpenChange={handleEnrollOpenChange}>
        <DialogContent data-testid="runners-enroll-dialog">
          <DialogHeader>
            <DialogTitle data-testid="runners-enroll-title">Enroll runner</DialogTitle>
            <DialogDescription data-testid="runners-enroll-description">
              Register a new cluster runner and copy its enrollment token.
            </DialogDescription>
          </DialogHeader>
          {serviceToken ? (
            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium text-[var(--agyn-dark)]" data-testid="runners-token-label">
                  Service token
                </div>
                <div
                  className="mt-2 rounded-md border border-[var(--agyn-border-subtle)] bg-[var(--agyn-secondary)] p-3 text-xs font-mono text-[var(--agyn-dark)] break-all"
                  data-testid="runners-token-value"
                >
                  {serviceToken}
                </div>
              </div>
              <p className="text-xs text-[var(--agyn-gray)]" data-testid="runners-token-warning">
                This token will not be shown again.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleCopyToken} data-testid="runners-token-copy">
                  Copy token
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={closeEnrollDialog}
                  data-testid="runners-token-done"
                >
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Input
                label="Runner Name"
                placeholder="edge-runner-1"
                value={runnerName}
                onChange={(event) => {
                  setRunnerName(event.target.value);
                  if (runnerNameError) setRunnerNameError('');
                }}
                error={runnerNameError}
                data-testid="runners-enroll-name"
              />
              <div className="space-y-2">
                <div className="text-sm font-medium text-[var(--agyn-dark)]" data-testid="runners-enroll-labels">
                  Labels
                </div>
                <LabelsEditor value={labelEntries} onChange={setLabelEntries} testIdPrefix="runners-enroll" />
              </div>
            </div>
          )}
          {serviceToken ? null : (
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" size="sm" data-testid="runners-enroll-cancel">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                variant="primary"
                size="sm"
                onClick={handleEnrollRunner}
                disabled={registerRunnerMutation.isPending}
                data-testid="runners-enroll-submit"
              >
                {registerRunnerMutation.isPending ? 'Enrolling...' : 'Enroll runner'}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
