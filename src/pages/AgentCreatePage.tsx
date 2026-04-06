import { useMemo, useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentsClient, llmClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { ComputeResourcesEditor } from '@/components/ComputeResourcesEditor';
import { Input } from '@/components/ui/input';
import { JsonEditor } from '@/components/JsonEditor';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ComputeResources } from '@/gen/agynio/api/agents/v1/agents_pb';
import { NO_MODEL } from '@/lib/constants';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

export function AgentCreatePage() {
  const { id } = useParams();
  const organizationId = id ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
    queryKey: ['llm', organizationId, 'models'],
    queryFn: () => llmClient.listModels({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const models = useMemo(() => modelsQuery.data?.models ?? [], [modelsQuery.data?.models]);

  const createAgentMutation = useMutation({
    mutationFn: (payload: {
      name: string;
      role: string;
      model: string;
      description: string;
      configuration: string;
      image: string;
      initImage: string;
      organizationId: string;
      resources?: ComputeResources;
    }) => agentsClient.createAgent(payload),
    onSuccess: (response) => {
      const agentId = response.agent?.meta?.id;
      toast.success('Agent created.');
      void queryClient.invalidateQueries({ queryKey: ['agents', organizationId, 'list'] });
      if (agentId) {
        navigate(`/organizations/${organizationId}/agents/${agentId}`);
        return;
      }
      toast.error('Agent created but missing ID.');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create agent.');
    },
  });

  const handleSubmit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError('Name is required.');
      return;
    }
    if (!organizationId) {
      toast.error('Organization is missing.');
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

    setNameError('');
    setConfigurationError('');

    createAgentMutation.mutate({
      name: trimmedName,
      role: role.trim(),
      model: modelId === NO_MODEL ? '' : modelId,
      description: description.trim(),
      configuration: trimmedConfig,
      image: image.trim(),
      initImage: initImage.trim(),
      organizationId,
      resources,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <Button variant="link" asChild data-testid="agent-create-back">
          <NavLink to={`/organizations/${organizationId}/agents`}>← Back to Agents</NavLink>
        </Button>
        <h2 className="text-2xl font-semibold text-foreground" data-testid="agent-create-heading">
          Create agent
        </h2>
        <p className="text-sm text-muted-foreground">Define agent configuration and resources.</p>
      </div>
      <Card className="border-border" data-testid="agent-create-form">
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="agent-create-name">Name</Label>
            <Input
              id="agent-create-name"
              placeholder="Support agent"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (nameError) setNameError('');
              }}
              data-testid="agent-create-name"
            />
            {nameError && <p className="text-sm text-destructive">{nameError}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="agent-create-role">Role</Label>
            <Input
              id="agent-create-role"
              placeholder="Customer support"
              value={role}
              onChange={(event) => setRole(event.target.value)}
              data-testid="agent-create-role"
            />
          </div>
          <div className="space-y-2" data-testid="agent-create-model">
            <Label htmlFor="agent-create-model-select">Model</Label>
            <Select
              value={modelId}
              onValueChange={(value) => setModelId(value)}
              disabled={modelsQuery.isPending}
            >
              <SelectTrigger id="agent-create-model-select" data-testid="agent-create-model-select">
                <SelectValue placeholder={modelsQuery.isPending ? 'Loading models...' : 'Select model'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_MODEL}>None</SelectItem>
                {models.map((model) => {
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
            <Label htmlFor="agent-create-description">Description</Label>
            <Input
              id="agent-create-description"
              placeholder="Explain what this agent does"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              data-testid="agent-create-description"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agent-create-image">Image</Label>
            <Input
              id="agent-create-image"
              placeholder="ghcr.io/org/agent:latest"
              value={image}
              onChange={(event) => setImage(event.target.value)}
              data-testid="agent-create-image"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agent-create-init-image">Init Image</Label>
            <Input
              id="agent-create-init-image"
              placeholder="ghcr.io/org/agent-init:latest"
              value={initImage}
              onChange={(event) => setInitImage(event.target.value)}
              data-testid="agent-create-init-image"
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
            testId="agent-create-configuration"
          />
          <div className="space-y-2" data-testid="agent-create-resources">
            <Label>Compute Resources</Label>
            <ComputeResourcesEditor
              value={resources}
              onChange={setResources}
              testIdPrefix="agent-create"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild data-testid="agent-create-cancel">
              <NavLink to={`/organizations/${organizationId}/agents`}>Cancel</NavLink>
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={createAgentMutation.isPending}
              data-testid="agent-create-submit"
            >
              {createAgentMutation.isPending ? 'Creating...' : 'Create agent'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
