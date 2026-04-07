import { useMemo } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { agentsClient, llmClient } from '@/api/client';
import { SortableHeader } from '@/components/SortableHeader';
import { LoadMoreButton } from '@/components/LoadMoreButton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useListControls } from '@/hooks/useListControls';
import { formatDateOnly, timestampToMillis } from '@/lib/format';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/pagination';

export function OrganizationAgentsTab() {
  const { id } = useParams();
  const organizationId = id ?? '';

  const agentsQuery = useInfiniteQuery({
    queryKey: ['agents', organizationId, 'list'],
    queryFn: ({ pageParam }) =>
      agentsClient.listAgents({ organizationId, pageSize: DEFAULT_PAGE_SIZE, pageToken: pageParam }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const modelsQuery = useQuery({
    queryKey: ['llm', organizationId, 'models'],
    queryFn: () => llmClient.listModels({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const modelMap = useMemo(() => {
    const models = modelsQuery.data?.models ?? [];
    return new Map(
      models.flatMap((model) => {
        const modelId = model.meta?.id;
        return modelId ? ([[modelId, model]] as const) : [];
      }),
    );
  }, [modelsQuery.data?.models]);

  const agents = agentsQuery.data?.pages.flatMap((page) => page.agents) ?? [];
  const isLoading = agentsQuery.isPending || modelsQuery.isPending;
  const isError = agentsQuery.isError || modelsQuery.isError;

  const getModelLabel = (agent: (typeof agents)[number]) =>
    modelMap.get(agent.model)?.name ?? (agent.model || '');

  const listControls = useListControls({
    items: agents,
    searchFields: [
      (agent) => agent.name,
      (agent) => agent.meta?.id ?? '',
      (agent) => agent.role || '',
      (agent) => getModelLabel(agent),
      () => 'TBD',
    ],
    sortOptions: {
      name: (agent) => agent.name,
      role: (agent) => agent.role || '',
      status: () => 'TBD',
      model: (agent) => getModelLabel(agent),
      created: (agent) => timestampToMillis(agent.meta?.createdAt),
    },
    defaultSortKey: 'name',
  });

  const visibleAgents = listControls.filteredItems;
  const hasSearch = listControls.searchTerm.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground" data-testid="organization-agents-heading">
            Agents
          </h3>
          <p className="text-sm text-muted-foreground">Agents configured for this organization.</p>
        </div>
        <Button variant="outline" size="sm" asChild data-testid="organization-agents-create">
          <NavLink to={`/organizations/${organizationId}/agents/new`}>Create agent</NavLink>
        </Button>
      </div>
      <div className="max-w-sm">
        <Input
          placeholder="Search agents..."
          value={listControls.searchTerm}
          onChange={(event) => listControls.setSearchTerm(event.target.value)}
          data-testid="list-search"
        />
      </div>
      {isLoading ? <div className="text-sm text-muted-foreground">Loading agents...</div> : null}
      {isError ? <div className="text-sm text-muted-foreground">Failed to load agents.</div> : null}
      {agents.length === 0 && !isLoading ? (
        <Card className="border-border" data-testid="organization-agents-empty">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No agents configured.
          </CardContent>
        </Card>
      ) : null}
      {agents.length > 0 ? (
        <Card className="border-border" data-testid="organization-agents-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[2fr_1fr_1fr_1fr_1fr]"
              data-testid="organization-agents-header"
            >
              <SortableHeader
                label="Agent"
                sortKey="name"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Role"
                sortKey="role"
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
              <SortableHeader
                label="Model"
                sortKey="model"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Created"
                sortKey="created"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
            </div>
            <div className="divide-y divide-border">
              {visibleAgents.length === 0 ? (
                <div className="px-6 py-6 text-sm text-muted-foreground">
                  {hasSearch ? 'No results found.' : 'No agents configured.'}
                </div>
              ) : (
                visibleAgents.map((agent) => {
                  const agentId = agent.meta?.id;
                  const model = modelMap.get(agent.model);
                  const rowContent = (
                    <>
                      <div>
                        <div className="font-medium" data-testid="organization-agent-name">
                          {agent.name}
                        </div>
                        <div className="text-xs text-muted-foreground" data-testid="organization-agent-id">
                          {agentId ?? '—'}
                        </div>
                      </div>
                      <Badge variant="secondary" data-testid="organization-agent-role">
                        {agent.role || '—'}
                      </Badge>
                      {/* TODO: replace with live agent status when available. */}
                      <Badge
                        variant="secondary"
                        className="text-muted-foreground"
                        title="Status is not yet available."
                        data-testid="organization-agent-status"
                      >
                        TBD
                      </Badge>
                      <span className="text-xs text-muted-foreground" data-testid="organization-agent-model">
                        {model?.name ?? (agent.model || '—')}
                      </span>
                      <span className="text-xs text-muted-foreground" data-testid="organization-agent-created">
                        {formatDateOnly(agent.meta?.createdAt)}
                      </span>
                    </>
                  );

                  return agentId ? (
                    <NavLink
                      key={agentId}
                      to={`/organizations/${organizationId}/agents/${agentId}`}
                      className="grid items-center gap-2 px-6 py-4 text-sm text-foreground md:grid-cols-[2fr_1fr_1fr_1fr_1fr] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      data-testid="organization-agent-row"
                    >
                      {rowContent}
                    </NavLink>
                  ) : (
                    <div
                      key={agent.name}
                      className="grid items-center gap-2 px-6 py-4 text-sm text-foreground md:grid-cols-[2fr_1fr_1fr_1fr_1fr]"
                      data-testid="organization-agent-row"
                    >
                      {rowContent}
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}
      <LoadMoreButton
        hasMore={Boolean(agentsQuery.hasNextPage)}
        isLoading={agentsQuery.isFetchingNextPage}
        onClick={() => {
          void agentsQuery.fetchNextPage();
        }}
      />
    </div>
  );
}
