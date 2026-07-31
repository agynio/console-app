import { useMemo, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { useInfiniteQuery, useQueries, useQuery } from '@tanstack/react-query';
import { agentsClient } from '@/api/client';
import { FilterBar, SingleSelectFilter } from '@/components/FilterBar';
import { LoadMoreButton } from '@/components/LoadMoreButton';
import { MultiSelectFilter } from '@/components/MultiSelectFilter';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { AgentInstanceState, type AgentInstance } from '@/gen/agynio/api/agents/v1/agents_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { formatInstanceState, formatPauseReason, instanceStateVariant } from '@/lib/agentInstance';
import { EMPTY_PLACEHOLDER, formatTimestamp } from '@/lib/format';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/pagination';

const INSTANCE_STATE_OPTIONS = [
  AgentInstanceState.ACTIVE,
  AgentInstanceState.PAUSED,
  AgentInstanceState.TERMINATED,
];

const ANY_AGENT = '__any';
const UNACKED_ANY = 'any';
const UNACKED_WITH = 'with';
const UNACKED_WITHOUT = 'without';

export function OrganizationInstancesPage() {
  useDocumentTitle('Instances');

  const { id } = useParams();
  const organizationId = id ?? '';
  const [agentFilter, setAgentFilter] = useState(ANY_AGENT);
  const [stateFilter, setStateFilter] = useState<string[]>([]);
  const [unackedFilter, setUnackedFilter] = useState(UNACKED_ANY);

  const agentsQuery = useQuery({
    queryKey: ['agents', organizationId, 'list', 'options'],
    queryFn: () => agentsClient.listAgents({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const agentOptions = useMemo(
    () =>
      (agentsQuery.data?.agents ?? [])
        .flatMap((agent) => {
          const agentId = agent.meta?.id;
          if (!agentId) return [];
          return [{ value: agentId, label: agent.nickname ? `@${agent.nickname}` : agent.name || agentId }];
        })
        .sort((left, right) => left.label.localeCompare(right.label)),
    [agentsQuery.data?.agents],
  );

  const stateOptions = useMemo(
    () => INSTANCE_STATE_OPTIONS.map((state) => ({ value: String(state), label: formatInstanceState(state) })),
    [],
  );

  const stateIn = useMemo(
    () => stateFilter.map((value) => Number(value) as AgentInstanceState).filter((value) => value > 0),
    [stateFilter],
  );
  const agentId = agentFilter === ANY_AGENT ? undefined : agentFilter;
  const hasUnacked = unackedFilter === UNACKED_ANY ? undefined : unackedFilter === UNACKED_WITH;

  const instancesQuery = useInfiniteQuery({
    queryKey: ['instances', organizationId, 'list', { agentId, stateIn, hasUnacked }],
    queryFn: ({ pageParam }) =>
      agentsClient.listInstances({
        organizationId,
        pageSize: DEFAULT_PAGE_SIZE,
        pageToken: pageParam,
        agentId,
        stateIn,
        hasUnacked,
      }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
    enabled: Boolean(organizationId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const instances = useMemo(
    () => instancesQuery.data?.pages.flatMap((page) => page.instances) ?? [],
    [instancesQuery.data?.pages],
  );

  // The agents service has no batch count RPC, so the inbox column costs one
  // small call per listed instance. They resolve independently of the list.
  const inboxCountQueries = useQueries({
    queries: instances.map((instance) => ({
      queryKey: ['instances', instance.meta?.id ?? '', 'unacked-count'],
      queryFn: () => agentsClient.getUnackedInboxCount({ agentInstanceId: instance.meta?.id ?? '' }),
      enabled: Boolean(instance.meta?.id),
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    })),
  });
  const inboxCountByInstance = useMemo(() => {
    const counts = new Map<string, number>();
    instances.forEach((instance, index) => {
      const instanceId = instance.meta?.id;
      const count = inboxCountQueries[index]?.data?.count;
      if (instanceId && typeof count === 'number') counts.set(instanceId, count);
    });
    return counts;
  }, [instances, inboxCountQueries]);

  const hasActiveFilters = agentFilter !== ANY_AGENT || stateFilter.length > 0 || unackedFilter !== UNACKED_ANY;
  const clearFilters = () => {
    setAgentFilter(ANY_AGENT);
    setStateFilter([]);
    setUnackedFilter(UNACKED_ANY);
  };

  return (
    <div className="space-y-4" data-testid="organization-instances">
      <FilterBar isActive={hasActiveFilters} onClear={clearFilters} testId="organization-instances-filters">
        <SingleSelectFilter
          label="Agent"
          anyLabel="Any agent"
          anyValue={ANY_AGENT}
          value={agentFilter}
          options={agentOptions}
          onChange={setAgentFilter}
          testId="organization-instances-agent-filter"
        />
        <MultiSelectFilter
          label="State"
          options={stateOptions}
          selectedValues={stateFilter}
          onChange={setStateFilter}
          testId="organization-instances-state-filter"
        />
        <SingleSelectFilter
          label="Inbox"
          anyLabel="Any"
          anyValue={UNACKED_ANY}
          value={unackedFilter}
          options={[
            { value: UNACKED_WITH, label: 'Unacked' },
            { value: UNACKED_WITHOUT, label: 'Empty' },
          ]}
          onChange={setUnackedFilter}
          testId="organization-instances-unacked-filter"
        />
      </FilterBar>
      {instancesQuery.isPending ? <div className="text-sm text-muted-foreground">Loading instances...</div> : null}
      {instancesQuery.isError ? <div className="text-sm text-muted-foreground">Failed to load instances.</div> : null}
      {instances.length === 0 && !instancesQuery.isPending && !instancesQuery.isError ? (
        <Card className="border-border" data-testid="organization-instances-empty">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {hasActiveFilters ? 'No results found.' : 'No agent instances yet.'}
          </CardContent>
        </Card>
      ) : null}
      {instances.length > 0 ? (
        <Card className="border-border" data-testid="organization-instances-table">
          <CardContent className="px-0">
            <div className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[2fr_1fr_1fr_1.5fr_0.75fr_1fr]">
              <span>Instance</span>
              <span>Class</span>
              <span>State</span>
              <span>Pause reason</span>
              <span>Inbox</span>
              <span>Last activity</span>
            </div>
            <div className="divide-y divide-border">
              {instances.map((instance) => (
                <InstanceRow
                  key={instance.meta?.id ?? instance.handle}
                  organizationId={organizationId}
                  instance={instance}
                  unackedCount={inboxCountByInstance.get(instance.meta?.id ?? '')}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
      <LoadMoreButton
        hasMore={instancesQuery.hasNextPage}
        isLoading={instancesQuery.isFetchingNextPage}
        onClick={() => {
          void instancesQuery.fetchNextPage();
        }}
      />
    </div>
  );
}

function InstanceRow({
  organizationId,
  instance,
  unackedCount,
}: {
  organizationId: string;
  instance: AgentInstance;
  unackedCount?: number;
}) {
  const instanceId = instance.meta?.id;
  const classLabel = instance.nickname ? `@${instance.nickname}` : instance.agentId;

  return (
    <div
      className="grid items-center gap-2 px-6 py-4 text-sm md:grid-cols-[2fr_1fr_1fr_1.5fr_0.75fr_1fr]"
      data-testid="organization-instance-row"
    >
      <div>
        {instanceId ? (
          <NavLink
            className="font-medium text-primary hover:underline"
            to={`/organizations/${organizationId}/instances/${instanceId}`}
            data-testid="organization-instance-row-link"
          >
            {instance.handle || instance.suffix}
          </NavLink>
        ) : (
          <span className="font-medium text-foreground">{instance.handle || instance.suffix}</span>
        )}
        <div className="text-xs text-muted-foreground">{instanceId || 'No ID'}</div>
      </div>
      <div className="text-muted-foreground">
        {instance.agentId ? (
          <NavLink className="hover:underline" to={`/organizations/${organizationId}/agents/${instance.agentId}`}>
            {classLabel}
          </NavLink>
        ) : (
          classLabel || EMPTY_PLACEHOLDER
        )}
      </div>
      <div>
        <Badge variant={instanceStateVariant(instance.state)} data-testid="organization-instance-state">
          {formatInstanceState(instance.state)}
        </Badge>
      </div>
      <div className="text-muted-foreground" data-testid="organization-instance-pause-reason">
        {instance.state === AgentInstanceState.PAUSED ? formatPauseReason(instance.pauseReason) : EMPTY_PLACEHOLDER}
      </div>
      <div className="text-muted-foreground" data-testid="organization-instance-inbox">
        {typeof unackedCount === 'number' ? unackedCount.toLocaleString() : EMPTY_PLACEHOLDER}
      </div>
      <div className="text-muted-foreground">{formatTimestamp(instance.lastActivityAt)}</div>
    </div>
  );
}
