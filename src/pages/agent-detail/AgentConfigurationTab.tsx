import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentsClient, llmClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { ComputeResourcesEditor } from '@/components/ComputeResourcesEditor';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { JsonEditor } from '@/components/JsonEditor';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Agent, ComputeResources } from '@/gen/agynio/api/agents/v1/agents_pb';
import { NO_MODEL } from '@/lib/constants';
import { formatComputeResources } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

type AgentConfigurationTabProps = {
  agent: Agent;
  organizationId: string;
};

type ConfigurationPreview = {
  value: string;
  hasError: boolean;
};

export function AgentConfigurationTab({ agent, organizationId }: AgentConfigurationTabProps) {
  const queryClient = useQueryClient();
  const agentId = agent.meta?.id;
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [role, setRole] = useState('');
  const [modelId, setModelId] = useState(NO_MODEL);
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('');
  const [initImage, setInitImage] = useState('');
  const [configuration, setConfiguration] = useState('');
  const [configurationError, setConfigurationError] = useState('');
  const [resources, setResources] = useState<ComputeResources | undefined>(undefined);

  const modelsQuery = useQuery({
    queryKey: ['llm', organizationId, 'models', 'all'],
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

  const configurationPreview = useMemo<ConfigurationPreview>(() => {
    if (!agent.configuration) {
      return { value: '—', hasError: false };
    }
    try {
      return { value: JSON.stringify(JSON.parse(agent.configuration), null, 2), hasError: false };
    } catch {
      return { value: agent.configuration, hasError: true };
    }
  }, [agent.configuration]);

  const updateAgentMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      name?: string;
      role?: string;
      model?: string;
      description?: string;
      configuration?: string;
      image?: string;
      initImage?: string;
      resources?: ComputeResources;
    }) => agentsClient.updateAgent(payload),
    onSuccess: () => {
      toast.success('Agent updated.');
      if (agentId) {
        void queryClient.invalidateQueries({ queryKey: ['agents', agentId] });
      }
      void queryClient.invalidateQueries({ queryKey: ['agents', organizationId, 'list'] });
      setEditOpen(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update agent.');
    },
  });

  const handleEditOpenChange = (open: boolean) => {
    if (open) {
      setName(agent.name);
      setRole(agent.role);
      setModelId(agent.model || NO_MODEL);
      setDescription(agent.description);
      setImage(agent.image);
      setInitImage(agent.initImage);
      setConfiguration(agent.configuration);
      setResources(agent.resources ?? undefined);
      setNameError('');
      setConfigurationError('');
      setEditOpen(true);
      return;
    }
    setEditOpen(false);
  };

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError('Name is required.');
      return;
    }

    const trimmedConfig = configuration.trim();
    if (trimmedConfig) {
      try {
        JSON.parse(trimmedConfig);
      } catch {
        setConfigurationError('Invalid JSON format.');
        return;
      }
    }

    if (!agentId) {
      toast.error('Missing agent ID.');
      return;
    }

    updateAgentMutation.mutate({
      id: agentId,
      name: trimmedName,
      role: role.trim(),
      model: modelId === NO_MODEL ? '' : modelId,
      description: description.trim(),
      configuration: trimmedConfig,
      image: image.trim(),
      initImage: initImage.trim(),
      resources,
    });
  };

  return (
    <div className="space-y-4">
      <Card className="border-border" data-testid="agent-configuration-card">
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Configuration</h3>
              <p className="text-sm text-muted-foreground">Agent metadata and runtime settings.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleEditOpenChange(true)}
              data-testid="agent-configuration-edit"
            >
              Edit
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Name</div>
              <div className="text-sm text-foreground">{agent.name || '—'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Role</div>
              <div className="text-sm text-foreground">{agent.role || '—'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Model</div>
              <div className="text-sm text-foreground">
                {modelMap.get(agent.model)?.name ?? (agent.model || '—')}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Description</div>
              <div className="text-sm text-foreground">{agent.description || '—'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Image</div>
              <div className="text-sm text-foreground">{agent.image || '—'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Init Image</div>
              <div className="text-sm text-foreground">{agent.initImage || '—'}</div>
            </div>
            <div className="md:col-span-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Compute Resources</div>
              <div className="text-sm text-foreground">
                {formatComputeResources(agent.resources)}
              </div>
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Configuration</div>
            {configurationPreview.hasError ? (
              <div className="mt-1 text-xs text-destructive">Invalid JSON format</div>
            ) : null}
            <pre
              className="mt-2 whitespace-pre-wrap rounded-md border border-border bg-muted p-3 text-xs font-mono text-foreground"
              data-testid="agent-configuration-preview"
            >
              {configurationPreview.value}
            </pre>
          </div>
        </CardContent>
      </Card>
      <Dialog open={editOpen} onOpenChange={handleEditOpenChange}>
        <DialogContent data-testid="agent-configuration-dialog">
          <DialogHeader>
            <DialogTitle data-testid="agent-configuration-dialog-title">Edit configuration</DialogTitle>
            <DialogDescription data-testid="agent-configuration-dialog-description">
              Update agent settings and resources.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agent-configuration-name">Name</Label>
              <Input
                id="agent-configuration-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (nameError) setNameError('');
                }}
                data-testid="agent-configuration-name"
              />
              {nameError && <p className="text-sm text-destructive">{nameError}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-configuration-role">Role</Label>
              <Input
                id="agent-configuration-role"
                value={role}
                onChange={(event) => setRole(event.target.value)}
                data-testid="agent-configuration-role"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-configuration-model">Model</Label>
              <Select value={modelId} onValueChange={(value) => setModelId(value)}>
                <SelectTrigger id="agent-configuration-model" data-testid="agent-configuration-model">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_MODEL}>None</SelectItem>
                  {(modelsQuery.data?.models ?? []).map((model) => {
                    const modelValue = model.meta?.id;
                    if (!modelValue) return null;
                    return (
                      <SelectItem key={modelValue} value={modelValue}>
                        {model.name || 'Unnamed model'}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-configuration-description">Description</Label>
              <Input
                id="agent-configuration-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                data-testid="agent-configuration-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-configuration-image">Image</Label>
              <Input
                id="agent-configuration-image"
                value={image}
                onChange={(event) => setImage(event.target.value)}
                data-testid="agent-configuration-image"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-configuration-init-image">Init Image</Label>
              <Input
                id="agent-configuration-init-image"
                value={initImage}
                onChange={(event) => setInitImage(event.target.value)}
                data-testid="agent-configuration-init-image"
              />
            </div>
            <JsonEditor
              label="Configuration"
              value={configuration}
              onChange={(nextValue) => {
                setConfiguration(nextValue);
                if (configurationError) setConfigurationError('');
              }}
              error={configurationError}
              testId="agent-configuration-config"
            />
            <div className="space-y-2">
              <Label>Compute Resources</Label>
              <ComputeResourcesEditor
                value={resources}
                onChange={setResources}
                testIdPrefix="agent-configuration"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="agent-configuration-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateAgentMutation.isPending}
              data-testid="agent-configuration-save"
            >
              {updateAgentMutation.isPending ? 'Saving...' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
