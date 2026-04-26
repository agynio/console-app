import type { ReactNode } from 'react';
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { SortableHeader } from '@/components/SortableHeader';
import { LoadMoreButton } from '@/components/LoadMoreButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { ListWorkloadsResponse, Workload } from '@/gen/agynio/api/runners/v1/runners_pb';
import { WorkloadStatus } from '@/gen/agynio/api/runners/v1/runners_pb';
import { type SortDirection, useListControls } from '@/hooks/useListControls';
import {
  EMPTY_PLACEHOLDER,
  formatDurationBetween,
  formatTimestamp,
  formatWorkloadStatus,
  summarizeContainers,
  timestampToMillis,
} from '@/lib/format';

export type WorkloadSortKey = 'agentId' | 'runnerId' | 'threadId' | 'status' | 'started' | 'duration';

type WorkloadsTableControls = {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  sortKey: WorkloadSortKey;
  sortDirection: SortDirection;
  onSort: (key: WorkloadSortKey) => void;
};

type WorkloadsTableProps = {
  workloads: Workload[];
  query: UseInfiniteQueryResult<InfiniteData<ListWorkloadsResponse, unknown>, Error>;
  showRunnerColumn?: boolean;
  showDuration?: boolean;
  showSearch?: boolean;
  getWorkloadLink?: (workload: Workload) => string | null;
  getAgentName?: (workload: Workload) => string | undefined;
  getRunnerName?: (workload: Workload) => string | undefined;
  getAgentLink?: (workload: Workload) => string | null;
  getRunnerLink?: (workload: Workload) => string | null;
  agentLabel?: string;
  runnerLabel?: string;
  rowLinkMode?: 'row' | 'action';
  actionLabel?: string;
  controls?: WorkloadsTableControls;
  filterBar?: ReactNode;
  searchPlaceholder?: string;
  hasActiveFilters?: boolean;
  testIdPrefix: string;
};

export function WorkloadsTable({
  workloads,
  query,
  showRunnerColumn = false,
  showDuration = false,
  showSearch = true,
  getWorkloadLink,
  getAgentName,
  getRunnerName,
  getAgentLink,
  getRunnerLink,
  agentLabel = 'Agent ID',
  runnerLabel = 'Runner ID',
  rowLinkMode = 'action',
  actionLabel,
  controls,
  filterBar,
  searchPlaceholder = 'Search workloads...',
  hasActiveFilters,
  testIdPrefix,
}: WorkloadsTableProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const resolveAgentName = (workload: Workload) => {
    const name = getAgentName ? getAgentName(workload) : workload.agentName;
    return name?.trim() || '';
  };
  const resolveRunnerName = (workload: Workload) => {
    const name = getRunnerName ? getRunnerName(workload) : workload.runnerName;
    return name?.trim() || '';
  };
  const resolveDurationEnd = (workload: Workload) =>
    workload.removedAt ??
    (workload.status === WorkloadStatus.STOPPED || workload.status === WorkloadStatus.FAILED
      ? workload.lastActivityAt
      : undefined);
  const resolveDurationMillis = (workload: Workload) => {
    const startMillis = timestampToMillis(workload.meta?.createdAt);
    if (!startMillis) return 0;
    const endTimestamp = resolveDurationEnd(workload);
    const endMillis = endTimestamp ? timestampToMillis(endTimestamp) : Date.now();
    return Math.max(0, endMillis - startMillis);
  };
  const searchFields = [
    (workload: Workload) => resolveAgentName(workload) || workload.agentId,
    ...(showRunnerColumn ? [(workload: Workload) => resolveRunnerName(workload) || workload.runnerId] : []),
    (workload: Workload) => workload.threadId,
    (workload: Workload) => formatWorkloadStatus(workload.status),
  ];

  const sortOptions: Record<string, (workload: Workload) => string | number> = {
    agentId: (workload) => workload.agentId,
    threadId: (workload) => workload.threadId,
    status: (workload) => formatWorkloadStatus(workload.status),
    started: (workload) => timestampToMillis(workload.meta?.createdAt),
    duration: (workload) => resolveDurationMillis(workload),
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

  const searchTerm = controls?.searchTerm ?? listControls.searchTerm;
  const handleSearchChange = controls?.onSearchTermChange ?? listControls.setSearchTerm;
  const sortKey = controls?.sortKey ?? (listControls.sortKey as WorkloadSortKey);
  const sortDirection = controls?.sortDirection ?? listControls.sortDirection;
  const handleSort = controls?.onSort ?? listControls.handleSort;

  const visibleWorkloads = controls ? workloads : listControls.filteredItems;
  const hasSearch = showSearch && searchTerm.trim().length > 0;
  const hasFilters = controls ? (hasActiveFilters ?? hasSearch) : hasSearch;
  const actionLabelText = actionLabel?.trim() || 'View';
  const hasAction = rowLinkMode === 'action' && Boolean(getWorkloadLink);

  const getStatusVariant = (status: WorkloadStatus) => {
    if (status === WorkloadStatus.RUNNING) return 'default';
    if (status === WorkloadStatus.STARTING || status === WorkloadStatus.STOPPING) return 'secondary';
    if (status === WorkloadStatus.STOPPED) return 'outline';
    if (status === WorkloadStatus.FAILED) return 'destructive';
    return 'outline';
  };

  const gridColumns: string[] = [];
  gridColumns.push(showRunnerColumn ? '1.4fr' : '1.6fr');
  if (showRunnerColumn) gridColumns.push('1.4fr');
  gridColumns.push(showRunnerColumn ? '1.4fr' : '1.6fr');
  gridColumns.push('140px');
  gridColumns.push('200px');
  gridColumns.push('170px');
  if (showDuration) gridColumns.push('140px');
  if (hasAction) {
    const actionWidth = actionLabelText.length > 6 ? '160px' : '120px';
    gridColumns.push(actionWidth);
  }
  const gridClass = `md:grid-cols-[${gridColumns.join('_')}]`;

  const emptyMessage = showRunnerColumn ? 'No workloads found.' : 'No workloads on this runner.';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {showSearch ? (
          <div className="min-w-[220px] max-w-sm flex-1">
            <Input
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={(event) => handleSearchChange(event.target.value)}
              data-testid={`${testIdPrefix}-search`}
            />
          </div>
        ) : null}
        {filterBar}
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
              label={agentLabel}
              sortKey="agentId"
              activeSortKey={sortKey}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
            {showRunnerColumn ? (
              <SortableHeader
                label={runnerLabel}
                sortKey="runnerId"
                activeSortKey={sortKey}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            ) : null}
            {controls ? (
              <span>Thread ID</span>
            ) : (
              <SortableHeader
                label="Thread ID"
                sortKey="threadId"
                activeSortKey={sortKey}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            )}
            <SortableHeader
              label="Status"
              sortKey="status"
              activeSortKey={sortKey}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
            <span>Containers</span>
            <SortableHeader
              label="Started"
              sortKey="started"
              activeSortKey={sortKey}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
            {showDuration ? (
              <SortableHeader
                label="Duration"
                sortKey="duration"
                activeSortKey={sortKey}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            ) : null}
            {hasAction ? <span className="text-right">Action</span> : null}
          </div>
          <div className="divide-y divide-border">
            {visibleWorkloads.length === 0 ? (
              <div className="px-6 py-6 text-sm text-muted-foreground" data-testid={`${testIdPrefix}-empty`}>
                {hasFilters ? 'No results found.' : emptyMessage}
              </div>
            ) : (
              visibleWorkloads.map((workload) => {
                const rowKey =
                  workload.meta?.id ??
                  (showRunnerColumn
                    ? `${workload.runnerId}:${workload.threadId}:${workload.agentId}`
                    : `${workload.threadId}:${workload.agentId}`);
                const workloadLink = getWorkloadLink ? getWorkloadLink(workload) : null;
                const agentName = resolveAgentName(workload);
                const runnerName = resolveRunnerName(workload);
                const agentLabel = agentName || workload.agentId || EMPTY_PLACEHOLDER;
                const runnerLabelText = runnerName || workload.runnerId || EMPTY_PLACEHOLDER;
                const agentLink = getAgentLink?.(workload) ?? null;
                const runnerLink = getRunnerLink?.(workload) ?? null;
                const durationEnd = resolveDurationEnd(workload);
                const durationLabel = showDuration
                  ? formatDurationBetween(workload.meta?.createdAt, durationEnd)
                  : EMPTY_PLACEHOLDER;

                const rowContent = (
                  <>
                    <div className="text-xs text-muted-foreground" data-testid={`${testIdPrefix}-agent`}>
                      {agentLink ? (
                        <NavLink
                          to={agentLink}
                          className="font-medium text-foreground hover:underline"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {agentLabel}
                        </NavLink>
                      ) : (
                        <span className="font-medium text-foreground">{agentLabel}</span>
                      )}
                    </div>
                    {showRunnerColumn ? (
                      <div className="text-xs text-muted-foreground" data-testid={`${testIdPrefix}-runner`}>
                        {runnerLink ? (
                          <NavLink
                            to={runnerLink}
                            className="font-medium text-foreground hover:underline"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {runnerLabelText}
                          </NavLink>
                        ) : (
                          <span className="font-medium text-foreground">{runnerLabelText}</span>
                        )}
                      </div>
                    ) : null}
                    <span className="text-xs text-muted-foreground" data-testid={`${testIdPrefix}-thread`}>
                      {workload.threadId || EMPTY_PLACEHOLDER}
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
                    {showDuration ? (
                      <span className="text-xs text-muted-foreground" data-testid={`${testIdPrefix}-duration`}>
                        {durationLabel}
                      </span>
                    ) : null}
                    {hasAction ? (
                      <div className="text-right">
                        {workloadLink ? (
                          <Button variant="outline" size="sm" asChild>
                            <NavLink
                              to={workloadLink}
                              state={{ from: location.pathname }}
                              data-testid={`${testIdPrefix}-view`}
                            >
                              {actionLabelText}
                            </NavLink>
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" disabled data-testid={`${testIdPrefix}-view`}>
                            {actionLabelText}
                          </Button>
                        )}
                      </div>
                    ) : null}
                  </>
                );

                if (rowLinkMode === 'row' && workloadLink) {
                  return (
                    <div
                      key={rowKey}
                      role="link"
                      tabIndex={0}
                      className={`grid items-center gap-2 px-6 py-4 text-sm text-foreground ${gridClass} cursor-pointer hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
                      data-testid={`${testIdPrefix}-row`}
                      onClick={(event) => {
                        const target = event.target as HTMLElement;
                        if (target.closest('a, button')) return;
                        navigate(workloadLink, { state: { from: location.pathname } });
                      }}
                      onKeyDown={(event) => {
                        if (event.currentTarget !== event.target) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          navigate(workloadLink, { state: { from: location.pathname } });
                        }
                      }}
                    >
                      {rowContent}
                    </div>
                  );
                }

                return (
                  <div
                    key={rowKey}
                    className={`grid items-center gap-2 px-6 py-4 text-sm text-foreground ${gridClass}`}
                    data-testid={`${testIdPrefix}-row`}
                  >
                    {rowContent}
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
