import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import { SortableHeader } from '@/components/SortableHeader';
import { LoadMoreButton } from '@/components/LoadMoreButton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { ListWorkloadsResponse, Workload } from '@/gen/agynio/api/runners/v1/runners_pb';
import { WorkloadStatus } from '@/gen/agynio/api/runners/v1/runners_pb';
import { useListControls } from '@/hooks/useListControls';
import { formatTimestamp, formatWorkloadStatus, summarizeContainers, timestampToMillis } from '@/lib/format';

type WorkloadsTableProps = {
  workloads: Workload[];
  query: UseInfiniteQueryResult<InfiniteData<ListWorkloadsResponse, unknown>, Error>;
  showRunnerColumn?: boolean;
  testIdPrefix: string;
};

export function WorkloadsTable({
  workloads,
  query,
  showRunnerColumn = false,
  testIdPrefix,
}: WorkloadsTableProps) {
  const searchFields = [
    (workload: Workload) => workload.agentId,
    ...(showRunnerColumn ? [(workload: Workload) => workload.runnerId] : []),
    (workload: Workload) => workload.threadId,
    (workload: Workload) => formatWorkloadStatus(workload.status),
  ];

  const sortOptions: Record<string, (workload: Workload) => string | number> = {
    agentId: (workload) => workload.agentId,
    threadId: (workload) => workload.threadId,
    status: (workload) => formatWorkloadStatus(workload.status),
    started: (workload) => timestampToMillis(workload.meta?.createdAt),
  };

  if (showRunnerColumn) {
    sortOptions.runnerId = (workload) => workload.runnerId;
  }

  const listControls = useListControls({
    items: workloads,
    searchFields,
    sortOptions,
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

  const gridClass = showRunnerColumn
    ? 'md:grid-cols-[1.4fr_1.4fr_1.4fr_140px_200px_170px]'
    : 'md:grid-cols-[1.6fr_1.6fr_140px_200px_170px]';

  const emptyMessage = showRunnerColumn ? 'No workloads found.' : 'No workloads on this runner.';

  return (
    <div className="space-y-4">
      <div className="max-w-sm">
        <Input
          placeholder="Search workloads..."
          value={listControls.searchTerm}
          onChange={(event) => listControls.setSearchTerm(event.target.value)}
          data-testid={`${testIdPrefix}-search`}
        />
      </div>
      {query.isPending ? <div className="text-sm text-muted-foreground">Loading workloads...</div> : null}
      {query.isError ? <div className="text-sm text-muted-foreground">Failed to load workloads.</div> : null}
      <Card className="border-border" data-testid={`${testIdPrefix}-table`}>
        <CardContent className="px-0">
          <div
            className={`grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground ${gridClass}`}
            data-testid={`${testIdPrefix}-header`}
          >
            <SortableHeader
              label="Agent ID"
              sortKey="agentId"
              activeSortKey={listControls.sortKey}
              sortDirection={listControls.sortDirection}
              onSort={listControls.handleSort}
            />
            {showRunnerColumn ? (
              <SortableHeader
                label="Runner ID"
                sortKey="runnerId"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
            ) : null}
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
              <div className="px-6 py-6 text-sm text-muted-foreground" data-testid={`${testIdPrefix}-empty`}>
                {hasSearch ? 'No results found.' : emptyMessage}
              </div>
            ) : (
              visibleWorkloads.map((workload) => {
                const rowKey =
                  workload.meta?.id ??
                  (showRunnerColumn
                    ? `${workload.runnerId}:${workload.threadId}:${workload.agentId}`
                    : `${workload.threadId}:${workload.agentId}`);
                return (
                  <div
                    key={rowKey}
                    className={`grid items-center gap-2 px-6 py-4 text-sm text-foreground ${gridClass}`}
                    data-testid={`${testIdPrefix}-row`}
                  >
                    <span className="text-xs text-muted-foreground" data-testid={`${testIdPrefix}-agent`}>
                      {workload.agentId || '—'}
                    </span>
                    {showRunnerColumn ? (
                      <span className="text-xs text-muted-foreground" data-testid={`${testIdPrefix}-runner`}>
                        {workload.runnerId || '—'}
                      </span>
                    ) : null}
                    <span className="text-xs text-muted-foreground" data-testid={`${testIdPrefix}-thread`}>
                      {workload.threadId || '—'}
                    </span>
                    <Badge variant={getStatusVariant(workload.status)} data-testid={`${testIdPrefix}-status`}>
                      {formatWorkloadStatus(workload.status)}
                    </Badge>
                    <span className="text-xs text-muted-foreground" data-testid={`${testIdPrefix}-containers`}>
                      {summarizeContainers(workload.containers)}
                    </span>
                    <span className="text-xs text-muted-foreground" data-testid={`${testIdPrefix}-started`}>
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
        hasMore={Boolean(query.hasNextPage)}
        isLoading={query.isFetchingNextPage}
        onClick={() => {
          void query.fetchNextPage();
        }}
      />
    </div>
  );
}
