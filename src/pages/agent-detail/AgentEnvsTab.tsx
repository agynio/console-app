import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentsClient, secretsClient } from '@/api/client';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
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
import type { Env } from '@/gen/agynio/api/agents/v1/agents_pb';
import type { Secret } from '@/gen/agynio/api/secrets/v1/secrets_pb';
import { formatDateOnly } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

type AgentEnvsTabProps = {
  agentId: string;
  organizationId: string;
};

type SourceType = 'value' | 'secret';

export function AgentEnvsTab({ agentId, organizationId }: AgentEnvsTabProps) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sourceType, setSourceType] = useState<SourceType>('value');
  const [plainValue, setPlainValue] = useState('');
  const [secretId, setSecretId] = useState('');
  const [nameError, setNameError] = useState('');
  const [sourceError, setSourceError] = useState('');

  const envsQuery = useQuery({
    queryKey: ['envs', agentId, 'list'],
    queryFn: () => agentsClient.listEnvs({ agentId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(agentId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const secretsQuery = useQuery({
    queryKey: ['secrets', organizationId, 'list'],
    queryFn: () =>
      secretsClient.listSecrets({
        organizationId,
        pageSize: MAX_PAGE_SIZE,
        pageToken: '',
        secretProviderId: '',
      }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const secretMap = useMemo(
    () => new Map((secretsQuery.data?.secrets ?? []).map((secret) => [secret.meta?.id ?? '', secret])),
    [secretsQuery.data?.secrets],
  );

  const envs = envsQuery.data?.envs ?? [];

  const createEnvMutation = useMutation({
    mutationFn: (payload: {
      name: string;
      description: string;
      target: { case: 'agentId'; value: string };
      source: { case: 'value'; value: string } | { case: 'secretId'; value: string };
    }) => agentsClient.createEnv(payload),
    onSuccess: () => {
      toast.success('Environment variable created.');
      void queryClient.invalidateQueries({ queryKey: ['envs', agentId, 'list'] });
      setCreateOpen(false);
      setName('');
      setDescription('');
      setSourceType('value');
      setPlainValue('');
      setSecretId('');
      setNameError('');
      setSourceError('');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create environment variable.');
    },
  });

  const resolveSource = (env: Env, secrets: Map<string, Secret>) => {
    if (env.source.case === 'value') {
      return `value: ${env.source.value}`;
    }
    if (env.source.case === 'secretId') {
      const secretName = secrets.get(env.source.value)?.title ?? env.source.value;
      return `secret: ${secretName}`;
    }
    return '—';
  };

  const handleCreate = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError('Name is required.');
    }
    if (sourceType === 'value' && !plainValue.trim()) {
      setSourceError('Value is required.');
    }
    if (sourceType === 'secret' && !secretId) {
      setSourceError('Select a secret.');
    }
    if (!trimmedName) return;
    if (sourceType === 'value' && !plainValue.trim()) return;
    if (sourceType === 'secret' && !secretId) return;

    const source =
      sourceType === 'value'
        ? ({ case: 'value', value: plainValue.trim() } as const)
        : ({ case: 'secretId', value: secretId } as const);

    createEnvMutation.mutate({
      name: trimmedName,
      description: description.trim(),
      target: { case: 'agentId', value: agentId },
      source,
    });
  };

  const handleSourceChange = (nextType: SourceType) => {
    setSourceType(nextType);
    setSourceError('');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[var(--agyn-dark)]" data-testid="agent-envs-heading">
            ENVs
          </h3>
          <p className="text-sm text-[var(--agyn-gray)]">Agent environment variables.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)} data-testid="agent-envs-create">
          Add ENV
        </Button>
      </div>
      {envsQuery.isPending ? <div className="text-sm text-[var(--agyn-gray)]">Loading envs...</div> : null}
      {envsQuery.isError ? <div className="text-sm text-[var(--agyn-gray)]">Failed to load envs.</div> : null}
      {envs.length === 0 && !envsQuery.isPending ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="agent-envs-empty">
          <CardContent className="py-10 text-center text-sm text-[var(--agyn-gray)]">
            No environment variables configured.
          </CardContent>
        </Card>
      ) : null}
      {envs.length > 0 ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="agent-envs-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-[var(--agyn-gray)] md:grid-cols-[1fr_2fr_1fr]"
              data-testid="agent-envs-header"
            >
              <span>Name</span>
              <span>Source</span>
              <span>Created</span>
            </div>
            <div className="divide-y divide-[var(--agyn-border-subtle)]">
              {envs.map((env) => (
                <div
                  key={env.meta?.id ?? env.name}
                  className="grid items-center gap-2 px-6 py-4 text-sm text-[var(--agyn-dark)] md:grid-cols-[1fr_2fr_1fr]"
                  data-testid="agent-env-row"
                >
                  <div>
                    <div className="font-medium" data-testid="agent-env-name">
                      {env.name}
                    </div>
                    <div className="text-xs text-[var(--agyn-gray)]" data-testid="agent-env-description">
                      {env.description || '—'}
                    </div>
                  </div>
                  <span className="text-xs text-[var(--agyn-gray)]" data-testid="agent-env-source">
                    {resolveSource(env, secretMap)}
                  </span>
                  <span className="text-xs text-[var(--agyn-gray)]" data-testid="agent-env-created">
                    {formatDateOnly(env.meta?.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent data-testid="agent-envs-create-dialog">
          <DialogHeader>
            <DialogTitle data-testid="agent-envs-create-title">Add environment variable</DialogTitle>
            <DialogDescription data-testid="agent-envs-create-description">
              Define agent-level environment variables.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              label="Name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (nameError) setNameError('');
              }}
              error={nameError}
              data-testid="agent-envs-create-name"
            />
            <Input
              label="Description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              data-testid="agent-envs-create-description-input"
            />
            <div className="space-y-2">
              <div className="text-sm text-[var(--agyn-dark)]">Source type</div>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm text-[var(--agyn-dark)]">
                  <input
                    type="radio"
                    name="agent-env-source"
                    value="value"
                    checked={sourceType === 'value'}
                    onChange={() => handleSourceChange('value')}
                  />
                  Plain value
                </label>
                <label className="flex items-center gap-2 text-sm text-[var(--agyn-dark)]">
                  <input
                    type="radio"
                    name="agent-env-source"
                    value="secret"
                    checked={sourceType === 'secret'}
                    onChange={() => handleSourceChange('secret')}
                  />
                  Secret reference
                </label>
              </div>
            </div>
            {sourceType === 'value' ? (
              <Input
                label="Value"
                value={plainValue}
                onChange={(event) => {
                  setPlainValue(event.target.value);
                  if (sourceError) setSourceError('');
                }}
                error={sourceError}
                data-testid="agent-envs-create-value"
              />
            ) : (
              <div className="space-y-2">
                <div className="text-sm text-[var(--agyn-dark)]">Secret</div>
                <Select
                  value={secretId}
                  onValueChange={(value) => {
                    setSecretId(value);
                    if (sourceError) setSourceError('');
                  }}
                >
                  <SelectTrigger data-testid="agent-envs-create-secret">
                    <SelectValue placeholder="Select secret" />
                  </SelectTrigger>
                  <SelectContent>
                    {(secretsQuery.data?.secrets ?? [])
                      .filter((secret) => Boolean(secret.meta?.id))
                      .map((secret) => (
                        <SelectItem key={secret.meta?.id ?? secret.title} value={secret.meta?.id ?? ''}>
                          {secret.title || 'Unnamed secret'}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {sourceError ? <div className="text-sm text-red-500">{sourceError}</div> : null}
              </div>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="agent-envs-create-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreate}
              disabled={createEnvMutation.isPending}
              data-testid="agent-envs-create-submit"
            >
              {createEnvMutation.isPending ? 'Adding...' : 'Add ENV'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
