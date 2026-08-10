import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentsClient, llmClient } from '@/api/client';
import { Button } from '@/components/ui/button';
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
import {
  AgentAvailability,
  AgentDefaultThread,
  AgentFinalMessage,
  LLMMode,
  type Agent,
} from '@/gen/agynio/api/agents/v1/agents_pb';
import { NO_MODEL } from '@/lib/constants';
import { GO_DURATION_HELP_TEXT, isValidGoDuration } from '@/lib/duration';
import {
  formatAgentAvailability,
  formatAgentDefaultThread,
  formatAgentFinalMessage,
} from '@/lib/format';
import { NICKNAME_MAX_LENGTH, getNicknameValidationError } from '@/lib/nickname';
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
  const [nickname, setNickname] = useState('');
  const [nicknameError, setNicknameError] = useState('');
  const [role, setRole] = useState('');
  const [modelId, setModelId] = useState(NO_MODEL);
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

  // The agent stores an id; the read view shows what a person recognises.
  const environmentName = (id: string) =>
    id ? (environments.find((environment) => environment.meta?.id === id)?.name ?? id) : '';

  const isNativeEnvironment = (id: string) =>
    environments.find((environment) => environment.meta?.id === id)?.llmMode ===
    LLMMode.LLM_MODE_NATIVE;

  // Which of the two model references is legal is the environment's to decide,
  // so the edited environment governs the field, not the saved one.
  const isNative = isNativeEnvironment(environmentId);

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
      modelName?: string;
      description?: string;
      configuration?: string;
      environmentId?: string;
      nickname?: string;
      idleTimeout?: string;
      availability?: AgentAvailability;
      defaultThread?: AgentDefaultThread;
      finalMessage?: AgentFinalMessage;
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
      setNickname(agent.nickname);
      setRole(agent.role);
      setModelId(agent.model || NO_MODEL);
      setModelName(agent.modelName);
      setDescription(agent.description);
      setEnvironmentId(agent.environmentId);
      setConfiguration(agent.configuration);
      setIdleTimeout(agent.idleTimeout ?? '');
      setAvailability(agent.availability || AgentAvailability.INTERNAL);
      setDefaultThread(agent.defaultThread || AgentDefaultThread.ORIGIN);
      setFinalMessage(agent.finalMessage || AgentFinalMessage.DISCARD);
      setNameError('');
      setEnvironmentError('');
      setConfigurationError('');
      setIdleTimeoutError('');
      setNicknameError('');
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

    setIdleTimeoutError('');

    if (!agentId) {
      toast.error('Missing agent ID.');
      return;
    }

    updateAgentMutation.mutate({
      id: agentId,
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
      ...(trimmedIdleTimeout ? { idleTimeout: trimmedIdleTimeout } : {}),
      availability,
      defaultThread,
      finalMessage,
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
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Nickname</div>
              <div className="text-sm text-foreground">
                {agent.nickname ? `@${agent.nickname}` : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Role</div>
              <div className="text-sm text-foreground">{agent.role || '—'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Model</div>
              {/* A native agent holds a vendor name instead of a catalog id. */}
              <div className="text-sm text-foreground" data-testid="agent-configuration-model-value">
                {agent.modelName || modelMap.get(agent.model)?.name || agent.model || '—'}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Description</div>
              <div className="text-sm text-foreground">{agent.description || '—'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Environment</div>
              {/* An agent predating environments has none, so it resolves to no
                  flavor and no runner. Say so rather than showing an em dash. */}
              <div
                className={agent.environmentId ? 'text-sm text-foreground' : 'text-sm text-destructive'}
                data-testid="agent-configuration-environment-value"
              >
                {environmentName(agent.environmentId) || 'Not set'}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Idle Timeout</div>
              <div className="text-sm text-foreground">{agent.idleTimeout || '—'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Availability</div>
              <div className="text-sm text-foreground">{formatAgentAvailability(agent.availability)}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Default Thread</div>
              <div className="text-sm text-foreground" data-testid="agent-configuration-default-thread-value">
                {formatAgentDefaultThread(agent.defaultThread)}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Final Message</div>
              <div className="text-sm text-foreground" data-testid="agent-configuration-final-message-value">
                {formatAgentFinalMessage(agent.finalMessage)}
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
              Update agent settings.
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
              <Label htmlFor="agent-configuration-nickname">Nickname</Label>
              <Input
                id="agent-configuration-nickname"
                value={nickname}
                maxLength={NICKNAME_MAX_LENGTH}
                placeholder="support-agent"
                onChange={(event) => {
                  setNickname(event.target.value);
                  if (nicknameError) setNicknameError('');
                }}
                data-testid="agent-configuration-nickname"
              />
              {nicknameError ? (
                <p className="text-sm text-destructive" data-testid="agent-configuration-nickname-error">
                  {nicknameError}
                </p>
              ) : null}
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
            {/* Before the model: which kind of model reference the agent can hold
                is this field's answer to give. */}
            <div className="space-y-2">
              <Label htmlFor="agent-configuration-environment">Environment</Label>
              <Select
                value={environmentId}
                onValueChange={(value) => {
                  // Each reference is meaningless in the other mode, so a repoint
                  // across modes starts the field over.
                  if (isNativeEnvironment(value) !== isNative) {
                    setModelId('');
                    setModelName('');
                  }
                  setEnvironmentId(value);
                  if (environmentError) setEnvironmentError('');
                }}
              >
                <SelectTrigger id="agent-configuration-environment" data-testid="agent-configuration-environment">
                  <SelectValue placeholder="Select environment" />
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
                <p className="text-sm text-destructive" data-testid="agent-configuration-environment-error">
                  {environmentError}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor={isNative ? 'agent-configuration-model-name' : 'agent-configuration-model'}>
                Model
              </Label>
              {isNative ? (
                <>
                  <Input
                    id="agent-configuration-model-name"
                    placeholder="claude-sonnet-4-5"
                    value={modelName}
                    onChange={(event) => setModelName(event.target.value)}
                    data-testid="agent-configuration-model-name"
                  />
                  <p className="text-xs text-muted-foreground">
                    A native environment has no platform catalog, so name the vendor&apos;s own model
                    and the agent CLI is pinned to it. Leave it empty to keep the CLI&apos;s default.
                  </p>
                </>
              ) : (
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
              )}
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
              <Label htmlFor="agent-configuration-availability">Availability</Label>
              <Select value={String(availability)} onValueChange={(value) => setAvailability(Number(value) as AgentAvailability)}>
                <SelectTrigger id="agent-configuration-availability" data-testid="agent-configuration-availability">
                  <SelectValue placeholder="Select availability" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={String(AgentAvailability.INTERNAL)}>Internal</SelectItem>
                  <SelectItem value={String(AgentAvailability.PRIVATE)}>Private</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-configuration-default-thread">Default Thread</Label>
              <Select
                value={String(defaultThread)}
                onValueChange={(value) => setDefaultThread(Number(value) as AgentDefaultThread)}
              >
                <SelectTrigger
                  id="agent-configuration-default-thread"
                  data-testid="agent-configuration-default-thread"
                >
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
              <Label htmlFor="agent-configuration-final-message">Final Message</Label>
              <Select
                value={String(finalMessage)}
                onValueChange={(value) => setFinalMessage(Number(value) as AgentFinalMessage)}
              >
                <SelectTrigger
                  id="agent-configuration-final-message"
                  data-testid="agent-configuration-final-message"
                >
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
              <Label htmlFor="agent-configuration-idle-timeout">Idle Timeout</Label>
              <Input
                id="agent-configuration-idle-timeout"
                value={idleTimeout}
                onChange={(event) => {
                  setIdleTimeout(event.target.value);
                  if (idleTimeoutError) setIdleTimeoutError('');
                }}
                placeholder="5m"
                data-testid="agent-configuration-idle-timeout"
              />
              {idleTimeoutError ? (
                <p className="text-sm text-destructive" data-testid="agent-configuration-idle-timeout-error">
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
              testId="agent-configuration-config"
            />
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
