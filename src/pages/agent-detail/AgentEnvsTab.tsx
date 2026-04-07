import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentsClient, secretsClient } from '@/api/client';
import { SortableHeader } from '@/components/SortableHeader';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { useListControls } from '@/hooks/useListControls';
import { formatDateOnly, timestampToMillis } from '@/lib/format';
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
  const [editOpen, setEditOpen] = useState(false);
  const [editEnvId, setEditEnvId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSourceType, setEditSourceType] = useState<SourceType>('value');
  const [editPlainValue, setEditPlainValue] = useState('');
  const [editSecretId, setEditSecretId] = useState('');
  const [editNameError, setEditNameError] = useState('');
  const [editSourceError, setEditSourceError] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

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

  const secretMap = useMemo(() => {
    const secrets = secretsQuery.data?.secrets ?? [];
    return new Map(
      secrets.flatMap((secret) => {
        const secretId = secret.meta?.id;
        return secretId ? ([[secretId, secret]] as const) : [];
      }),
    );
  }, [secretsQuery.data?.secrets]);

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

  const updateEnvMutation = useMutation({
    mutationFn: (payload: { id: string; name?: string; description?: string; value?: string; secretId?: string }) =>
      agentsClient.updateEnv(payload),
    onSuccess: () => {
      toast.success('Environment variable updated.');
      void queryClient.invalidateQueries({ queryKey: ['envs', agentId, 'list'] });
      setEditOpen(false);
      setEditEnvId(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update environment variable.');
    },
  });

  const deleteEnvMutation = useMutation({
    mutationFn: (envId: string) => agentsClient.deleteEnv({ id: envId }),
    onSuccess: () => {
      toast.success('Environment variable deleted.');
      void queryClient.invalidateQueries({ queryKey: ['envs', agentId, 'list'] });
      setDeleteTargetId(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete environment variable.');
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

  const listControls = useListControls({
    items: envs,
    searchFields: [
      (env) => env.name,
      (env) => env.description,
      (env) => resolveSource(env, secretMap),
      (env) => formatDateOnly(env.meta?.createdAt),
    ],
    sortOptions: {
      name: (env) => env.name,
      source: (env) => resolveSource(env, secretMap),
      created: (env) => timestampToMillis(env.meta?.createdAt),
    },
    defaultSortKey: 'name',
  });

  const visibleEnvs = listControls.filteredItems;
  const hasSearch = listControls.searchTerm.trim().length > 0;

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

  const handleEditSourceChange = (nextType: SourceType) => {
    setEditSourceType(nextType);
    setEditSourceError('');
  };

  const handleEditOpen = (env: Env) => {
    const envId = env.meta?.id;
    if (!envId) {
      toast.error('Missing environment variable ID.');
      return;
    }
    setEditEnvId(envId);
    setEditName(env.name);
    setEditDescription(env.description);
    if (env.source.case === 'secretId') {
      setEditSourceType('secret');
      setEditSecretId(env.source.value);
      setEditPlainValue('');
    } else if (env.source.case === 'value') {
      setEditSourceType('value');
      setEditPlainValue(env.source.value);
      setEditSecretId('');
    } else {
      setEditSourceType('value');
      setEditPlainValue('');
      setEditSecretId('');
    }
    setEditNameError('');
    setEditSourceError('');
    setEditOpen(true);
  };

  const handleEditSave = () => {
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setEditNameError('Name is required.');
    }
    if (editSourceType === 'value' && !editPlainValue.trim()) {
      setEditSourceError('Value is required.');
    }
    if (editSourceType === 'secret' && !editSecretId) {
      setEditSourceError('Select a secret.');
    }
    if (!trimmedName) return;
    if (editSourceType === 'value' && !editPlainValue.trim()) return;
    if (editSourceType === 'secret' && !editSecretId) return;
    if (!editEnvId) {
      toast.error('Missing environment variable ID.');
      return;
    }

    updateEnvMutation.mutate({
      id: editEnvId,
      name: trimmedName,
      description: editDescription.trim(),
      ...(editSourceType === 'value'
        ? { value: editPlainValue.trim() }
        : { secretId: editSecretId }),
    });
  };

  const handleEditOpenChange = (open: boolean) => {
    setEditOpen(open);
    if (!open) {
      setEditEnvId(null);
      setEditName('');
      setEditDescription('');
      setEditSourceType('value');
      setEditPlainValue('');
      setEditSecretId('');
      setEditNameError('');
      setEditSourceError('');
    }
  };

  const handleDeleteOpen = (env: Env) => {
    const envId = env.meta?.id;
    if (!envId) {
      toast.error('Missing environment variable ID.');
      return;
    }
    setDeleteTargetId(envId);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground" data-testid="agent-envs-heading">
            ENVs
          </h3>
          <p className="text-sm text-muted-foreground">Agent environment variables.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)} data-testid="agent-envs-create">
          Add ENV
        </Button>
      </div>
      <div className="max-w-sm">
        <Input
          placeholder="Search envs..."
          value={listControls.searchTerm}
          onChange={(event) => listControls.setSearchTerm(event.target.value)}
          data-testid="list-search"
        />
      </div>
      {envsQuery.isPending ? <div className="text-sm text-muted-foreground">Loading envs...</div> : null}
      {envsQuery.isError ? <div className="text-sm text-muted-foreground">Failed to load envs.</div> : null}
      {envs.length === 0 && !envsQuery.isPending ? (
        <Card className="border-border" data-testid="agent-envs-empty">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No environment variables configured.
          </CardContent>
        </Card>
      ) : null}
      {envs.length > 0 ? (
        <Card className="border-border" data-testid="agent-envs-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[1fr_2fr_1fr_140px]"
              data-testid="agent-envs-header"
            >
              <SortableHeader
                label="Name"
                sortKey="name"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Source"
                sortKey="source"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Created"
                sortKey="created"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-border">
            {visibleEnvs.length === 0 ? (
              <div className="px-6 py-6 text-sm text-muted-foreground">
                {hasSearch ? 'No results found.' : 'No environment variables configured.'}
              </div>
            ) : (
              visibleEnvs.map((env) => (
                <div
                  key={env.meta?.id ?? env.name}
                  className="grid items-center gap-2 px-6 py-4 text-sm text-foreground md:grid-cols-[1fr_2fr_1fr_140px]"
                  data-testid="agent-env-row"
                >
                  <div>
                    <div className="font-medium" data-testid="agent-env-name">
                      {env.name}
                    </div>
                    <div className="text-xs text-muted-foreground" data-testid="agent-env-description">
                      {env.description || '—'}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground" data-testid="agent-env-source">
                    {resolveSource(env, secretMap)}
                  </span>
                  <span className="text-xs text-muted-foreground" data-testid="agent-env-created">
                    {formatDateOnly(env.meta?.createdAt)}
                  </span>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditOpen(env)}
                      data-testid="agent-env-edit"
                    >
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteOpen(env)}
                      data-testid="agent-env-delete"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))
            )}
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
            <div className="space-y-2">
              <Label htmlFor="agent-envs-create-name">Name</Label>
              <Input
                id="agent-envs-create-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (nameError) setNameError('');
                }}
                data-testid="agent-envs-create-name"
              />
              {nameError && <p className="text-sm text-destructive">{nameError}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-envs-create-description-input">Description</Label>
              <Input
                id="agent-envs-create-description-input"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                data-testid="agent-envs-create-description-input"
              />
            </div>
            <div className="space-y-2">
              <Label>Source type</Label>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="radio"
                    name="agent-env-source"
                    value="value"
                    checked={sourceType === 'value'}
                    onChange={() => handleSourceChange('value')}
                  />
                  Plain value
                </label>
                <label className="flex items-center gap-2 text-sm text-foreground">
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
              <div className="space-y-2">
                <Label htmlFor="agent-envs-create-value">Value</Label>
                <Input
                  id="agent-envs-create-value"
                  value={plainValue}
                  onChange={(event) => {
                    setPlainValue(event.target.value);
                    if (sourceError) setSourceError('');
                  }}
                  data-testid="agent-envs-create-value"
                />
                {sourceError && <p className="text-sm text-destructive">{sourceError}</p>}
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="agent-envs-create-secret">Secret</Label>
                <Select
                  value={secretId}
                  onValueChange={(value) => {
                    setSecretId(value);
                    if (sourceError) setSourceError('');
                  }}
                >
                  <SelectTrigger id="agent-envs-create-secret" data-testid="agent-envs-create-secret">
                    <SelectValue placeholder="Select secret" />
                  </SelectTrigger>
                  <SelectContent>
                    {(secretsQuery.data?.secrets ?? []).map((secret) => {
                      const secretValue = secret.meta?.id;
                      if (!secretValue) return null;
                      return (
                        <SelectItem key={secretValue} value={secretValue}>
                          {secret.title || 'Unnamed secret'}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {sourceError ? <p className="text-sm text-destructive">{sourceError}</p> : null}
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
      <Dialog open={editOpen} onOpenChange={handleEditOpenChange}>
        <DialogContent data-testid="agent-envs-edit-dialog">
          <DialogHeader>
            <DialogTitle data-testid="agent-envs-edit-title">Edit environment variable</DialogTitle>
            <DialogDescription data-testid="agent-envs-edit-description">
              Update agent-level environment variables.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agent-envs-edit-name">Name</Label>
              <Input
                id="agent-envs-edit-name"
                value={editName}
                onChange={(event) => {
                  setEditName(event.target.value);
                  if (editNameError) setEditNameError('');
                }}
                data-testid="agent-envs-edit-name"
              />
              {editNameError && <p className="text-sm text-destructive">{editNameError}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-envs-edit-description-input">Description</Label>
              <Input
                id="agent-envs-edit-description-input"
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
                data-testid="agent-envs-edit-description-input"
              />
            </div>
            <div className="space-y-2">
              <Label>Source type</Label>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="radio"
                    name="agent-env-edit-source"
                    value="value"
                    checked={editSourceType === 'value'}
                    onChange={() => handleEditSourceChange('value')}
                  />
                  Plain value
                </label>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="radio"
                    name="agent-env-edit-source"
                    value="secret"
                    checked={editSourceType === 'secret'}
                    onChange={() => handleEditSourceChange('secret')}
                  />
                  Secret reference
                </label>
              </div>
            </div>
            {editSourceType === 'value' ? (
              <div className="space-y-2">
                <Label htmlFor="agent-envs-edit-value">Value</Label>
                <Input
                  id="agent-envs-edit-value"
                  value={editPlainValue}
                  onChange={(event) => {
                    setEditPlainValue(event.target.value);
                    if (editSourceError) setEditSourceError('');
                  }}
                  data-testid="agent-envs-edit-value"
                />
                {editSourceError && <p className="text-sm text-destructive">{editSourceError}</p>}
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="agent-envs-edit-secret">Secret</Label>
                <Select
                  value={editSecretId}
                  onValueChange={(value) => {
                    setEditSecretId(value);
                    if (editSourceError) setEditSourceError('');
                  }}
                >
                  <SelectTrigger id="agent-envs-edit-secret" data-testid="agent-envs-edit-secret">
                    <SelectValue placeholder="Select secret" />
                  </SelectTrigger>
                  <SelectContent>
                    {(secretsQuery.data?.secrets ?? []).map((secret) => {
                      const secretValue = secret.meta?.id;
                      if (!secretValue) return null;
                      return (
                        <SelectItem key={secretValue} value={secretValue}>
                          {secret.title || 'Unnamed secret'}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {editSourceError ? <p className="text-sm text-destructive">{editSourceError}</p> : null}
              </div>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="agent-envs-edit-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={handleEditSave}
              disabled={updateEnvMutation.isPending}
              data-testid="agent-envs-edit-submit"
            >
              {updateEnvMutation.isPending ? 'Saving...' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(deleteTargetId)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTargetId(null);
          }
        }}
        title="Delete environment variable"
        description="This action permanently removes the environment variable."
        confirmLabel="Delete environment variable"
        variant="danger"
        onConfirm={() => {
          if (deleteTargetId) {
            deleteEnvMutation.mutate(deleteTargetId);
          }
        }}
        isPending={deleteEnvMutation.isPending}
      />
    </div>
  );
}
