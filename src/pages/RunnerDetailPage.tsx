import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { runnersClient } from '@/api/client';
import { SortableHeader } from '@/components/SortableHeader';
import { LoadMoreButton } from '@/components/LoadMoreButton';
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
import { WorkloadStatus } from '@/gen/agynio/api/runners/v1/runners_pb';
import { useListControls } from '@/hooks/useListControls';
import { useNotifications } from '@/hooks/useNotifications';
import {
  formatLabelPairs,
  formatRunnerStatus,
  formatTimestamp,
  formatWorkloadStatus,
  summarizeContainers,
  timestampToMillis,
} from '@/lib/format';
import { createLabelEntry, entriesToLabels, labelsToEntries, type LabelEntry } from '@/lib/labels';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

export function RunnerDetailPage() {
  const { id } = useParams();
  const runnerId = id ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [labelEntries, setLabelEntries] = useState<LabelEntry[]>([]);

  useNotifications({
    events: ['workload.status_changed'],
    invalidateKeys: [['workloads', 'runner', runnerId]],
    enabled: Boolean(runnerId),
  });

  const runnerQuery = useQuery({
    queryKey: ['runners', runnerId],
    queryFn: () => runnersClient.getRunner({ id: runnerId }),
    enabled: Boolean(runnerId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const runner = runnerQuery.data?.runner;

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
  const listControls = useListControls({
    items: workloads,
    searchFields: [
      (workload) => workload.agentId,
      (workload) => workload.runnerId,
      (workload) => workload.threadId,
      (workload) => formatWorkloadStatus(workload.status),
    ],
    sortOptions: {
      agentId: (workload) => workload.agentId,
      threadId: (workload) => workload.threadId,
      status: (workload) => formatWorkloadStatus(workload.status),
      started: (workload) => timestampToMillis(workload.meta?.createdAt),
    },
    defaultSortKey: 'started',
    defaultSortDirection: 'desc',
  });

  const visibleWorkloads = listControls.filteredItems;
  const hasSearch = listControls.searchTerm.trim().length > 0;

  const getStatusVariant = (status: WorkloadStatus) => {
    if (status === WorkloadStatus.RUNNING) return 'default';
    if (status === WorkloadStatus.STARTING || status === WorkloadStatus.STOPPING) return 'secondary';
    if (status === WorkloadStatus.STOPPED) return 'outline';
    if (status === WorkloadStatus.FAILED) return 'destructive';
    return 'outline';
  };

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
          <h2 className="text-2xl font-semibold text-foreground" data-testid="runner-heading">
            Runner
          </h2>
          <p className="text-sm text-muted-foreground">Runner status and metadata.</p>
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
        <div className="max-w-sm">
          <Input
            placeholder="Search workloads..."
            value={listControls.searchTerm}
            onChange={(event) => listControls.setSearchTerm(event.target.value)}
            data-testid="runner-workloads-search"
          />
        </div>
        {workloadsQuery.isPending ? <div className="text-sm text-muted-foreground">Loading workloads...</div> : null}
        {workloadsQuery.isError ? <div className="text-sm text-muted-foreground">Failed to load workloads.</div> : null}
        <Card className="border-border" data-testid="runner-workloads-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[1.6fr_1.6fr_140px_200px_170px]"
              data-testid="runner-workloads-header"
            >
              <SortableHeader
                label="Agent ID"
                sortKey="agentId"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Thread ID"
                sortKey="threadId"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Status"
                sortKey="status"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <span>Containers</span>
              <SortableHeader
                label="Started"
                sortKey="started"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
            </div>
            <div className="divide-y divide-border">
              {visibleWorkloads.length === 0 ? (
                <div className="px-6 py-6 text-sm text-muted-foreground" data-testid="runner-workloads-empty">
                  {hasSearch ? 'No results found.' : 'No workloads on this runner.'}
                </div>
              ) : (
                visibleWorkloads.map((workload) => {
                  const rowKey = workload.meta?.id || `${workload.threadId}:${workload.agentId}`;
                  return (
                    <div
                      key={rowKey}
                      className="grid items-center gap-2 px-6 py-4 text-sm text-foreground md:grid-cols-[1.6fr_1.6fr_140px_200px_170px]"
                      data-testid="runner-workloads-row"
                    >
                      <span className="text-xs text-muted-foreground" data-testid="runner-workloads-agent">
                        {workload.agentId || '—'}
                      </span>
                      <span className="text-xs text-muted-foreground" data-testid="runner-workloads-thread">
                        {workload.threadId || '—'}
                      </span>
                      <Badge variant={getStatusVariant(workload.status)} data-testid="runner-workloads-status">
                        {formatWorkloadStatus(workload.status)}
                      </Badge>
                      <span className="text-xs text-muted-foreground" data-testid="runner-workloads-containers">
                        {summarizeContainers(workload.containers)}
                      </span>
                      <span className="text-xs text-muted-foreground" data-testid="runner-workloads-started">
                        {formatTimestamp(workload.meta?.createdAt)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
        <LoadMoreButton
          hasMore={Boolean(workloadsQuery.hasNextPage)}
          isLoading={workloadsQuery.isFetchingNextPage}
          onClick={() => {
            void workloadsQuery.fetchNextPage();
          }}
        />
      </div>
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
