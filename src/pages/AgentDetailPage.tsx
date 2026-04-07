import { useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentsClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AgentConfigurationTab } from '@/pages/agent-detail/AgentConfigurationTab';
import { AgentEnvsTab } from '@/pages/agent-detail/AgentEnvsTab';
import { AgentHooksTab } from '@/pages/agent-detail/AgentHooksTab';
import { AgentInitScriptsTab } from '@/pages/agent-detail/AgentInitScriptsTab';
import { AgentMcpsTab } from '@/pages/agent-detail/AgentMcpsTab';
import { AgentSkillsTab } from '@/pages/agent-detail/AgentSkillsTab';
import { AgentImagePullSecretsTab } from '@/pages/agent-detail/AgentImagePullSecretsTab';
import { AgentVolumeAttachmentsTab } from '@/pages/agent-detail/AgentVolumeAttachmentsTab';
import { toast } from 'sonner';

const TAB_OPTIONS = [
  { value: 'configuration', label: 'Configuration' },
  { value: 'mcps', label: 'MCPs' },
  { value: 'skills', label: 'Skills' },
  { value: 'hooks', label: 'Hooks' },
  { value: 'envs', label: 'ENVs' },
  { value: 'init-scripts', label: 'Init Scripts' },
  { value: 'volumes', label: 'Volumes' },
  { value: 'image-pull-secrets', label: 'Image Pull Secrets' },
];

export function AgentDetailPage() {
  const { id, agentId } = useParams();
  const organizationId = id ?? '';
  const resolvedAgentId = agentId ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('configuration');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const agentQuery = useQuery({
    queryKey: ['agents', resolvedAgentId],
    queryFn: () => agentsClient.getAgent({ id: resolvedAgentId }),
    enabled: Boolean(resolvedAgentId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const agent = agentQuery.data?.agent;

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="link" asChild data-testid="agent-detail-back">
            <NavLink to={`/organizations/${organizationId}/agents`}>← Back to Agents</NavLink>
          </Button>
          <h2 className="text-2xl font-semibold text-foreground" data-testid="agent-detail-heading">
            {agent?.name ?? 'Agent'}
          </h2>
          <p className="text-sm text-muted-foreground">Agent configuration and resources.</p>
        </div>
        {agent ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            data-testid="agent-detail-delete"
          >
            Delete agent
          </Button>
        ) : null}
      </div>
      {agentQuery.isPending ? <div className="text-sm text-muted-foreground">Loading agent...</div> : null}
      {agentQuery.isError ? <div className="text-sm text-muted-foreground">Failed to load agent.</div> : null}
      {agent ? (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList data-testid="agent-detail-tabs">
            {TAB_OPTIONS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} data-testid={`agent-detail-tab-${tab.value}`}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="configuration" data-testid="agent-detail-tab-content-configuration">
            <AgentConfigurationTab agent={agent} organizationId={organizationId} />
          </TabsContent>
          <TabsContent value="mcps" data-testid="agent-detail-tab-content-mcps">
            <AgentMcpsTab agentId={resolvedAgentId} />
          </TabsContent>
          <TabsContent value="skills" data-testid="agent-detail-tab-content-skills">
            <AgentSkillsTab agentId={resolvedAgentId} />
          </TabsContent>
          <TabsContent value="hooks" data-testid="agent-detail-tab-content-hooks">
            <AgentHooksTab agentId={resolvedAgentId} />
          </TabsContent>
          <TabsContent value="envs" data-testid="agent-detail-tab-content-envs">
            <AgentEnvsTab agentId={resolvedAgentId} organizationId={organizationId} />
          </TabsContent>
          <TabsContent value="init-scripts" data-testid="agent-detail-tab-content-init-scripts">
            <AgentInitScriptsTab agentId={resolvedAgentId} />
          </TabsContent>
          <TabsContent value="volumes" data-testid="agent-detail-tab-content-volumes">
            <AgentVolumeAttachmentsTab agentId={resolvedAgentId} organizationId={organizationId} />
          </TabsContent>
          <TabsContent value="image-pull-secrets" data-testid="agent-detail-tab-content-image-pull-secrets">
            <AgentImagePullSecretsTab agentId={resolvedAgentId} organizationId={organizationId} />
          </TabsContent>
        </Tabs>
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
