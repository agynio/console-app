import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { runnersClient } from '@/api/client';
import { WorkloadsTable, type WorkloadSortKey } from '@/components/WorkloadsTable';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ListWorkloadsSortField,
  SortDirection as WorkloadsSortDirection,
  WorkloadStatus,
} from '@/gen/agynio/api/runners/v1/runners_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import { type SortDirection } from '@/hooks/useListControls';
import { formatWorkloadStatus } from '@/lib/format';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';

const WORKLOAD_STATUS_OPTIONS = [
  WorkloadStatus.STARTING,
  WorkloadStatus.RUNNING,
  WorkloadStatus.STOPPING,
  WorkloadStatus.STOPPED,
  WorkloadStatus.FAILED,
];

type ActivityWorkloadSortKey = Exclude<WorkloadSortKey, 'threadId'>;

export function OrganizationActivityWorkloadsTab() {
  useDocumentTitle('Workloads');

  const { id } = useParams();
  const organizationId = id ?? '';
  const [agentIdFilter, setAgentIdFilter] = useState('');
  const [runnerIdFilter, setRunnerIdFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState<ActivityWorkloadSortKey>('started');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const notificationRooms = useMemo(
    () => (organizationId ? [`organization:${organizationId}`] : []),
    [organizationId],
  );

  useNotifications({
    events: ['workload.updated'],
    invalidateKeys: [['workloads', organizationId, 'list']],
    rooms: notificationRooms,
    enabled: Boolean(organizationId) && notificationRooms.length > 0,
  });

  const normalizedAgentId = agentIdFilter.trim();
  const normalizedRunnerId = runnerIdFilter.trim();
  const filterKey = useMemo(
    () => ({ agentId: normalizedAgentId, runnerId: normalizedRunnerId, status: statusFilter }),
    [normalizedAgentId, normalizedRunnerId, statusFilter],
  );

  const sortSpec = useMemo(() => {
    const fieldMap: Record<ActivityWorkloadSortKey, ListWorkloadsSortField> = {
      agentId: ListWorkloadsSortField.AGENT,
      runnerId: ListWorkloadsSortField.RUNNER,
      status: ListWorkloadsSortField.STATUS,
      started: ListWorkloadsSortField.STARTED,
    };
    return {
      field: fieldMap[sortKey],
      direction: sortDirection === 'asc' ? WorkloadsSortDirection.ASC : WorkloadsSortDirection.DESC,
    };
  }, [sortDirection, sortKey]);

  const filterSpec = useMemo(() => {
    const statusValue = statusFilter === 'all' ? null : (Number(statusFilter) as WorkloadStatus);
    return {
      agentIdIn: normalizedAgentId ? [normalizedAgentId] : [],
      runnerIdIn: normalizedRunnerId ? [normalizedRunnerId] : [],
      statusIn: statusValue ? [statusValue] : [],
    };
  }, [normalizedAgentId, normalizedRunnerId, statusFilter]);

  const workloadsQuery = useInfiniteQuery({
    queryKey: ['workloads', organizationId, 'list', filterKey, sortSpec],
    queryFn: ({ pageParam }) =>
      runnersClient.listWorkloads({
        organizationId,
        pageSize: DEFAULT_PAGE_SIZE,
        pageToken: pageParam,
        filter: filterSpec,
        sort: sortSpec,
      }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
    enabled: Boolean(organizationId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const workloads = workloadsQuery.data?.pages.flatMap((page) => page.workloads) ?? [];

  const handleSort = (key: WorkloadSortKey) => {
    if (key === 'threadId') return;
    if (key === sortKey) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection('asc');
  };

  const hasActiveFilters =
    normalizedAgentId.length > 0 || normalizedRunnerId.length > 0 || statusFilter !== 'all';

  return (
    <div className="space-y-6" data-testid="organization-activity-workloads">
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-foreground">Workloads</h3>
        <p className="text-sm text-muted-foreground">
          Real-time view of running agent workloads in the organization.
        </p>
      </div>
      <WorkloadsTable
        workloads={workloads}
        query={workloadsQuery}
        showRunnerColumn
        controls={{
          searchTerm: agentIdFilter,
          onSearchTermChange: setAgentIdFilter,
          sortKey,
          sortDirection,
          onSort: handleSort,
        }}
        searchPlaceholder="Filter by agent ID..."
        filterBar={
          <>
            <div className="min-w-[220px] max-w-sm flex-1">
              <Input
                placeholder="Filter by runner ID..."
                value={runnerIdFilter}
                onChange={(event) => setRunnerIdFilter(event.target.value)}
                data-testid="organization-workloads-runner-filter"
              />
            </div>
            <div className="min-w-[180px]">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger data-testid="organization-workloads-status-filter">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {WORKLOAD_STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={String(status)}>
                      {formatWorkloadStatus(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        }
        hasActiveFilters={hasActiveFilters}
        testIdPrefix="organization-workloads"
      />
    </div>
  );
}
