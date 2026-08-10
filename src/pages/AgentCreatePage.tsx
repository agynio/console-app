import { useMemo, useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentsClient, llmClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { JsonEditor } from '@/components/JsonEditor';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AgentAvailability,
  AgentDefaultThread,
  AgentFinalMessage,
  LLMMode,
} from '@/gen/agynio/api/agents/v1/agents_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { NO_MODEL } from '@/lib/constants';
import { GO_DURATION_HELP_TEXT, isValidGoDuration } from '@/lib/duration';
import { NICKNAME_MAX_LENGTH, getNicknameValidationError } from '@/lib/nickname';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

export function AgentCreatePage() {
  useDocumentTitle('Create Agent');

  const { id } = useParams();
  const organizationId = id ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [nickname, setNickname] = useState('');
  const [nicknameError, setNicknameError] = useState('');
  const [role, setRole] = useState('');
  // Empty rather than NO_MODEL: unchosen has to read as unchosen, and only an
  // unmatched value lets the trigger show its placeholder.
  const [modelId, setModelId] = useState('');
  const [modelName, setModelName] = useState('');
  const [description, setDescription] = useState('');
  const [environmentId, setEnvironmentId] = useState('');
  const [environmentError, setEnvironmentError] = useState('');
  const [configuration, setConfiguration] = useState('');
  const [configurationError, setConfigurationError] = useState('');
  const [idleTimeout, setIdleTimeout] = useState('');
  const [idleTimeoutError, setIdleTimeoutError] = useState('');
  const [availability, setAvailability] = useState<AgentAvailability>(AgentAvailability.INTERNAL);
  const [defaultThread, setDefaultThread] = useState<AgentDefaultThread>(AgentDefaultThread.ORIGIN);
  const [finalMessage, setFinalMessage] = useState<AgentFinalMessage>(AgentFinalMessage.DISCARD);

  const modelsQuery = useQuery({
    queryKey: ['llm', organizationId, 'models', 'all'],
    queryFn: () => llmClient.listModels({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const models = useMemo(() => modelsQuery.data?.models ?? [], [modelsQuery.data?.models]);

  const environmentsQuery = useQuery({
    queryKey: ['environments', organizationId, 'all'],
    queryFn: () => agentsClient.listEnvironments({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const environments = useMemo(
    () => environmentsQuery.data?.environments ?? [],
    [environmentsQuery.data?.environments],
  );

  // Which of the two model references is legal is the environment's to decide,
  // so the field only exists once one is chosen.
  const isNative =
    environments.find((environment) => environment.meta?.id === environmentId)?.llmMode ===
    LLMMode.LLM_MODE_NATIVE;

  const createAgentMutation = useMutation({
    mutationFn: (payload: {
      name: string;
      nickname: string;
      role: string;
      model: string;
      modelName: string;
      description: string;
      configuration: string;
      environmentId: string;
      organizationId: string;
      idleTimeout?: string;
      availability: AgentAvailability;
      defaultThread: AgentDefaultThread;
      finalMessage: AgentFinalMessage;
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

    if (!environmentId) {
      setEnvironmentError('Environment is required. It supplies the image and compute this agent runs with.');
      return;
    }
    setEnvironmentError('');

    const trimmedNickname = nickname.trim();
    const nicknameValidationError = getNicknameValidationError(trimmedNickname);
    if (nicknameValidationError) {
      setNicknameError(nicknameValidationError);
      return;
    }
    setNicknameError('');

    const trimmedConfig = configuration.trim();
    if (trimmedConfig) {
      try {
        JSON.parse(trimmedConfig);
      } catch {
        setConfigurationError('Invalid JSON format.');
        return;
      }
    }

    const trimmedIdleTimeout = idleTimeout.trim();
    if (trimmedIdleTimeout && !isValidGoDuration(trimmedIdleTimeout)) {
      setIdleTimeoutError('Enter a valid Go duration.');
      return;
    }

    setNameError('');
    setConfigurationError('');
    setIdleTimeoutError('');

    createAgentMutation.mutate({
      name: trimmedName,
      nickname: trimmedNickname,
      role: role.trim(),
      // The server rejects the reference the environment's mode has no namespace
      // for, so only the one the mode owns is sent.
      model: isNative || modelId === NO_MODEL ? '' : modelId,
      modelName: isNative ? modelName.trim() : '',
      description: description.trim(),
      configuration: trimmedConfig,
      environmentId,
      organizationId,
      ...(trimmedIdleTimeout ? { idleTimeout: trimmedIdleTimeout } : {}),
      availability,
      defaultThread,
      finalMessage,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <Button variant="link" asChild data-testid="agent-create-back">
          <NavLink to={`/organizations/${organizationId}/agents`}>← Back to Agents</NavLink>
        </Button>
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
            <Label htmlFor="agent-create-nickname">Nickname</Label>
            <Input
              id="agent-create-nickname"
              placeholder="support-agent"
              value={nickname}
              maxLength={NICKNAME_MAX_LENGTH}
              onChange={(event) => {
                setNickname(event.target.value);
                if (nicknameError) setNicknameError('');
              }}
              data-testid="agent-create-nickname"
            />
            {nicknameError ? (
              <p className="text-sm text-destructive" data-testid="agent-create-nickname-error">
                {nicknameError}
              </p>
            ) : null}
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
          {/* Before the model: which kind of model reference the agent can hold
              is this field's answer to give. */}
          <div className="space-y-2">
            <Label htmlFor="agent-create-environment">Environment</Label>
            <Select
              value={environmentId}
              onValueChange={(value) => {
                setEnvironmentId(value);
                // Each reference is meaningless in the other mode.
                setModelId('');
                setModelName('');
                if (environmentError) setEnvironmentError('');
              }}
            >
              <SelectTrigger id="agent-create-environment" data-testid="agent-create-environment">
                <SelectValue
                  placeholder={environmentsQuery.isPending ? 'Loading environments...' : 'Select environment'}
                />
              </SelectTrigger>
              <SelectContent>
                {environments.map((environment) => (
                  <SelectItem key={environment.meta?.id} value={environment.meta?.id ?? ''}>
                    {environment.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {environmentError ? (
              <p className="text-sm text-destructive" data-testid="agent-create-environment-error">
                {environmentError}
              </p>
            ) : null}
            {environments.length === 0 && !environmentsQuery.isPending ? (
              <p className="text-xs text-muted-foreground" data-testid="agent-create-environment-empty">
                No environments in this organization.{' '}
                <NavLink
                  to={`/organizations/${organizationId}/environments`}
                  className="text-primary hover:underline"
                >
                  Create one
                </NavLink>{' '}
                before creating an agent.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Supplies the images and compute this agent runs with, and the ENVs and egress rules
                attached to it.
              </p>
            )}
          </div>
          <div className="space-y-2" data-testid="agent-create-model">
            <Label htmlFor={isNative ? 'agent-create-model-name' : 'agent-create-model-select'}>
              Model
            </Label>
            {isNative ? (
              <>
                <Input
                  id="agent-create-model-name"
                  placeholder="claude-sonnet-4-5"
                  value={modelName}
                  onChange={(event) => setModelName(event.target.value)}
                  data-testid="agent-create-model-name"
                />
                <p className="text-xs text-muted-foreground">
                  A native environment has no platform catalog, so name the vendor&apos;s own model
                  and the agent CLI is pinned to it. Leave it empty to keep the CLI&apos;s default.
                </p>
              </>
            ) : (
              <>
                <Select
                  value={modelId}
                  onValueChange={(value) => setModelId(value)}
                  disabled={!environmentId || modelsQuery.isPending}
                >
                  <SelectTrigger id="agent-create-model-select" data-testid="agent-create-model-select">
                    <SelectValue
                      placeholder={
                        !environmentId
                          ? 'Select an environment first'
                          : modelsQuery.isPending
                            ? 'Loading models...'
                            : 'Select model'
                      }
                    />
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
                {!environmentId ? (
                  <p className="text-xs text-muted-foreground">
                    The environment decides where models come from — the platform catalog, or the
                    vendor the agent CLI addresses itself.
                  </p>
                ) : null}
              </>
            )}
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
            <Label htmlFor="agent-create-availability">Availability</Label>
            <Select
              value={String(availability)}
              onValueChange={(value) => setAvailability(Number(value) as AgentAvailability)}
            >
              <SelectTrigger id="agent-create-availability" data-testid="agent-create-availability">
                <SelectValue placeholder="Select availability" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={String(AgentAvailability.INTERNAL)}>Internal</SelectItem>
                <SelectItem value={String(AgentAvailability.PRIVATE)}>Private</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="agent-create-default-thread">Default Thread</Label>
            <Select
              value={String(defaultThread)}
              onValueChange={(value) => setDefaultThread(Number(value) as AgentDefaultThread)}
            >
              <SelectTrigger id="agent-create-default-thread" data-testid="agent-create-default-thread">
                <SelectValue placeholder="Select a default thread" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={String(AgentDefaultThread.ORIGIN)}>Originating thread</SelectItem>
                <SelectItem value={String(AgentDefaultThread.NONE)}>None</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Where a new instance's default thread comes from when nobody names one. The originating
              thread is the one that added the instance — the thread it owes an answer to.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="agent-create-final-message">Final Message</Label>
            <Select
              value={String(finalMessage)}
              onValueChange={(value) => setFinalMessage(Number(value) as AgentFinalMessage)}
            >
              <SelectTrigger id="agent-create-final-message" data-testid="agent-create-final-message">
                <SelectValue placeholder="Select a final message policy" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={String(AgentFinalMessage.DISCARD)}>Discard</SelectItem>
                <SelectItem value={String(AgentFinalMessage.DEFAULT_THREAD)}>
                  Post to default thread
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              What becomes of the text the agent CLI produces at the end of a turn. Discard it when the
              agent already sends its own messages, or it posts twice.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="agent-create-idle-timeout">Idle Timeout</Label>
            <Input
              id="agent-create-idle-timeout"
              placeholder="5m"
              value={idleTimeout}
              onChange={(event) => {
                setIdleTimeout(event.target.value);
                if (idleTimeoutError) setIdleTimeoutError('');
              }}
              data-testid="agent-create-idle-timeout"
            />
            {idleTimeoutError ? (
              <p className="text-sm text-destructive" data-testid="agent-create-idle-timeout-error">
                {idleTimeoutError}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">{GO_DURATION_HELP_TEXT}</p>
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
