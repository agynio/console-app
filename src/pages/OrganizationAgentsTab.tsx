import { useMemo } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { agentsClient, llmClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatDateOnly } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';

export function OrganizationAgentsTab() {
  const { id } = useParams();
  const organizationId = id ?? '';

  const agentsQuery = useQuery({
    queryKey: ['agents', organizationId, 'list'],
    queryFn: () => agentsClient.listAgents({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
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

  const agents = agentsQuery.data?.agents ?? [];
  const isLoading = agentsQuery.isPending || modelsQuery.isPending;
  const isError = agentsQuery.isError || modelsQuery.isError;

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
              <span>Agent</span>
              <span>Role</span>
              <span>Status</span>
              <span>Model</span>
              <span>Created</span>
            </div>
            <div className="divide-y divide-border">
              {agents.map((agent) => {
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
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
