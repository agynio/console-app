import { useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentsClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AgentConfigurationTab } from '@/pages/agent-detail/AgentConfigurationTab';
import { AgentEnvsTab } from '@/pages/agent-detail/AgentEnvsTab';
import { AgentHooksTab } from '@/pages/agent-detail/AgentHooksTab';
import { AgentInitScriptsTab } from '@/pages/agent-detail/AgentInitScriptsTab';
import { AgentMcpsTab } from '@/pages/agent-detail/AgentMcpsTab';
import { AgentSkillsTab } from '@/pages/agent-detail/AgentSkillsTab';
import { AgentImagePullSecretsTab } from '@/pages/agent-detail/AgentImagePullSecretsTab';
import { AgentVolumeAttachmentsTab } from '@/pages/agent-detail/AgentVolumeAttachmentsTab';
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
        <div className="space-y-8">
          <section data-testid="agent-detail-section-configuration">
            <h3 className="text-lg font-semibold text-foreground mb-4">Configuration</h3>
            <AgentConfigurationTab agent={agent} organizationId={organizationId} />
          </section>
          <section data-testid="agent-detail-section-mcps">
            <h3 className="text-lg font-semibold text-foreground mb-4">MCPs</h3>
            <AgentMcpsTab agentId={resolvedAgentId} />
          </section>
          <section data-testid="agent-detail-section-skills">
            <h3 className="text-lg font-semibold text-foreground mb-4">Skills</h3>
            <AgentSkillsTab agentId={resolvedAgentId} />
          </section>
          <section data-testid="agent-detail-section-hooks">
            <h3 className="text-lg font-semibold text-foreground mb-4">Hooks</h3>
            <AgentHooksTab agentId={resolvedAgentId} />
          </section>
          <section data-testid="agent-detail-section-envs">
            <h3 className="text-lg font-semibold text-foreground mb-4">Environment Variables</h3>
            <AgentEnvsTab agentId={resolvedAgentId} organizationId={organizationId} />
          </section>
          <section data-testid="agent-detail-section-init-scripts">
            <h3 className="text-lg font-semibold text-foreground mb-4">Init Scripts</h3>
            <AgentInitScriptsTab agentId={resolvedAgentId} />
          </section>
          <section data-testid="agent-detail-section-volumes">
            <h3 className="text-lg font-semibold text-foreground mb-4">Volume Attachments</h3>
            <AgentVolumeAttachmentsTab agentId={resolvedAgentId} organizationId={organizationId} />
          </section>
          <section data-testid="agent-detail-section-image-pull-secrets">
            <h3 className="text-lg font-semibold text-foreground mb-4">Image Pull Secrets</h3>
            <AgentImagePullSecretsTab agentId={resolvedAgentId} organizationId={organizationId} />
          </section>
        </div>
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
