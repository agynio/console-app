import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { create } from '@bufbuild/protobuf';
import { TimestampSchema, type Timestamp } from '@bufbuild/protobuf/wkt';
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { agentsClient, runnersClient } from '@/api/client';
import { MultiSelectFilter } from '@/components/MultiSelectFilter';
import { WorkloadsTable, type WorkloadSortKey } from '@/components/WorkloadsTable';
import { Input } from '@/components/ui/input';
import {
  ListWorkloadsSortField,
  SortDirection as WorkloadsSortDirection,
  type Workload,
  WorkloadStatus,
} from '@/gen/agynio/api/runners/v1/runners_pb';
import type { NotificationEnvelope } from '@/gen/agynio/api/notifications/v1/notifications_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import { type SortDirection } from '@/hooks/useListControls';
import { formatWorkloadStatus } from '@/lib/format';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/pagination';

const WORKLOAD_STATUS_OPTIONS = [
  WorkloadStatus.STARTING,
  WorkloadStatus.RUNNING,
  WorkloadStatus.STOPPING,
  WorkloadStatus.STOPPED,
  WorkloadStatus.FAILED,
];

type ActivityWorkloadSortKey = Exclude<WorkloadSortKey, 'threadId'>;

const parseDateInput = (value: string, isEnd = false): Date | null => {
  if (!value) return null;
  const [year, month, day] = value.split('-').map((segment) => Number(segment));
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (isEnd) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }
  return date;
};

const toTimestamp = (date: Date): Timestamp =>
  create(TimestampSchema, {
    seconds: BigInt(Math.floor(date.getTime() / 1000)),
    nanos: 0,
  });

const extractWorkloadId = (payload?: NotificationEnvelope['payload']): string | null => {
  if (!payload) return null;
  const resolveString = (value: unknown): string | null =>
    typeof value === 'string' && value.trim().length > 0 ? value : null;

  const direct = resolveString(payload.workloadId ?? payload.workload_id ?? payload.id);
  if (direct) return direct;

  const workload = payload.workload;
  if (!workload || typeof workload !== 'object' || Array.isArray(workload)) return null;
  const workloadRecord = workload as Record<string, unknown>;
  const nested = resolveString(workloadRecord.workloadId ?? workloadRecord.workload_id ?? workloadRecord.id);
  if (nested) return nested;
  const meta = workloadRecord.meta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  return resolveString((meta as Record<string, unknown>).id);
};

const resetPagination = <TPage,>(
  _data: InfiniteData<TPage, unknown> | undefined,
  firstPage: TPage,
): InfiniteData<TPage, unknown> => ({ pages: [firstPage], pageParams: [''] });

const upsertWorkload = (
  data: InfiniteData<Awaited<ReturnType<typeof runnersClient.listWorkloads>>, unknown> | undefined,
  workload: Workload,
): InfiniteData<Awaited<ReturnType<typeof runnersClient.listWorkloads>>, unknown> | undefined => {
  if (!data) return data;
  const workloadId = workload.meta?.id;
  if (!workloadId) return data;

  let found = false;
  const nextPages = data.pages.map((page) => {
    const nextWorkloads = page.workloads.map((item) => {
      if (item.meta?.id === workloadId) {
        found = true;
        return workload;
      }
      return item;
    });
    return { ...page, workloads: nextWorkloads };
  });

  if (!found && nextPages.length > 0) {
    const firstPage = nextPages[0];
    const withoutDuplicate = firstPage.workloads.filter((item) => item.meta?.id !== workloadId);
    const nextWorkloads = [workload, ...withoutDuplicate].slice(0, DEFAULT_PAGE_SIZE);
    nextPages[0] = { ...firstPage, workloads: nextWorkloads };
  }

  return { ...data, pages: nextPages };
};

export function OrganizationActivityWorkloadsTab() {
  useDocumentTitle('Workloads');

  const { id } = useParams();
  const organizationId = id ?? '';
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [agentIdFilter, setAgentIdFilter] = useState<string[]>([]);
  const [runnerIdFilter, setRunnerIdFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [startedAfter, setStartedAfter] = useState('');
  const [startedBefore, setStartedBefore] = useState('');
  const [sortKey, setSortKey] = useState<ActivityWorkloadSortKey>('started');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const agentsQuery = useQuery({
    queryKey: ['agents', organizationId, 'list', 'options'],
    queryFn: () => agentsClient.listAgents({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const runnersQuery = useQuery({
    queryKey: ['runners', organizationId, 'list', 'options'],
    queryFn: () => runnersClient.listRunners({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const agentOptions = useMemo(() => {
    const agents = agentsQuery.data?.agents ?? [];
    return agents
      .map((agent) => {
        const agentId = agent.meta?.id ?? '';
        if (!agentId) return null;
        const name = agent.name?.trim() || agentId;
        return {
          value: agentId,
          label: name,
          secondary: name === agentId ? undefined : agentId,
        };
      })
      .filter((option): option is NonNullable<typeof option> => option !== null)
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [agentsQuery.data?.agents]);

  const runnerOptions = useMemo(() => {
    const runners = runnersQuery.data?.runners ?? [];
    return runners
      .map((runner) => {
        const runnerId = runner.meta?.id ?? '';
        if (!runnerId) return null;
        const name = runner.name?.trim() || runnerId;
        return {
          value: runnerId,
          label: name,
          secondary: name === runnerId ? undefined : runnerId,
        };
      })
      .filter((option): option is NonNullable<typeof option> => option !== null)
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [runnersQuery.data?.runners]);

  const statusOptions = useMemo(
    () =>
      WORKLOAD_STATUS_OPTIONS.map((status) => ({
        value: String(status),
        label: formatWorkloadStatus(status),
      })),
    [],
  );

  const notificationRooms = useMemo(
    () => (organizationId ? [`organization:${organizationId}`] : []),
    [organizationId],
  );

  const { rangeError, startDate, endDate } = useMemo(() => {
    const parsedStart = parseDateInput(startedAfter, false);
    const parsedEnd = parseDateInput(startedBefore, true);
    if (parsedStart && parsedEnd && parsedStart > parsedEnd) {
      return { rangeError: 'Start date must be before end date.', startDate: parsedStart, endDate: parsedEnd };
    }
    return { rangeError: '', startDate: parsedStart, endDate: parsedEnd };
  }, [startedAfter, startedBefore]);

  const filterKey = useMemo(
    () => ({
      agents: agentIdFilter,
      runners: runnerIdFilter,
      status: statusFilter,
      startedAfter,
      startedBefore,
    }),
    [agentIdFilter, runnerIdFilter, statusFilter, startedAfter, startedBefore],
  );

  const sortSpec = useMemo(() => {
    const fieldMap: Record<ActivityWorkloadSortKey, ListWorkloadsSortField> = {
      agentId: ListWorkloadsSortField.AGENT,
      runnerId: ListWorkloadsSortField.RUNNER,
      status: ListWorkloadsSortField.STATUS,
      started: ListWorkloadsSortField.STARTED,
      duration: ListWorkloadsSortField.DURATION,
    };
    return {
      field: fieldMap[sortKey],
      direction: sortDirection === 'asc' ? WorkloadsSortDirection.ASC : WorkloadsSortDirection.DESC,
    };
  }, [sortDirection, sortKey]);

  const filterSpec = useMemo(() => {
    const statusValues = statusFilter.map((value) => Number(value) as WorkloadStatus).filter((value) => value > 0);
    return {
      agentIdIn: agentIdFilter,
      runnerIdIn: runnerIdFilter,
      statusIn: statusValues,
      startedAfter: rangeError ? undefined : startDate ? toTimestamp(startDate) : undefined,
      startedBefore: rangeError ? undefined : endDate ? toTimestamp(endDate) : undefined,
    };
  }, [agentIdFilter, runnerIdFilter, statusFilter, startDate, endDate, rangeError]);

  const workloadsQueryKey = useMemo(
    () => ['workloads', organizationId, 'list', filterKey, sortSpec] as const,
    [filterKey, organizationId, sortSpec],
  );

  const workloadsQuery = useInfiniteQuery({
    queryKey: workloadsQueryKey,
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
    agentIdFilter.length > 0 ||
    runnerIdFilter.length > 0 ||
    statusFilter.length > 0 ||
    startedAfter.length > 0 ||
    startedBefore.length > 0;
  const hasActiveControls = hasActiveFilters || sortKey !== 'started' || sortDirection !== 'desc';

  useNotifications({
    events: ['workload.updated'],
    rooms: notificationRooms,
    enabled: Boolean(organizationId) && notificationRooms.length > 0,
    onEvent: (envelope) => {
      if (hasActiveControls) {
        void (async () => {
          try {
            const firstPage = await runnersClient.listWorkloads({
              organizationId,
              pageSize: DEFAULT_PAGE_SIZE,
              pageToken: '',
              filter: filterSpec,
              sort: sortSpec,
            });
            queryClient.setQueryData<InfiniteData<Awaited<ReturnType<typeof runnersClient.listWorkloads>>, unknown>>(
              workloadsQueryKey,
              (data) => resetPagination(data, firstPage),
            );
          } catch (error) {
            console.error('[useNotifications] workload refetch error:', error);
          }
        })();
        return;
      }

      const workloadId = extractWorkloadId(envelope.payload);
      if (!workloadId) return;
      void (async () => {
        try {
          const response = await runnersClient.getWorkload({ id: workloadId });
          const workload = response.workload;
          if (!workload || workload.organizationId !== organizationId) return;
          queryClient.setQueryData<InfiniteData<Awaited<ReturnType<typeof runnersClient.listWorkloads>>, unknown>>(
            workloadsQueryKey,
            (data) => upsertWorkload(data, workload),
          );
        } catch (error) {
          console.error('[useNotifications] workload update error:', error);
        }
      })();
    },
  });

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
        showDuration
        showSearch={false}
        rowLinkMode="row"
        getWorkloadLink={(workload) => {
          const workloadId = workload.meta?.id;
          if (!workloadId) return null;
          return `/organizations/${organizationId}/workloads/${workloadId}`;
        }}
        getAgentName={(workload) => workload.agentName || ''}
        getRunnerName={(workload) => workload.runnerName || ''}
        getAgentLink={(workload) =>
          workload.agentId ? `/organizations/${organizationId}/agents/${workload.agentId}` : null
        }
        getRunnerLink={(workload) =>
          workload.runnerId ? `/organizations/${organizationId}/runners/${workload.runnerId}` : null
        }
        agentLabel="Agent"
        runnerLabel="Runner"
        controls={{
          searchTerm,
          onSearchTermChange: setSearchTerm,
          sortKey,
          sortDirection,
          onSort: handleSort,
        }}
        filterBar={
          <>
            <div className="min-w-[180px]">
              <MultiSelectFilter
                label="Agent"
                options={agentOptions}
                selectedValues={agentIdFilter}
                onChange={setAgentIdFilter}
                testId="organization-workloads-agent-filter"
              />
            </div>
            <div className="min-w-[180px]">
              <MultiSelectFilter
                label="Runner"
                options={runnerOptions}
                selectedValues={runnerIdFilter}
                onChange={setRunnerIdFilter}
                testId="organization-workloads-runner-filter"
              />
            </div>
            <div className="min-w-[180px]">
              <MultiSelectFilter
                label="Status"
                options={statusOptions}
                selectedValues={statusFilter}
                onChange={setStatusFilter}
                testId="organization-workloads-status-filter"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Started after</span>
                <Input
                  type="date"
                  value={startedAfter}
                  onChange={(event) => setStartedAfter(event.target.value)}
                  data-testid="organization-workloads-started-after"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Started before</span>
                <Input
                  type="date"
                  value={startedBefore}
                  onChange={(event) => setStartedBefore(event.target.value)}
                  data-testid="organization-workloads-started-before"
                />
              </div>
            </div>
          </>
        }
        hasActiveFilters={hasActiveFilters}
        testIdPrefix="organization-workloads"
      />
      {rangeError ? <div className="text-sm text-destructive">{rangeError}</div> : null}
    </div>
  );
}
