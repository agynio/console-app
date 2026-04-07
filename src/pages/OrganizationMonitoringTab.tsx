import { useParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { runnersClient } from '@/api/client';
import { SortableHeader } from '@/components/SortableHeader';
import { LoadMoreButton } from '@/components/LoadMoreButton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { WorkloadStatus } from '@/gen/agynio/api/runners/v1/runners_pb';
import { useListControls } from '@/hooks/useListControls';
import { useNotifications } from '@/hooks/useNotifications';
import { formatTimestamp, formatWorkloadStatus, summarizeContainers, timestampToMillis } from '@/lib/format';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';

export function OrganizationMonitoringTab() {
  const { id } = useParams();
  const organizationId = id ?? '';

  useNotifications({
    events: ['workload.status_changed'],
    invalidateKeys: [['workloads', organizationId, 'list']],
    enabled: Boolean(organizationId),
  });

  const workloadsQuery = useInfiniteQuery({
    queryKey: ['workloads', organizationId, 'list'],
    queryFn: ({ pageParam }) =>
      runnersClient.listWorkloads({
        organizationId,
        pageSize: DEFAULT_PAGE_SIZE,
        pageToken: pageParam,
        statuses: [],
      }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
    enabled: Boolean(organizationId),
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
      runnerId: (workload) => workload.runnerId,
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

  const stubSections = [
    {
      id: 'storage',
      title: 'Storage',
      description: 'Surface persistent volume usage and health.',
      stub: 'Storage monitoring is pending architectural design for PVC state tracking.',
    },
    {
      id: 'usage-metrics',
      title: 'Usage Metrics',
      description: 'View usage-based metrics for billing and trends.',
      stub: 'Usage metrics require a dedicated metering service (pending design).',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground" data-testid="organization-monitoring-heading">
          Monitoring
        </h3>
        <p className="text-sm text-muted-foreground">Observability for organization workloads.</p>
      </div>
      <div className="space-y-6">
        <div className="space-y-3" data-testid="organization-monitoring-active-workloads">
          <div>
            <h4 className="text-base font-semibold text-foreground">Active Workloads</h4>
            <p className="text-sm text-muted-foreground">Track running workloads deployed for this organization.</p>
          </div>
          <div className="max-w-sm">
            <Input
              placeholder="Search workloads..."
              value={listControls.searchTerm}
              onChange={(event) => listControls.setSearchTerm(event.target.value)}
              data-testid="organization-workloads-search"
            />
          </div>
          {workloadsQuery.isPending ? (
            <div className="text-sm text-muted-foreground">Loading workloads...</div>
          ) : null}
          {workloadsQuery.isError ? (
            <div className="text-sm text-muted-foreground">Failed to load workloads.</div>
          ) : null}
          <Card className="border-border" data-testid="organization-workloads-table">
            <CardContent className="px-0">
              <div
                className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[1.4fr_1.4fr_1.4fr_140px_200px_170px]"
                data-testid="organization-workloads-header"
              >
                <SortableHeader
                  label="Agent ID"
                  sortKey="agentId"
                  activeSortKey={listControls.sortKey}
                  sortDirection={listControls.sortDirection}
                  onSort={listControls.handleSort}
                />
                <SortableHeader
                  label="Runner ID"
                  sortKey="runnerId"
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
                  <div className="px-6 py-6 text-sm text-muted-foreground" data-testid="organization-workloads-empty">
                    {hasSearch ? 'No results found.' : 'No workloads found.'}
                  </div>
                ) : (
                  visibleWorkloads.map((workload) => {
                    const rowKey = workload.meta?.id || `${workload.runnerId}:${workload.threadId}:${workload.agentId}`;
                    return (
                      <div
                        key={rowKey}
                        className="grid items-center gap-2 px-6 py-4 text-sm text-foreground md:grid-cols-[1.4fr_1.4fr_1.4fr_140px_200px_170px]"
                        data-testid="organization-workloads-row"
                      >
                        <span className="text-xs text-muted-foreground" data-testid="organization-workloads-agent">
                          {workload.agentId || '—'}
                        </span>
                        <span className="text-xs text-muted-foreground" data-testid="organization-workloads-runner">
                          {workload.runnerId || '—'}
                        </span>
                        <span className="text-xs text-muted-foreground" data-testid="organization-workloads-thread">
                          {workload.threadId || '—'}
                        </span>
                        <Badge variant={getStatusVariant(workload.status)} data-testid="organization-workloads-status">
                          {formatWorkloadStatus(workload.status)}
                        </Badge>
                        <span className="text-xs text-muted-foreground" data-testid="organization-workloads-containers">
                          {summarizeContainers(workload.containers)}
                        </span>
                        <span className="text-xs text-muted-foreground" data-testid="organization-workloads-started">
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
        {stubSections.map((section) => (
          <div key={section.id} className="space-y-3" data-testid={`organization-monitoring-${section.id}`}>
            <div>
              <h4 className="text-base font-semibold text-foreground">{section.title}</h4>
              <p className="text-sm text-muted-foreground">{section.description}</p>
            </div>
            <Card className="border-border">
              <CardContent className="py-6 text-sm text-muted-foreground">{section.stub}</CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}
