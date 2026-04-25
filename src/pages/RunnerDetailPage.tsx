import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { runnersClient } from '@/api/client';
import { WorkloadsTable } from '@/components/WorkloadsTable';
import { Button } from '@/components/ui/button';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import { formatLabelPairs, formatRunnerStatus } from '@/lib/format';
import { createLabelEntry, entriesToLabels, labelsToEntries, type LabelEntry } from '@/lib/labels';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

export function RunnerDetailPage() {
  const { id: organizationIdParam, runnerId: runnerIdParam } = useParams();
  const isOrgContext = Boolean(organizationIdParam);
  const organizationId = isOrgContext ? organizationIdParam ?? '' : '';
  const runnerId = runnerIdParam ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [labelEntries, setLabelEntries] = useState<LabelEntry[]>([]);
  const [runnerName, setRunnerName] = useState('');
  const [runnerNameError, setRunnerNameError] = useState('');

  const runnerQuery = useQuery({
    queryKey: ['runners', runnerId],
    queryFn: () => runnersClient.getRunner({ id: runnerId }),
    enabled: Boolean(runnerId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const runner = runnerQuery.data?.runner;
  const notificationRooms = useMemo(() => {
    const rooms = new Set<string>();
    if (organizationId) rooms.add(`organization:${organizationId}`);
    if (runner?.organizationId) rooms.add(`organization:${runner.organizationId}`);
    return Array.from(rooms);
  }, [organizationId, runner?.organizationId]);

  useNotifications({
    events: ['workload.updated'],
    invalidateKeys: [['workloads', 'runner', runnerId]],
    rooms: notificationRooms,
    enabled: Boolean(runnerId) && notificationRooms.length > 0,
  });
  const isOrgRunner = Boolean(organizationId) && runner?.organizationId === organizationId;
  const canManageRunner = !isOrgContext || isOrgRunner;

  useDocumentTitle(runner?.name ?? 'Runner');

  const workloadsQuery = useInfiniteQuery({
    queryKey: ['workloads', 'runner', runnerId],
    queryFn: ({ pageParam }) =>
      runnersClient.listWorkloads({
        runnerId,
        pageSize: DEFAULT_PAGE_SIZE,
        pageToken: pageParam,
        statuses: [],
      }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
    enabled: Boolean(runnerId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const workloads = workloadsQuery.data?.pages.flatMap((page) => page.workloads) ?? [];

  const updateRunnerMutation = useMutation({
    mutationFn: (payload: { name: string; labels: Record<string, string> }) =>
      runnersClient.updateRunner({ id: runnerId, ...payload }),
    onSuccess: () => {
      toast.success('Runner updated.');
      void queryClient.invalidateQueries({ queryKey: ['runners', runnerId] });
      void queryClient.invalidateQueries({ queryKey: ['runners', 'list'] });
      if (runner?.organizationId) {
        void queryClient.invalidateQueries({ queryKey: ['runners', runner.organizationId, 'list'] });
      }
      handleEditOpenChange(false);
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

  const resetEditState = () => {
    setLabelEntries([]);
    setRunnerName('');
    setRunnerNameError('');
  };

  const handleEditOpenChange = (open: boolean) => {
    if (open) {
      const entries = labelsToEntries(runner?.labels ?? {});
      setLabelEntries(entries.length ? entries : [createLabelEntry()]);
      setRunnerName(runner?.name ?? '');
      setRunnerNameError('');
      setEditOpen(true);
      return;
    }
    setEditOpen(false);
    resetEditState();
  };

  const handleSaveRunner = () => {
    const trimmedName = runnerName.trim();
    if (!trimmedName) {
      setRunnerNameError('Runner name is required.');
      return;
    }
    setRunnerNameError('');
    updateRunnerMutation.mutate({ name: trimmedName, labels: entriesToLabels(labelEntries) });
  };

  const deleteDescription = runner?.organizationId
    ? 'This action permanently removes the organization runner. This cannot be undone.'
    : 'This action permanently removes the cluster runner. This cannot be undone.';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-3">
        {runner && canManageRunner ? (
          <div className="flex flex-wrap items-center gap-2" data-testid="runner-actions">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleEditOpenChange(true)}
              data-testid="runner-edit-labels"
            >
              Edit runner
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              data-testid="runner-delete"
            >
              Delete runner
            </Button>
          </div>
        ) : null}
      </div>
      {runnerQuery.isPending ? <div className="text-sm text-muted-foreground">Loading runner...</div> : null}
      {runnerQuery.isError ? <div className="text-sm text-muted-foreground">Failed to load runner.</div> : null}
      {runner ? (
        <Card className="border-border" data-testid="runner-details-card">
          <CardContent className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Details</h3>
              <p className="text-sm text-muted-foreground">Runner configuration and scope.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Name</div>
                <div className="text-sm text-foreground">{runner.name}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Runner ID</div>
                <div className="text-sm text-foreground">{runner.meta?.id}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Status</div>
                <Badge variant="secondary" data-testid="runner-status">
                  {formatRunnerStatus(runner.status)}
                </Badge>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Scope</div>
                <div className="text-sm text-foreground">
                  {runner.organizationId ? `Organization ${runner.organizationId}` : 'Cluster'}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Identity ID</div>
                <div className="text-sm text-foreground">{runner.identityId}</div>
              </div>
              <div className="md:col-span-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Labels</div>
                <div className="text-sm text-foreground">{formatLabelPairs(runner.labels)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <div className="space-y-4" data-testid="runner-workloads-section">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Workloads</h3>
          <p className="text-sm text-muted-foreground">Active workloads on this runner.</p>
        </div>
        <WorkloadsTable
          workloads={workloads}
          query={workloadsQuery}
          getWorkloadLink={(workload) => {
            const workloadId = workload.meta?.id;
            if (!workloadId) return null;
            if (organizationId) {
              return `/organizations/${organizationId}/workloads/${workloadId}`;
            }
            return `/workloads/${workloadId}`;
          }}
          testIdPrefix="runner-workloads"
        />
      </div>
      <Dialog open={editOpen} onOpenChange={handleEditOpenChange}>
        <DialogContent data-testid="runner-edit-dialog">
          <DialogHeader>
            <DialogTitle data-testid="runner-edit-title">Edit runner</DialogTitle>
            <DialogDescription data-testid="runner-edit-description">
              Update the runner name and labels.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="runner-edit-name">Runner Name</Label>
              <Input
                id="runner-edit-name"
                value={runnerName}
                onChange={(event) => {
                  setRunnerName(event.target.value);
                  if (runnerNameError) setRunnerNameError('');
                }}
                disabled={updateRunnerMutation.isPending}
                data-testid="runner-edit-name"
              />
              {runnerNameError ? <p className="text-sm text-destructive">{runnerNameError}</p> : null}
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">Labels</div>
              <LabelsEditor
                value={labelEntries}
                onChange={setLabelEntries}
                disabled={updateRunnerMutation.isPending}
                testIdPrefix="runner-edit"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="runner-edit-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={handleSaveRunner}
              disabled={updateRunnerMutation.isPending}
              data-testid="runner-edit-submit"
            >
              {updateRunnerMutation.isPending ? 'Saving...' : 'Save runner'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete runner"
        description={deleteDescription}
        confirmLabel="Delete runner"
        variant="danger"
        onConfirm={() => deleteRunnerMutation.mutate()}
        isPending={deleteRunnerMutation.isPending}
      />
    </div>
  );
}
