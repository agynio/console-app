import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { agentsClient } from '@/api/client';
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

  const agents = agentsQuery.data?.agents ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-[var(--agyn-dark)]" data-testid="organization-agents-heading">
          Agents
        </h3>
        <p className="text-sm text-[var(--agyn-gray)]">Agents configured for this organization.</p>
      </div>
      {agentsQuery.isPending ? <div className="text-sm text-[var(--agyn-gray)]">Loading agents...</div> : null}
      {agentsQuery.isError ? <div className="text-sm text-[var(--agyn-gray)]">Failed to load agents.</div> : null}
      {agents.length === 0 && !agentsQuery.isPending ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="organization-agents-empty">
          <CardContent className="py-10 text-center text-sm text-[var(--agyn-gray)]">
            No agents configured.
          </CardContent>
        </Card>
      ) : null}
      {agents.length > 0 ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="organization-agents-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-[var(--agyn-gray)] md:grid-cols-[2fr_1fr_1fr_1fr]"
              data-testid="organization-agents-header"
            >
              <span>Agent</span>
              <span>Role</span>
              <span>Model</span>
              <span>Created</span>
            </div>
            <div className="divide-y divide-[var(--agyn-border-subtle)]">
              {agents.map((agent) => (
                <div
                  key={agent.meta?.id ?? agent.name}
                  className="grid items-center gap-2 px-6 py-4 text-sm text-[var(--agyn-dark)] md:grid-cols-[2fr_1fr_1fr_1fr]"
                  data-testid="organization-agent-row"
                >
                  <div>
                    <div className="font-medium" data-testid="organization-agent-name">
                      {agent.name}
                    </div>
                    <div className="text-xs text-[var(--agyn-gray)]" data-testid="organization-agent-id">
                      {agent.meta?.id ?? '—'}
                    </div>
                  </div>
                  <Badge variant="secondary" data-testid="organization-agent-role">
                    {agent.role || '—'}
                  </Badge>
                  <span className="text-xs text-[var(--agyn-gray)]" data-testid="organization-agent-model">
                    {agent.model || '—'}
                  </span>
                  <span className="text-xs text-[var(--agyn-gray)]" data-testid="organization-agent-created">
                    {formatDateOnly(agent.meta?.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
