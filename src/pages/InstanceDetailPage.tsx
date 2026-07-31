import { useMemo, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { agentsClient, runnersClient, threadsClient } from '@/api/client';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LoadMoreButton } from '@/components/LoadMoreButton';
import { WorkloadsTable } from '@/components/WorkloadsTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AgentInstanceState } from '@/gen/agynio/api/agents/v1/agents_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import {
  formatInstanceState,
  formatPauseReason,
  instanceStateVariant,
  MANUAL_PAUSE_REASON,
} from '@/lib/agentInstance';
import { EMPTY_PLACEHOLDER, formatDateOnly, formatThreadStatus, formatTimestamp, formatVolumeStatus, truncate } from '@/lib/format';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';

export function InstanceDetailPage() {
  const { id, instanceId: instanceIdParam } = useParams();
  const organizationId = id ?? '';
  const instanceId = instanceIdParam ?? '';
  const queryClient = useQueryClient();
  const [pauseOpen, setPauseOpen] = useState(false);

  const instancesBase = `/organizations/${organizationId}/instances`;

  const instanceQuery = useQuery({
    queryKey: ['instances', instanceId, 'detail'],
    queryFn: () => agentsClient.getInstance({ id: instanceId }),
    enabled: Boolean(instanceId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const instance = instanceQuery.data?.instance ?? null;
  useDocumentTitle(instance?.handle ? `Instance ${instance.handle}` : 'Instance');

  const inboxCountQuery = useQuery({
    queryKey: ['instances', instanceId, 'unacked-count'],
    queryFn: () => agentsClient.getUnackedInboxCount({ agentInstanceId: instanceId }),
    enabled: Boolean(instanceId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const invalidateInstance = () => {
    void queryClient.invalidateQueries({ queryKey: ['instances', instanceId, 'detail'] });
    void queryClient.invalidateQueries({ queryKey: ['instances', organizationId, 'list'] });
  };

  const pauseMutation = useMutation({
    mutationFn: () => agentsClient.pauseInstance({ id: instanceId, pauseReason: MANUAL_PAUSE_REASON }),
    onSuccess: () => {
      toast.success('Instance paused.');
      setPauseOpen(false);
      invalidateInstance();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to pause instance.'),
  });

  const resumeMutation = useMutation({
    mutationFn: () => agentsClient.resumeInstance({ id: instanceId }),
    onSuccess: () => {
      toast.success('Instance resumed.');
      invalidateInstance();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to resume instance.'),
  });

  if (instanceQuery.isPending) return <div className="text-sm text-muted-foreground">Loading instance...</div>;
  if (instanceQuery.isError || !instance) {
    return <div className="text-sm text-muted-foreground">Failed to load instance.</div>;
  }

  const isPaused = instance.state === AgentInstanceState.PAUSED;
  const isTerminated = instance.state === AgentInstanceState.TERMINATED;
  const classLabel = instance.nickname ? `@${instance.nickname}` : instance.agentId;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="link" asChild data-testid="instance-detail-back">
          <NavLink to={instancesBase}>← Back to Instances</NavLink>
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!isPaused || resumeMutation.isPending}
            onClick={() => resumeMutation.mutate()}
            data-testid="instance-detail-resume"
          >
            {resumeMutation.isPending ? 'Resuming...' : 'Resume'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isPaused || isTerminated}
            onClick={() => setPauseOpen(true)}
            data-testid="instance-detail-pause"
          >
            Pause
          </Button>
        </div>
      </div>
      <Card className="border-border" data-testid="instance-detail-card">
        <CardContent className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Details</h3>
            <p className="text-sm text-muted-foreground">Identity, lifecycle state, and inbox backlog.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Handle</div>
              <div className="text-sm text-foreground" data-testid="instance-detail-handle">
                {instance.handle || instance.suffix || EMPTY_PLACEHOLDER}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Instance ID</div>
              <div className="text-sm break-all text-foreground">{instance.meta?.id || EMPTY_PLACEHOLDER}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Class</div>
              <div className="text-sm text-foreground">
                {instance.agentId ? (
                  <NavLink
                    to={`/organizations/${organizationId}/agents/${instance.agentId}`}
                    className="hover:underline"
                    data-testid="instance-detail-class"
                  >
                    {classLabel}
                  </NavLink>
                ) : (
                  classLabel || EMPTY_PLACEHOLDER
                )}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">State</div>
              <Badge variant={instanceStateVariant(instance.state)} data-testid="instance-detail-state">
                {formatInstanceState(instance.state)}
              </Badge>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Pause reason</div>
              <div className="text-sm text-foreground" data-testid="instance-detail-pause-reason">
                {isPaused ? formatPauseReason(instance.pauseReason) : EMPTY_PLACEHOLDER}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Unacked inbox</div>
              <div className="text-sm text-foreground" data-testid="instance-detail-inbox">
                {typeof inboxCountQuery.data?.count === 'number'
                  ? inboxCountQuery.data.count.toLocaleString()
                  : EMPTY_PLACEHOLDER}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Last activity</div>
              <div className="text-sm text-foreground">{formatTimestamp(instance.lastActivityAt)}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Created</div>
              <div className="text-sm text-foreground">{formatTimestamp(instance.meta?.createdAt)}</div>
            </div>
          </div>
        </CardContent>
      </Card>
      <InstanceThreadsCard organizationId={organizationId} instanceId={instanceId} />
      <InstanceWorkloadsCard organizationId={organizationId} instanceId={instanceId} />
      <InstanceStorageCard organizationId={organizationId} instanceId={instanceId} />
      <ConfirmDialog
        open={pauseOpen}
        onOpenChange={setPauseOpen}
        title="Pause instance"
        description="The instance stops picking up work until it is resumed. Its threads, workloads, and storage are kept."
        confirmLabel="Pause instance"
        onConfirm={() => pauseMutation.mutate()}
        isPending={pauseMutation.isPending}
      />
    </div>
  );
}

function InstanceThreadsCard({ organizationId, instanceId }: { organizationId: string; instanceId: string }) {
  const threadsQuery = useInfiniteQuery({
    queryKey: ['threads', organizationId, 'by-instance', instanceId],
    queryFn: ({ pageParam }) =>
      threadsClient.listOrganizationThreads({
        organizationId,
        pageSize: DEFAULT_PAGE_SIZE,
        pageToken: pageParam,
        filter: { participantIdIn: [instanceId] },
      }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
    enabled: Boolean(organizationId) && Boolean(instanceId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const threads = useMemo(
    () => threadsQuery.data?.pages.flatMap((page) => page.threads) ?? [],
    [threadsQuery.data?.pages],
  );

  return (
    <Card className="border-border" data-testid="instance-threads-card">
      <CardHeader className="pb-0">
        <CardTitle>Threads</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Threads this instance participates in.</p>
        {threadsQuery.isPending ? <div className="text-sm text-muted-foreground">Loading threads...</div> : null}
        {threadsQuery.isError ? <div className="text-sm text-muted-foreground">Failed to load threads.</div> : null}
        {threads.length === 0 && !threadsQuery.isPending && !threadsQuery.isError ? (
          <div className="rounded-md border border-border p-6 text-center text-sm text-muted-foreground" data-testid="instance-threads-empty">
            No threads yet.
          </div>
        ) : null}
        {threads.length > 0 ? (
          <div className="divide-y divide-border rounded-md border border-border">
            {threads.map((thread) => (
              <NavLink
                key={thread.id}
                to={`/organizations/${organizationId}/threads/${thread.id}`}
                className="grid items-center gap-2 px-4 py-3 text-sm md:grid-cols-[2fr_1fr_1fr_1fr] hover:bg-muted"
                data-testid="instance-thread-row"
              >
                <div className="font-medium text-foreground">{truncate(thread.id, 18)}</div>
                <Badge variant="secondary" className="justify-self-start">
                  {formatThreadStatus(thread.status)}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {(thread.messageCount ?? 0).toLocaleString()} messages
                </span>
                <span className="text-xs text-muted-foreground">{formatDateOnly(thread.updatedAt)}</span>
              </NavLink>
            ))}
          </div>
        ) : null}
        <LoadMoreButton
          hasMore={threadsQuery.hasNextPage}
          isLoading={threadsQuery.isFetchingNextPage}
          onClick={() => {
            void threadsQuery.fetchNextPage();
          }}
        />
      </CardContent>
    </Card>
  );
}

function InstanceWorkloadsCard({ organizationId, instanceId }: { organizationId: string; instanceId: string }) {
  const workloadsQuery = useInfiniteQuery({
    queryKey: ['workloads', organizationId, 'by-instance', instanceId],
    queryFn: ({ pageParam }) =>
      runnersClient.listWorkloadsByAgentInstance({
        agentInstanceId: instanceId,
        pageSize: DEFAULT_PAGE_SIZE,
        pageToken: pageParam,
        statuses: [],
      }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
    enabled: Boolean(instanceId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const workloads = useMemo(
    () => workloadsQuery.data?.pages.flatMap((page) => page.workloads) ?? [],
    [workloadsQuery.data?.pages],
  );

  return (
    <Card className="border-border" data-testid="instance-workloads-card">
      <CardHeader className="pb-0">
        <CardTitle>Workloads</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Workloads started for this instance.</p>
        <WorkloadsTable
          workloads={workloads}
          query={workloadsQuery}
          showRunnerColumn
          showDuration
          showSearch={false}
          preserveApiOrder
          rowLinkMode="row"
          getWorkloadLink={(workload) => {
            const workloadId = workload.meta?.id;
            if (!workloadId) return null;
            return `/organizations/${organizationId}/workloads/${workloadId}`;
          }}
          getAgentLink={(workload) =>
            workload.agentId ? `/organizations/${organizationId}/agents/${workload.agentId}` : null
          }
          getRunnerLink={(workload) =>
            workload.runnerId ? `/organizations/${organizationId}/runners/${workload.runnerId}` : null
          }
          testIdPrefix="instance-workloads"
        />
      </CardContent>
    </Card>
  );
}

function InstanceStorageCard({ organizationId, instanceId }: { organizationId: string; instanceId: string }) {
  const volumesQuery = useInfiniteQuery({
    queryKey: ['volumes', organizationId, 'by-instance', instanceId],
    queryFn: ({ pageParam }) =>
      runnersClient.listVolumesByAgentInstance({
        agentInstanceId: instanceId,
        pageSize: DEFAULT_PAGE_SIZE,
        pageToken: pageParam,
        statuses: [],
      }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
    enabled: Boolean(instanceId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const volumes = useMemo(
    () => volumesQuery.data?.pages.flatMap((page) => page.volumes) ?? [],
    [volumesQuery.data?.pages],
  );

  return (
    <Card className="border-border" data-testid="instance-storage-card">
      <CardHeader className="pb-0">
        <CardTitle>Storage</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Volumes provisioned for this instance.</p>
        {volumesQuery.isPending ? <div className="text-sm text-muted-foreground">Loading storage...</div> : null}
        {volumesQuery.isError ? <div className="text-sm text-muted-foreground">Failed to load storage.</div> : null}
        {volumes.length === 0 && !volumesQuery.isPending && !volumesQuery.isError ? (
          <div className="rounded-md border border-border p-6 text-center text-sm text-muted-foreground" data-testid="instance-storage-empty">
            No storage provisioned.
          </div>
        ) : null}
        {volumes.length > 0 ? (
          <div className="divide-y divide-border rounded-md border border-border">
            {volumes.map((volume) => {
              const volumeId = volume.meta?.id;
              const label = volume.volumeName || volume.volumeId || volumeId || EMPTY_PLACEHOLDER;
              return (
                <div
                  key={volumeId ?? label}
                  className="grid items-center gap-2 px-4 py-3 text-sm md:grid-cols-[2fr_1fr_1fr_1fr]"
                  data-testid="instance-storage-row"
                >
                  <div className="font-medium text-foreground">
                    {volumeId ? (
                      <NavLink
                        to={`/organizations/${organizationId}/volumes/${volumeId}`}
                        className="text-primary hover:underline"
                      >
                        {label}
                      </NavLink>
                    ) : (
                      label
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{formatVolumeStatus(volume.status)}</span>
                  <span className="text-xs text-muted-foreground">
                    {volume.sizeGb ? `${volume.sizeGb} GB` : EMPTY_PLACEHOLDER}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDateOnly(volume.meta?.createdAt)}</span>
                </div>
              );
            })}
          </div>
        ) : null}
        <LoadMoreButton
          hasMore={volumesQuery.hasNextPage}
          isLoading={volumesQuery.isFetchingNextPage}
          onClick={() => {
            void volumesQuery.fetchNextPage();
          }}
        />
      </CardContent>
    </Card>
  );
}
