import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { runnersClient } from '@/api/client';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
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
import { createLabelEntry, entriesToLabels, labelsToEntries, type LabelEntry } from '@/lib/labels';
import { toast } from 'sonner';

export function RunnerDetailPage() {
  const { id } = useParams();
  const runnerId = id ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [labelEntries, setLabelEntries] = useState<LabelEntry[]>([]);

  const runnerQuery = useQuery({
    queryKey: ['runners', runnerId],
    queryFn: () => runnersClient.getRunner({ id: runnerId }),
    enabled: Boolean(runnerId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const runner = runnerQuery.data?.runner;

  const updateRunnerMutation = useMutation({
    mutationFn: (labels: Record<string, string>) => runnersClient.updateRunner({ id: runnerId, labels }),
    onSuccess: () => {
      toast.success('Runner updated.');
      void queryClient.invalidateQueries({ queryKey: ['runners', runnerId] });
      void queryClient.invalidateQueries({ queryKey: ['runners', 'list'] });
      if (runner?.organizationId) {
        void queryClient.invalidateQueries({ queryKey: ['runners', runner.organizationId, 'list'] });
      }
      setEditOpen(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update runner.');
    },
  });

  const deleteRunnerMutation = useMutation({
    mutationFn: () => runnersClient.deleteRunner({ id: runnerId }),
    onSuccess: () => {
      toast.success('Runner deleted.');
      void queryClient.invalidateQueries({ queryKey: ['runners', 'list'] });
      if (runner?.organizationId) {
        void queryClient.invalidateQueries({ queryKey: ['runners', runner.organizationId, 'list'] });
        navigate(`/organizations/${runner.organizationId}/runners`);
      } else {
        navigate('/runners');
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete runner.');
    },
  });

  const handleEditOpenChange = (open: boolean) => {
    if (open) {
      const entries = labelsToEntries(runner?.labels ?? {});
      setLabelEntries(entries.length ? entries : [createLabelEntry()]);
      setEditOpen(true);
      return;
    }
    setEditOpen(false);
    setLabelEntries([]);
  };

  const handleSaveLabels = () => {
    updateRunnerMutation.mutate(entriesToLabels(labelEntries));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-[var(--agyn-dark)]" data-testid="runner-heading">
            Runner
          </h2>
          <p className="text-sm text-[var(--agyn-gray)]">Runner status and metadata.</p>
        </div>
        {runner ? (
          <div className="flex flex-wrap items-center gap-2" data-testid="runner-actions">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleEditOpenChange(true)}
              data-testid="runner-edit-labels"
            >
              Edit labels
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              data-testid="runner-delete"
            >
              Delete runner
            </Button>
          </div>
        ) : null}
      </div>
      {runnerQuery.isPending ? (
        <div className="text-sm text-[var(--agyn-gray)]">Loading runner...</div>
      ) : null}
      {runnerQuery.isError ? (
        <div className="text-sm text-[var(--agyn-gray)]">Failed to load runner.</div>
      ) : null}
      {runner ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="runner-details-card">
          <CardContent className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-[var(--agyn-dark)]">Details</h3>
              <p className="text-sm text-[var(--agyn-gray)]">Runner configuration and scope.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-[var(--agyn-gray)]">Name</div>
                <div className="text-sm text-[var(--agyn-dark)]">{runner.name}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-[var(--agyn-gray)]">Runner ID</div>
                <div className="text-sm text-[var(--agyn-dark)]">{runner.meta?.id}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-[var(--agyn-gray)]">Status</div>
                <Badge variant="secondary" data-testid="runner-status">
                  {formatRunnerStatus(runner.status)}
                </Badge>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-[var(--agyn-gray)]">Scope</div>
                <div className="text-sm text-[var(--agyn-dark)]">
                  {runner.organizationId ? `Organization ${runner.organizationId}` : 'Cluster'}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-[var(--agyn-gray)]">Identity ID</div>
                <div className="text-sm text-[var(--agyn-dark)]">{runner.identityId}</div>
              </div>
              <div className="md:col-span-2">
                <div className="text-xs uppercase tracking-wide text-[var(--agyn-gray)]">Labels</div>
                <div className="text-sm text-[var(--agyn-dark)]">{formatLabelPairs(runner.labels)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <Dialog open={editOpen} onOpenChange={handleEditOpenChange}>
        <DialogContent data-testid="runner-edit-dialog">
          <DialogHeader>
            <DialogTitle data-testid="runner-edit-title">Edit runner labels</DialogTitle>
            <DialogDescription data-testid="runner-edit-description">
              Update label key-value pairs for this runner.
            </DialogDescription>
          </DialogHeader>
          <LabelsEditor value={labelEntries} onChange={setLabelEntries} testIdPrefix="runner-edit" />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="runner-edit-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveLabels}
              disabled={updateRunnerMutation.isPending}
              data-testid="runner-edit-submit"
            >
              {updateRunnerMutation.isPending ? 'Saving...' : 'Save labels'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete runner"
        description="This action permanently removes the runner."
        confirmLabel="Delete runner"
        variant="danger"
        onConfirm={() => deleteRunnerMutation.mutate()}
        isPending={deleteRunnerMutation.isPending}
      />
    </div>
  );
}
