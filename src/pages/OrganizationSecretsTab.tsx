import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { secretsClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Input } from '@/components/ui/input';
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
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Secret } from '@/gen/agynio/api/secrets/v1/secrets_pb';
import { formatDateOnly } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

export function OrganizationSecretsTab() {
  const { id } = useParams();
  const organizationId = id ?? '';
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createProviderId, setCreateProviderId] = useState('');
  const [createRemoteName, setCreateRemoteName] = useState('');
  const [createTitleError, setCreateTitleError] = useState('');
  const [createProviderError, setCreateProviderError] = useState('');
  const [createRemoteError, setCreateRemoteError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editSecretId, setEditSecretId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editProviderId, setEditProviderId] = useState('');
  const [editRemoteName, setEditRemoteName] = useState('');
  const [editTitleError, setEditTitleError] = useState('');
  const [editProviderError, setEditProviderError] = useState('');
  const [editRemoteError, setEditRemoteError] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const providersQuery = useQuery({
    queryKey: ['secrets', organizationId, 'providers'],
    queryFn: () => secretsClient.listSecretProviders({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60 * 1000,
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
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const createSecretMutation = useMutation({
    mutationFn: (payload: {
      title: string;
      description: string;
      secretProviderId: string;
      remoteName: string;
      organizationId: string;
    }) => secretsClient.createSecret(payload),
    onSuccess: () => {
      toast.success('Secret created.');
      void queryClient.invalidateQueries({ queryKey: ['secrets', organizationId, 'list'] });
      setCreateOpen(false);
      setCreateTitle('');
      setCreateDescription('');
      setCreateProviderId('');
      setCreateRemoteName('');
      setCreateTitleError('');
      setCreateProviderError('');
      setCreateRemoteError('');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create secret.');
    },
  });

  const updateSecretMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      title?: string;
      description?: string;
      secretProviderId?: string;
      remoteName?: string;
    }) => secretsClient.updateSecret(payload),
    onSuccess: () => {
      toast.success('Secret updated.');
      void queryClient.invalidateQueries({ queryKey: ['secrets', organizationId, 'list'] });
      setEditOpen(false);
      setEditSecretId(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update secret.');
    },
  });

  const deleteSecretMutation = useMutation({
    mutationFn: (secretId: string) => secretsClient.deleteSecret({ id: secretId }),
    onSuccess: () => {
      toast.success('Secret deleted.');
      void queryClient.invalidateQueries({ queryKey: ['secrets', organizationId, 'list'] });
      setDeleteTargetId(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete secret.');
    },
  });

  const handleCreate = () => {
    const trimmedTitle = createTitle.trim();
    const trimmedRemote = createRemoteName.trim();
    let hasError = false;

    if (!trimmedTitle) {
      setCreateTitleError('Title is required.');
      hasError = true;
    } else if (createTitleError) {
      setCreateTitleError('');
    }

    if (!createProviderId) {
      setCreateProviderError('Select a provider.');
      hasError = true;
    } else if (createProviderError) {
      setCreateProviderError('');
    }

    if (!trimmedRemote) {
      setCreateRemoteError('Remote name is required.');
      hasError = true;
    } else if (createRemoteError) {
      setCreateRemoteError('');
    }

    if (hasError) return;

    createSecretMutation.mutate({
      title: trimmedTitle,
      description: createDescription.trim(),
      secretProviderId: createProviderId,
      remoteName: trimmedRemote,
      organizationId,
    });
  };

  const handleCreateOpenChange = (open: boolean) => {
    setCreateOpen(open);
    if (!open) {
      setCreateTitle('');
      setCreateDescription('');
      setCreateProviderId('');
      setCreateRemoteName('');
      setCreateTitleError('');
      setCreateProviderError('');
      setCreateRemoteError('');
    }
  };

  const handleEditOpen = (secret: Secret) => {
    const secretId = secret.meta?.id;
    if (!secretId) {
      toast.error('Missing secret ID.');
      return;
    }
    setEditSecretId(secretId);
    setEditTitle(secret.title);
    setEditDescription(secret.description);
    setEditProviderId(secret.secretProviderId);
    setEditRemoteName(secret.remoteName);
    setEditTitleError('');
    setEditProviderError('');
    setEditRemoteError('');
    setEditOpen(true);
  };

  const handleEditSave = () => {
    const trimmedTitle = editTitle.trim();
    const trimmedRemote = editRemoteName.trim();
    let hasError = false;

    if (!trimmedTitle) {
      setEditTitleError('Title is required.');
      hasError = true;
    } else if (editTitleError) {
      setEditTitleError('');
    }

    if (!editProviderId) {
      setEditProviderError('Select a provider.');
      hasError = true;
    } else if (editProviderError) {
      setEditProviderError('');
    }

    if (!trimmedRemote) {
      setEditRemoteError('Remote name is required.');
      hasError = true;
    } else if (editRemoteError) {
      setEditRemoteError('');
    }

    if (hasError) return;
    if (!editSecretId) {
      toast.error('Missing secret ID.');
      return;
    }

    updateSecretMutation.mutate({
      id: editSecretId,
      title: trimmedTitle,
      description: editDescription.trim(),
      secretProviderId: editProviderId,
      remoteName: trimmedRemote,
    });
  };

  const handleEditOpenChange = (open: boolean) => {
    setEditOpen(open);
    if (!open) {
      setEditSecretId(null);
      setEditTitle('');
      setEditDescription('');
      setEditProviderId('');
      setEditRemoteName('');
      setEditTitleError('');
      setEditProviderError('');
      setEditRemoteError('');
    }
  };

  const handleDeleteOpen = (secret: Secret) => {
    const secretId = secret.meta?.id;
    if (!secretId) {
      toast.error('Missing secret ID.');
      return;
    }
    setDeleteTargetId(secretId);
  };

  const providerMap = useMemo(() => {
    const providers = providersQuery.data?.secretProviders ?? [];
    return new Map(
      providers.flatMap((provider) => {
        const providerId = provider.meta?.id;
        return providerId ? ([[providerId, provider]] as const) : [];
      }),
    );
  }, [providersQuery.data?.secretProviders]);

  const isLoading = providersQuery.isPending || secretsQuery.isPending;
  const isError = providersQuery.isError || secretsQuery.isError;

  const secrets = secretsQuery.data?.secrets ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground" data-testid="organization-secrets-heading">
            Secrets
          </h3>
          <p className="text-sm text-muted-foreground">Manage organization secrets.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleCreateOpenChange(true)}
          data-testid="organization-secrets-create"
        >
          Add secret
        </Button>
      </div>
      {isLoading ? <div className="text-sm text-muted-foreground">Loading secrets...</div> : null}
      {isError ? <div className="text-sm text-muted-foreground">Failed to load secrets.</div> : null}
      {secrets.length === 0 && !isLoading ? (
        <Card className="border-border" data-testid="secrets-empty">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No secrets configured.
          </CardContent>
        </Card>
      ) : null}
      {secrets.length > 0 ? (
        <Card className="border-border" data-testid="secrets-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[2fr_1fr_1fr_1fr_140px]"
              data-testid="secrets-header"
            >
              <span>Title</span>
              <span>Provider</span>
              <span>Remote Name</span>
              <span>Created</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-border">
              {secrets.map((secret) => {
                const provider = providerMap.get(secret.secretProviderId);
                return (
                  <div
                    key={secret.meta?.id ?? secret.title}
                    className="grid items-center gap-2 px-6 py-4 text-sm text-foreground md:grid-cols-[2fr_1fr_1fr_1fr_140px]"
                    data-testid="secret-row"
                  >
                    <div>
                      <div className="font-medium" data-testid="secret-title">
                        {secret.title}
                      </div>
                      <div className="text-xs text-muted-foreground" data-testid="secret-id">
                        {secret.meta?.id ?? '—'}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground" data-testid="secret-provider">
                      {provider?.title ?? secret.secretProviderId}
                    </span>
                    <span className="text-xs text-muted-foreground" data-testid="secret-remote">
                      {secret.remoteName}
                    </span>
                    <span className="text-xs text-muted-foreground" data-testid="secret-created">
                      {formatDateOnly(secret.meta?.createdAt)}
                    </span>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditOpen(secret)}
                        data-testid="secret-edit"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteOpen(secret)}
                        data-testid="secret-delete"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}
      <Dialog open={createOpen} onOpenChange={handleCreateOpenChange}>
        <DialogContent data-testid="secrets-create-dialog">
          <DialogHeader>
            <DialogTitle data-testid="secrets-create-title">Add secret</DialogTitle>
            <DialogDescription data-testid="secrets-create-description">
              Register a secret and link it to a provider.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="secrets-create-title-input">Title</Label>
              <Input
                id="secrets-create-title-input"
                value={createTitle}
                onChange={(event) => {
                  setCreateTitle(event.target.value);
                  if (createTitleError) setCreateTitleError('');
                }}
                data-testid="secrets-create-title-input"
              />
              {createTitleError ? <p className="text-sm text-destructive">{createTitleError}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="secrets-create-description-input">Description</Label>
              <Input
                id="secrets-create-description-input"
                value={createDescription}
                onChange={(event) => setCreateDescription(event.target.value)}
                data-testid="secrets-create-description-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="secrets-create-provider">Secret Provider</Label>
              <Select
                value={createProviderId}
                onValueChange={(value) => {
                  setCreateProviderId(value);
                  if (createProviderError) setCreateProviderError('');
                }}
              >
                <SelectTrigger id="secrets-create-provider" data-testid="secrets-create-provider">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {(providersQuery.data?.secretProviders ?? []).map((provider) => {
                    const providerId = provider.meta?.id;
                    if (!providerId) return null;
                    return (
                      <SelectItem key={providerId} value={providerId}>
                        {provider.title}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {createProviderError ? (
                <p className="text-sm text-destructive" data-testid="secrets-create-provider-error">
                  {createProviderError}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="secrets-create-remote">Remote Name</Label>
              <Input
                id="secrets-create-remote"
                placeholder="secret/data/my-secret"
                value={createRemoteName}
                onChange={(event) => {
                  setCreateRemoteName(event.target.value);
                  if (createRemoteError) setCreateRemoteError('');
                }}
                data-testid="secrets-create-remote"
              />
              {createRemoteError ? <p className="text-sm text-destructive">{createRemoteError}</p> : null}
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="secrets-create-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={createSecretMutation.isPending}
              data-testid="secrets-create-submit"
            >
              {createSecretMutation.isPending ? 'Adding...' : 'Add secret'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={editOpen} onOpenChange={handleEditOpenChange}>
        <DialogContent data-testid="secrets-edit-dialog">
          <DialogHeader>
            <DialogTitle data-testid="secrets-edit-title">Edit secret</DialogTitle>
            <DialogDescription data-testid="secrets-edit-description">
              Update secret metadata and provider settings.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="secrets-edit-title-input">Title</Label>
              <Input
                id="secrets-edit-title-input"
                value={editTitle}
                onChange={(event) => {
                  setEditTitle(event.target.value);
                  if (editTitleError) setEditTitleError('');
                }}
                data-testid="secrets-edit-title-input"
              />
              {editTitleError ? <p className="text-sm text-destructive">{editTitleError}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="secrets-edit-description-input">Description</Label>
              <Input
                id="secrets-edit-description-input"
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
                data-testid="secrets-edit-description-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="secrets-edit-provider">Secret Provider</Label>
              <Select
                value={editProviderId}
                onValueChange={(value) => {
                  setEditProviderId(value);
                  if (editProviderError) setEditProviderError('');
                }}
              >
                <SelectTrigger id="secrets-edit-provider" data-testid="secrets-edit-provider">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {(providersQuery.data?.secretProviders ?? []).map((provider) => {
                    const providerId = provider.meta?.id;
                    if (!providerId) return null;
                    return (
                      <SelectItem key={providerId} value={providerId}>
                        {provider.title}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {editProviderError ? (
                <p className="text-sm text-destructive" data-testid="secrets-edit-provider-error">
                  {editProviderError}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="secrets-edit-remote">Remote Name</Label>
              <Input
                id="secrets-edit-remote"
                placeholder="secret/data/my-secret"
                value={editRemoteName}
                onChange={(event) => {
                  setEditRemoteName(event.target.value);
                  if (editRemoteError) setEditRemoteError('');
                }}
                data-testid="secrets-edit-remote"
              />
              {editRemoteError ? <p className="text-sm text-destructive">{editRemoteError}</p> : null}
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="secrets-edit-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={handleEditSave}
              disabled={updateSecretMutation.isPending}
              data-testid="secrets-edit-submit"
            >
              {updateSecretMutation.isPending ? 'Saving...' : 'Save changes'}
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
        title="Delete secret"
        description="This will permanently remove the secret."
        confirmLabel="Delete secret"
        variant="danger"
        onConfirm={() => {
          if (deleteTargetId) {
            deleteSecretMutation.mutate(deleteTargetId);
          }
        }}
        isPending={deleteSecretMutation.isPending}
      />
    </div>
  );
}
