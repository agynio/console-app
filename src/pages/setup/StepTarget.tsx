import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ConnectError } from '@connectrpc/connect';
import { agentsClient, chatClient } from '@/api/client';
import { CodeIcon, MessageCircleIcon, SearchIcon } from 'lucide-react';
import { ChoiceCard } from '@/components/ChoiceCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AgentAvailability,
  AgentDefaultThread,
  AgentFinalMessage,
} from '@/gen/agynio/api/agents/v1/agents_pb';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import type { SetupPath } from './catalog';
import { availableName, nicknameFrom } from './catalog';

type StepTargetProps = {
  organizationId: string;
  path: SetupPath;
  environmentId: string;
  environmentName: string;
  llmMode: 'platform' | 'native';
  modelId: string;
  modelName: string;
  onDone: (values: {
    agentId?: string;
    agentName?: string;
    chatId?: string;
    sandboxId?: string;
    sandboxName?: string;
  }) => void;
};

/**
 * The load-bearing field of the agent form. An agent with an empty behavioral
 * configuration answers its first question with nothing in particular, and the
 * first conversation is the whole payoff of this path.
 */
const STARTERS = [
  {
    id: 'assistant',
    label: 'General assistant',
    icon: MessageCircleIcon,
    description: 'Answers questions, works through small tasks, and says what it did.',
    systemPrompt:
      'You are a helpful teammate working in a shared workspace. Answer questions directly and take on small tasks end to end. When you use the workspace, say what you changed and why. Ask before doing anything destructive.',
  },
  {
    id: 'reviewer',
    label: 'Code reviewer',
    icon: CodeIcon,
    description: 'Reads a change, reports what is wrong with it, and stops there.',
    systemPrompt:
      'You review code. Given a change, report correctness problems, missing cases, and risky assumptions, most serious first, each with the file and line it is in. Say plainly when a change looks fine. Do not rewrite the code unless you are asked to.',
  },
  {
    id: 'researcher',
    label: 'Research assistant',
    icon: SearchIcon,
    description: 'Digs through material and comes back with a short, sourced answer.',
    systemPrompt:
      'You research questions and report back. Gather what you can from the material available to you, then answer in a few sentences with the specific sources you used. Say what you could not find rather than filling the gap.',
  },
];

export function StepTarget({
  organizationId,
  path,
  environmentId,
  environmentName,
  llmMode,
  modelId,
  modelName,
  onDone,
}: StepTargetProps) {
  const [name, setName] = useState(path === 'agent' ? 'Assistant' : 'sandbox');
  const [starterId, setStarterId] = useState(STARTERS[0].id);
  const [prompt, setPrompt] = useState(STARTERS[0].systemPrompt);
  const [error, setError] = useState('');

  // A preset fills the field; what gets created is whatever the field holds.
  const selectStarter = (id: string) => {
    setStarterId(id);
    setPrompt(STARTERS.find((starter) => starter.id === id)?.systemPrompt ?? '');
    setError('');
  };

  const agentsQuery = useQuery({
    queryKey: ['agents', organizationId, 'setup'],
    queryFn: () => agentsClient.listAgents({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId) && path === 'agent',
  });

  const existingAgents = useMemo(() => agentsQuery.data?.agents ?? [], [agentsQuery.data?.agents]);
  const takenNames = useMemo(() => existingAgents.map((agent) => agent.name), [existingAgents]);
  const takenNicknames = useMemo(
    () => existingAgents.map((agent) => agent.nickname),
    [existingAgents],
  );

  const createAgent = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('A name is required.');
      const instructions = prompt.trim();
      if (!instructions) throw new Error('Instructions are required.');

      const agentName = availableName(takenNames, trimmed);
      const created = await agentsClient.createAgent({
        organizationId,
        name: agentName,
        // Required before the agent can be instantiated, and the wizard asks for
        // one field, not two.
        nickname: nicknameFrom(agentName, takenNicknames),
        environmentId,
        // In native mode there is no platform model, so the agent takes the
        // CLI's own default rather than pinning a vendor model name.
        model: llmMode === 'platform' ? modelId : '',
        configuration: JSON.stringify({ system_prompt: instructions }, null, 2),
        availability: AgentAvailability.INTERNAL,
        defaultThread: AgentDefaultThread.ORIGIN,
        // Without this the agent's reply never reaches the conversation it was
        // asked in, which is the whole point of the path this run is on.
        finalMessage: AgentFinalMessage.DEFAULT_THREAD,
      });
      const agentId = created.agent?.meta?.id ?? '';
      if (!agentId) throw new Error('Agent created but missing ID.');

      // Opened here so the overlay lands on a conversation rather than on Chat's
      // home. A failure is not worth blocking the finish for — the switcher then
      // sends the user to Chat itself.
      let chatId = '';
      try {
        const chat = await chatClient.createChat({ organizationId, participantIds: [agentId] });
        chatId = chat.chat?.id ?? '';
      } catch {
        chatId = '';
      }

      return { agentId, agentName: created.agent?.name ?? agentName, chatId };
    },
    onSuccess: (values) => onDone(values),
    onError: (cause) => {
      setError(cause instanceof ConnectError ? cause.message : (cause as Error).message);
    },
  });

  const createSandbox = useMutation({
    mutationFn: async () => {
      const created = await agentsClient.createSandbox({
        organizationId,
        environmentId,
        name: name.trim() || undefined,
      });
      const sandboxId = created.sandbox?.meta?.id ?? '';
      if (!sandboxId) throw new Error('Sandbox created but missing ID.');

      // Started here: landing on a card with a Start button and a wait is a weak
      // ending to a two-minute flow.
      await agentsClient.ensureSandboxRunning({ id: sandboxId });
      return { sandboxId, sandboxName: created.sandbox?.name ?? name.trim() };
    },
    onSuccess: (values) => onDone(values),
    onError: (cause) => {
      setError(cause instanceof ConnectError ? cause.message : (cause as Error).message);
    },
  });

  if (path === 'sandbox') {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Your sandbox</h2>
          <p className="text-sm text-muted-foreground">
            A workload you drive yourself, running the environment you just made.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="setup-sandbox-name">Name</Label>
          <Input
            id="setup-sandbox-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            data-testid="setup-sandbox-name"
          />
        </div>

        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Runs in <span className="text-foreground">{environmentName}</span>. It stops on its own after
          30 minutes with nobody attached, and comes back on the same disks.
        </div>

        {error ? (
          <p className="text-sm text-destructive" data-testid="setup-target-error">
            {error}
          </p>
        ) : null}

        <Button
          onClick={() => {
            setError('');
            createSandbox.mutate();
          }}
          disabled={createSandbox.isPending}
          data-testid="setup-target-submit"
        >
          {createSandbox.isPending ? 'Starting…' : 'Create and start'}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Your agent</h2>
        <p className="text-sm text-muted-foreground">
          Everything else about it — its tools, its credentials, who may talk to it — is editable
          afterwards.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="setup-agent-name">Name</Label>
            <Input
              id="setup-agent-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              data-testid="setup-agent-name"
            />
          </div>

          <div className="space-y-2">
            <Label>What it does</Label>
            <div className="grid gap-2">
              {STARTERS.map((starter) => (
                <ChoiceCard
                  key={starter.id}
                  title={starter.label}
                  description={null}
                  icon={starter.icon}
                  selected={starterId === starter.id}
                  onSelect={() => selectStarter(starter.id)}
                  disabled={createAgent.isPending}
                  data-testid={`setup-agent-starter-${starter.id}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* The only thing the choice on the left actually changes, so it is on
              screen rather than written into a JSON blob nobody sees. */}
          <div className="space-y-2">
            <Label htmlFor="setup-agent-prompt">Instructions</Label>
            <Textarea
              id="setup-agent-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={7}
              disabled={createAgent.isPending}
              data-testid="setup-agent-prompt"
            />
            <p className="text-xs text-muted-foreground">
              Edit freely — this is the agent&apos;s system prompt.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <dl className="text-sm" data-testid="setup-agent-summary">
              <div className="flex items-baseline justify-between gap-3 pb-2">
                <dt className="text-muted-foreground">Environment</dt>
                <dd className="text-foreground">{environmentName}</dd>
              </div>
              {llmMode === 'platform' ? (
                <div className="flex items-baseline justify-between gap-3 border-t border-border py-2">
                  <dt className="text-muted-foreground">Model</dt>
                  <dd className="truncate font-mono text-xs text-foreground" title={modelName}>
                    {modelName}
                  </dd>
                </div>
              ) : null}
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">
              Anyone in the organization can talk to it.
            </p>
          </div>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-destructive" data-testid="setup-target-error">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-4">
        <Button
          onClick={() => {
            setError('');
            createAgent.mutate();
          }}
          disabled={createAgent.isPending}
          data-testid="setup-target-submit"
        >
          {createAgent.isPending ? 'Creating…' : 'Create agent'}
        </Button>
        <span className="text-sm text-muted-foreground">Next: a conversation with it</span>
      </div>
    </div>
  );
}
