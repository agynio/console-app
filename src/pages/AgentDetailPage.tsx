import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentsClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DetailPageHeader } from '@/components/DetailPageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AgentConfigurationTab } from '@/pages/agent-detail/AgentConfigurationTab';
import { AgentRolesSection } from '@/pages/agent-detail/AgentRolesSection';
import { InitScriptsTab } from '@/pages/detail-tabs/InitScriptsTab';
import { McpsTab } from '@/pages/detail-tabs/McpsTab';
import { AgentSkillsTab } from '@/pages/agent-detail/AgentSkillsTab';
import { EgressRuleAttachmentsTab } from '@/pages/detail-tabs/EgressRuleAttachmentsTab';
import { EnvsTab } from '@/pages/detail-tabs/EnvsTab';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { toast } from 'sonner';

export function AgentDetailPage() {
  const { id, agentId } = useParams();
  const organizationId = id ?? '';
  const resolvedAgentId = agentId ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const agentQuery = useQuery({
    queryKey: ['agents', resolvedAgentId],
    queryFn: () => agentsClient.getAgent({ id: resolvedAgentId }),
    enabled: Boolean(resolvedAgentId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const agent = agentQuery.data?.agent;

  useDocumentTitle(agent?.name ?? 'Agent');

  const deleteAgentMutation = useMutation({
    mutationFn: () => agentsClient.deleteAgent({ id: resolvedAgentId }),
    onSuccess: () => {
      toast.success('Agent deleted.');
      void queryClient.invalidateQueries({ queryKey: ['agents', resolvedAgentId] });
      void queryClient.invalidateQueries({ queryKey: ['agents', organizationId, 'list'] });
      setDeleteOpen(false);
      navigate(`/organizations/${organizationId}/agents`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete agent.');
    },
  });

  return (
    <div className="space-y-6">
      {agentQuery.isPending ? <div className="text-sm text-muted-foreground">Loading agent...</div> : null}
      {agentQuery.isError ? <div className="text-sm text-muted-foreground">Failed to load agent.</div> : null}
      {agent ? (
        <>
        <DetailPageHeader
          parentLabel="Agents"
          parentHref={`/organizations/${organizationId}/agents`}
          title={agent.name || 'Agent'}
          meta={[agent.model, agent.environmentId ? 'environment set' : ''].filter(Boolean).join(' · ')}
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              data-testid="agent-detail-delete"
            >
              Delete agent
            </Button>
          }
          testId="agent-detail-header"
        />
        <Tabs defaultValue="overview" data-testid="agent-detail-tabs" className="mt-6">
          <TabsList variant="line" className="w-full justify-start border-b border-border [&>*]:flex-none">
            <TabsTrigger value="overview" data-testid="agent-detail-overview-tab">
              Overview
            </TabsTrigger>
            <TabsTrigger value="mcps" data-testid="agent-detail-mcps-tab">
              MCP Servers
            </TabsTrigger>
            <TabsTrigger value="skills" data-testid="agent-detail-skills-tab">
              Skills
            </TabsTrigger>
            <TabsTrigger value="init-scripts" data-testid="agent-detail-init-scripts-tab">
              Init Scripts
            </TabsTrigger>
            <TabsTrigger value="envs" data-testid="agent-detail-envs-tab">
              ENVs
            </TabsTrigger>
            <TabsTrigger value="egress-rules" data-testid="agent-detail-egress-rules-tab">
              Egress Rules
            </TabsTrigger>
            <TabsTrigger value="roles" data-testid="agent-detail-roles-tab">
              Roles
            </TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <AgentConfigurationTab agent={agent} organizationId={organizationId} />
          </TabsContent>
          <TabsContent value="mcps">
            <McpsTab target={{ kind: 'agent', id: resolvedAgentId }} organizationId={organizationId} />
          </TabsContent>
          <TabsContent value="skills">
            <AgentSkillsTab agentId={resolvedAgentId} />
          </TabsContent>
          <TabsContent value="init-scripts">
            <InitScriptsTab target={{ kind: 'agent', id: resolvedAgentId }} />
          </TabsContent>
          <TabsContent value="envs">
            <EnvsTab target={{ kind: 'agent', id: resolvedAgentId }} organizationId={organizationId} />
          </TabsContent>
          <TabsContent value="egress-rules">
            <EgressRuleAttachmentsTab target={{ kind: 'agent', id: resolvedAgentId }} organizationId={organizationId} />
          </TabsContent>
          <TabsContent value="roles">
            <AgentRolesSection agentId={resolvedAgentId} organizationId={organizationId} availability={agent.availability} />
          </TabsContent>
        </Tabs>
        </>
      ) : null}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete agent"
        description="This action permanently removes the agent."
        confirmLabel="Delete agent"
        variant="danger"
        onConfirm={() => deleteAgentMutation.mutate()}
        isPending={deleteAgentMutation.isPending}
      />
    </div>
  );
}
