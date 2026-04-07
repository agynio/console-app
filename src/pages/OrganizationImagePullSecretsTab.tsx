import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { secretsClient } from '@/api/client';
import { SortableHeader } from '@/components/SortableHeader';
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
import type { ImagePullSecret, SecretProvider } from '@/gen/agynio/api/secrets/v1/secrets_pb';
import { useListControls } from '@/hooks/useListControls';
import { formatDateOnly, formatSecretProviderType, timestampToMillis } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

type SourceType = 'value' | 'remote';

const SOURCE_OPTIONS: Array<{ value: SourceType; label: string }> = [
  { value: 'value', label: 'Inline value' },
  { value: 'remote', label: 'Remote provider' },
];

export function OrganizationImagePullSecretsTab() {
  const { id } = useParams();
  const organizationId = id ?? '';
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createRegistry, setCreateRegistry] = useState('');
  const [createUsername, setCreateUsername] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createSourceType, setCreateSourceType] = useState<SourceType>('value');
  const [createValue, setCreateValue] = useState('');
  const [createProviderId, setCreateProviderId] = useState('');
  const [createReference, setCreateReference] = useState('');
  const [createRegistryError, setCreateRegistryError] = useState('');
  const [createUsernameError, setCreateUsernameError] = useState('');
  const [createValueError, setCreateValueError] = useState('');
  const [createProviderError, setCreateProviderError] = useState('');
  const [createReferenceError, setCreateReferenceError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editSecretId, setEditSecretId] = useState<string | null>(null);
  const [editRegistry, setEditRegistry] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSourceType, setEditSourceType] = useState<SourceType>('value');
  const [editValue, setEditValue] = useState('');
  const [editProviderId, setEditProviderId] = useState('');
  const [editReference, setEditReference] = useState('');
  const [editRegistryError, setEditRegistryError] = useState('');
  const [editUsernameError, setEditUsernameError] = useState('');
  const [editValueError, setEditValueError] = useState('');
  const [editProviderError, setEditProviderError] = useState('');
  const [editReferenceError, setEditReferenceError] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const providersQuery = useQuery({
    queryKey: ['secrets', organizationId, 'providers'],
    queryFn: () => secretsClient.listSecretProviders({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const imagePullSecretsQuery = useQuery({
    queryKey: ['imagePullSecrets', organizationId, 'list'],
    queryFn: () => secretsClient.listImagePullSecrets({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const createImagePullSecretMutation = useMutation({
    mutationFn: (payload: {
      description: string;
      registry: string;
      username: string;
      source:
        | { case: 'value'; value: string }
        | { case: 'remote'; value: { valueProviderId: string; valueReference: string } };
      organizationId: string;
    }) => secretsClient.createImagePullSecret(payload),
    onSuccess: () => {
      toast.success('Image pull secret created.');
      void queryClient.invalidateQueries({ queryKey: ['imagePullSecrets', organizationId, 'list'] });
      setCreateOpen(false);
      setCreateRegistry('');
      setCreateUsername('');
      setCreateDescription('');
      setCreateSourceType('value');
      setCreateValue('');
      setCreateProviderId('');
      setCreateReference('');
      setCreateRegistryError('');
      setCreateUsernameError('');
      setCreateValueError('');
      setCreateProviderError('');
      setCreateReferenceError('');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create image pull secret.');
    },
  });

  const updateImagePullSecretMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      description?: string;
      registry?: string;
      username?: string;
      source:
        | { case: 'value'; value: string }
        | { case: 'remote'; value: { valueProviderId: string; valueReference: string } };
    }) => secretsClient.updateImagePullSecret(payload),
    onSuccess: () => {
      toast.success('Image pull secret updated.');
      void queryClient.invalidateQueries({ queryKey: ['imagePullSecrets', organizationId, 'list'] });
      setEditOpen(false);
      setEditSecretId(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update image pull secret.');
    },
  });

  const deleteImagePullSecretMutation = useMutation({
    mutationFn: (secretId: string) => secretsClient.deleteImagePullSecret({ id: secretId }),
    onSuccess: () => {
      toast.success('Image pull secret deleted.');
      void queryClient.invalidateQueries({ queryKey: ['imagePullSecrets', organizationId, 'list'] });
      void queryClient.invalidateQueries({ queryKey: ['imagePullSecretAttachments'] });
      setDeleteTargetId(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete image pull secret.');
    },
  });

  const buildSource = (
    sourceType: SourceType,
    value: string,
    providerId: string,
    reference: string,
  ) => {
    if (sourceType === 'value') {
      return { case: 'value' as const, value };
    }
    return { case: 'remote' as const, value: { valueProviderId: providerId, valueReference: reference } };
  };

  const handleCreate = () => {
    const trimmedRegistry = createRegistry.trim();
    const trimmedUsername = createUsername.trim();
    const trimmedValue = createValue.trim();
    const trimmedReference = createReference.trim();
    let hasError = false;

    if (!trimmedRegistry) {
      setCreateRegistryError('Registry is required.');
      hasError = true;
    } else if (createRegistryError) {
      setCreateRegistryError('');
    }

    if (!trimmedUsername) {
      setCreateUsernameError('Username is required.');
      hasError = true;
    } else if (createUsernameError) {
      setCreateUsernameError('');
    }

    if (createSourceType === 'value') {
      if (!trimmedValue) {
        setCreateValueError('Secret value is required.');
        hasError = true;
      } else if (createValueError) {
        setCreateValueError('');
      }
    } else {
      if (!createProviderId) {
        setCreateProviderError('Select a secret provider.');
        hasError = true;
      } else if (createProviderError) {
        setCreateProviderError('');
      }

      if (!trimmedReference) {
        setCreateReferenceError('Value reference is required.');
        hasError = true;
      } else if (createReferenceError) {
        setCreateReferenceError('');
      }
    }

    if (hasError) return;

    createImagePullSecretMutation.mutate({
      description: createDescription.trim(),
      registry: trimmedRegistry,
      username: trimmedUsername,
      source: buildSource(createSourceType, trimmedValue, createProviderId, trimmedReference),
      organizationId,
    });
  };

  const handleCreateOpenChange = (open: boolean) => {
    setCreateOpen(open);
    if (!open) {
      setCreateRegistry('');
      setCreateUsername('');
      setCreateDescription('');
      setCreateSourceType('value');
      setCreateValue('');
      setCreateProviderId('');
      setCreateReference('');
      setCreateRegistryError('');
      setCreateUsernameError('');
      setCreateValueError('');
      setCreateProviderError('');
      setCreateReferenceError('');
    }
  };

  const handleEditOpen = (secret: ImagePullSecret) => {
    const secretId = secret.meta?.id;
    if (!secretId) {
      toast.error('Missing image pull secret ID.');
      return;
    }
    setEditSecretId(secretId);
    setEditRegistry(secret.registry);
    setEditUsername(secret.username);
    setEditDescription(secret.description);
    if (secret.source.case === 'remote') {
      setEditSourceType('remote');
      setEditProviderId(secret.source.value.valueProviderId);
      setEditReference(secret.source.value.valueReference);
      setEditValue('');
    } else {
      setEditSourceType('value');
      setEditValue(secret.source.case === 'value' ? secret.source.value : '');
      setEditProviderId('');
      setEditReference('');
    }
    setEditRegistryError('');
    setEditUsernameError('');
    setEditValueError('');
    setEditProviderError('');
    setEditReferenceError('');
    setEditOpen(true);
  };

  const handleEditSave = () => {
    const trimmedRegistry = editRegistry.trim();
    const trimmedUsername = editUsername.trim();
    const trimmedValue = editValue.trim();
    const trimmedReference = editReference.trim();
    let hasError = false;

    if (!trimmedRegistry) {
      setEditRegistryError('Registry is required.');
      hasError = true;
    } else if (editRegistryError) {
      setEditRegistryError('');
    }

    if (!trimmedUsername) {
      setEditUsernameError('Username is required.');
      hasError = true;
    } else if (editUsernameError) {
      setEditUsernameError('');
    }

    if (editSourceType === 'value') {
      if (!trimmedValue) {
        setEditValueError('Secret value is required.');
        hasError = true;
      } else if (editValueError) {
        setEditValueError('');
      }
    } else {
      if (!editProviderId) {
        setEditProviderError('Select a secret provider.');
        hasError = true;
      } else if (editProviderError) {
        setEditProviderError('');
      }

      if (!trimmedReference) {
        setEditReferenceError('Value reference is required.');
        hasError = true;
      } else if (editReferenceError) {
        setEditReferenceError('');
      }
    }

    if (hasError) return;
    if (!editSecretId) {
      toast.error('Missing image pull secret ID.');
      return;
    }

    updateImagePullSecretMutation.mutate({
      id: editSecretId,
      description: editDescription.trim(),
      registry: trimmedRegistry,
      username: trimmedUsername,
      source: buildSource(editSourceType, trimmedValue, editProviderId, trimmedReference),
    });
  };

  const handleEditOpenChange = (open: boolean) => {
    setEditOpen(open);
    if (!open) {
      setEditSecretId(null);
      setEditRegistry('');
      setEditUsername('');
      setEditDescription('');
      setEditSourceType('value');
      setEditValue('');
      setEditProviderId('');
      setEditReference('');
      setEditRegistryError('');
      setEditUsernameError('');
      setEditValueError('');
      setEditProviderError('');
      setEditReferenceError('');
    }
  };

  const handleDeleteOpen = (secret: ImagePullSecret) => {
    const secretId = secret.meta?.id;
    if (!secretId) {
      toast.error('Missing image pull secret ID.');
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

  const imagePullSecrets = imagePullSecretsQuery.data?.imagePullSecrets ?? [];
  const isLoading = providersQuery.isPending || imagePullSecretsQuery.isPending;
  const isError = providersQuery.isError || imagePullSecretsQuery.isError;
  const getProviderLabel = (providerId: string) => providerMap.get(providerId)?.title ?? providerId;
  const getSourceLabel = (secret: ImagePullSecret) => {
    if (secret.source.case === 'remote') {
      return getProviderLabel(secret.source.value.valueProviderId);
    }
    return 'Inline value';
  };
  const getSourceDetail = (secret: ImagePullSecret) => {
    if (secret.source.case === 'remote') {
      return secret.source.value.valueReference;
    }
    return 'Stored in console';
  };

  const listControls = useListControls({
    items: imagePullSecrets,
    searchFields: [
      (secret) => secret.registry,
      (secret) => secret.username,
      (secret) => secret.description,
      (secret) => getSourceLabel(secret),
      (secret) => getSourceDetail(secret),
      (secret) => formatDateOnly(secret.meta?.createdAt),
    ],
    sortOptions: {
      registry: (secret) => secret.registry,
      username: (secret) => secret.username,
      source: (secret) => getSourceLabel(secret),
      created: (secret) => timestampToMillis(secret.meta?.createdAt),
    },
    defaultSortKey: 'registry',
  });

  const visibleSecrets = listControls.filteredItems;
  const hasSearch = listControls.searchTerm.trim().length > 0;

  const renderSourceSummary = (secret: ImagePullSecret, providers: Map<string, SecretProvider>) => {
    if (secret.source.case === 'remote') {
      const providerLabel = providers.get(secret.source.value.valueProviderId)?.title ?? secret.source.value.valueProviderId;
      return (
        <div>
          <div className="font-medium" data-testid="organization-image-pull-secret-source">
            {providerLabel}
          </div>
          <div className="text-xs text-muted-foreground" data-testid="organization-image-pull-secret-source-detail">
            {secret.source.value.valueReference}
          </div>
        </div>
      );
    }

    return (
      <div>
        <div className="font-medium" data-testid="organization-image-pull-secret-source">
          Inline value
        </div>
        <div className="text-xs text-muted-foreground" data-testid="organization-image-pull-secret-source-detail">
          Stored in console
        </div>
      </div>
    );
  };

  const handleSourceChange = (
    nextType: SourceType,
    setType: (value: SourceType) => void,
    resetInline: () => void,
    resetRemote: () => void,
  ) => {
    setType(nextType);
    if (nextType === 'value') {
      resetRemote();
    } else {
      resetInline();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground" data-testid="organization-image-pull-secrets-heading">
            Image Pull Secrets
          </h3>
          <p className="text-sm text-muted-foreground">Manage registry credentials for images.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleCreateOpenChange(true)}
          data-testid="organization-image-pull-secrets-create"
        >
          Add secret
        </Button>
      </div>
      <div className="max-w-sm">
        <Input
          placeholder="Search image pull secrets..."
          value={listControls.searchTerm}
          onChange={(event) => listControls.setSearchTerm(event.target.value)}
          data-testid="list-search"
        />
      </div>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading image pull secrets...</div>
      ) : null}
      {isError ? (
        <div className="text-sm text-muted-foreground">Failed to load image pull secrets.</div>
      ) : null}
      {imagePullSecrets.length === 0 && !isLoading ? (
        <Card className="border-border" data-testid="organization-image-pull-secrets-empty">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No image pull secrets configured.
          </CardContent>
        </Card>
      ) : null}
      {imagePullSecrets.length > 0 ? (
        <Card className="border-border" data-testid="organization-image-pull-secrets-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[2fr_1fr_1fr_1fr_140px]"
              data-testid="organization-image-pull-secrets-header"
            >
              <SortableHeader
                label="Registry"
                sortKey="registry"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Username"
                sortKey="username"
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
              {visibleSecrets.length === 0 ? (
                <div className="px-6 py-6 text-sm text-muted-foreground">
                  {hasSearch ? 'No results found.' : 'No image pull secrets configured.'}
                </div>
              ) : (
                visibleSecrets.map((secret) => (
                  <div
                    key={secret.meta?.id ?? secret.registry}
                    className="grid items-center gap-2 px-6 py-4 text-sm text-foreground md:grid-cols-[2fr_1fr_1fr_1fr_140px]"
                    data-testid="organization-image-pull-secret-row"
                  >
                    <div>
                      <div className="font-medium" data-testid="organization-image-pull-secret-registry">
                        {secret.registry}
                      </div>
                      <div className="text-xs text-muted-foreground" data-testid="organization-image-pull-secret-description">
                        {secret.description || '—'}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground" data-testid="organization-image-pull-secret-username">
                      {secret.username}
                    </span>
                    {renderSourceSummary(secret, providerMap)}
                    <span className="text-xs text-muted-foreground" data-testid="organization-image-pull-secret-created">
                      {formatDateOnly(secret.meta?.createdAt)}
                    </span>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditOpen(secret)}
                        data-testid="organization-image-pull-secret-edit"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteOpen(secret)}
                        data-testid="organization-image-pull-secret-delete"
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
      <Dialog open={createOpen} onOpenChange={handleCreateOpenChange}>
        <DialogContent data-testid="organization-image-pull-secrets-create-dialog">
          <DialogHeader>
            <DialogTitle data-testid="organization-image-pull-secrets-create-title">Add secret</DialogTitle>
            <DialogDescription data-testid="organization-image-pull-secrets-create-description">
              Store registry credentials for private images.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="organization-image-pull-secrets-create-registry">Registry</Label>
              <Input
                id="organization-image-pull-secrets-create-registry"
                value={createRegistry}
                onChange={(event) => {
                  setCreateRegistry(event.target.value);
                  if (createRegistryError) setCreateRegistryError('');
                }}
                placeholder="registry.example.com"
                data-testid="organization-image-pull-secrets-create-registry"
              />
              {createRegistryError ? (
                <p className="text-sm text-destructive" data-testid="organization-image-pull-secrets-create-registry-error">
                  {createRegistryError}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="organization-image-pull-secrets-create-username">Username</Label>
              <Input
                id="organization-image-pull-secrets-create-username"
                value={createUsername}
                onChange={(event) => {
                  setCreateUsername(event.target.value);
                  if (createUsernameError) setCreateUsernameError('');
                }}
                placeholder="registry user"
                data-testid="organization-image-pull-secrets-create-username"
              />
              {createUsernameError ? (
                <p className="text-sm text-destructive" data-testid="organization-image-pull-secrets-create-username-error">
                  {createUsernameError}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="organization-image-pull-secrets-create-description-input">Description</Label>
              <Input
                id="organization-image-pull-secrets-create-description-input"
                value={createDescription}
                onChange={(event) => setCreateDescription(event.target.value)}
                placeholder="Optional description"
                data-testid="organization-image-pull-secrets-create-description-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="organization-image-pull-secrets-create-source-type">Source</Label>
              <Select
                value={createSourceType}
                onValueChange={(value) =>
                  handleSourceChange(
                    value as SourceType,
                    setCreateSourceType,
                    () => {
                      setCreateValue('');
                      setCreateValueError('');
                    },
                    () => {
                      setCreateProviderId('');
                      setCreateReference('');
                      setCreateProviderError('');
                      setCreateReferenceError('');
                    },
                  )
                }
              >
                <SelectTrigger
                  id="organization-image-pull-secrets-create-source-type"
                  data-testid="organization-image-pull-secrets-create-source-type"
                >
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {createSourceType === 'value' ? (
              <div className="space-y-2">
                <Label htmlFor="organization-image-pull-secrets-create-value">Secret Value</Label>
                <Input
                  id="organization-image-pull-secrets-create-value"
                  type="password"
                  value={createValue}
                  onChange={(event) => {
                    setCreateValue(event.target.value);
                    if (createValueError) setCreateValueError('');
                  }}
                  placeholder="Registry token"
                  data-testid="organization-image-pull-secrets-create-value"
                />
                {createValueError ? (
                  <p className="text-sm text-destructive" data-testid="organization-image-pull-secrets-create-value-error">
                    {createValueError}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="organization-image-pull-secrets-create-provider">Secret Provider</Label>
                  <Select
                    value={createProviderId}
                    onValueChange={(value) => {
                      setCreateProviderId(value);
                      if (createProviderError) setCreateProviderError('');
                    }}
                  >
                    <SelectTrigger
                      id="organization-image-pull-secrets-create-provider"
                      data-testid="organization-image-pull-secrets-create-provider"
                    >
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {(providersQuery.data?.secretProviders ?? []).map((provider) => {
                        const providerId = provider.meta?.id;
                        if (!providerId) return null;
                        return (
                          <SelectItem key={providerId} value={providerId}>
                            {provider.title} ({formatSecretProviderType(provider.type)})
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {createProviderError ? (
                    <p className="text-sm text-destructive" data-testid="organization-image-pull-secrets-create-provider-error">
                      {createProviderError}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="organization-image-pull-secrets-create-reference">Value Reference</Label>
                  <Input
                    id="organization-image-pull-secrets-create-reference"
                    value={createReference}
                    onChange={(event) => {
                      setCreateReference(event.target.value);
                      if (createReferenceError) setCreateReferenceError('');
                    }}
                    placeholder="secret/path"
                    data-testid="organization-image-pull-secrets-create-reference"
                  />
                  {createReferenceError ? (
                    <p className="text-sm text-destructive" data-testid="organization-image-pull-secrets-create-reference-error">
                      {createReferenceError}
                    </p>
                  ) : null}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="organization-image-pull-secrets-create-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={createImagePullSecretMutation.isPending}
              data-testid="organization-image-pull-secrets-create-submit"
            >
              {createImagePullSecretMutation.isPending ? 'Creating...' : 'Add secret'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={editOpen} onOpenChange={handleEditOpenChange}>
        <DialogContent data-testid="organization-image-pull-secrets-edit-dialog">
          <DialogHeader>
            <DialogTitle data-testid="organization-image-pull-secrets-edit-title">Edit secret</DialogTitle>
            <DialogDescription data-testid="organization-image-pull-secrets-edit-description">
              Update registry credentials for this secret.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="organization-image-pull-secrets-edit-registry">Registry</Label>
              <Input
                id="organization-image-pull-secrets-edit-registry"
                value={editRegistry}
                onChange={(event) => {
                  setEditRegistry(event.target.value);
                  if (editRegistryError) setEditRegistryError('');
                }}
                placeholder="registry.example.com"
                data-testid="organization-image-pull-secrets-edit-registry"
              />
              {editRegistryError ? (
                <p className="text-sm text-destructive" data-testid="organization-image-pull-secrets-edit-registry-error">
                  {editRegistryError}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="organization-image-pull-secrets-edit-username">Username</Label>
              <Input
                id="organization-image-pull-secrets-edit-username"
                value={editUsername}
                onChange={(event) => {
                  setEditUsername(event.target.value);
                  if (editUsernameError) setEditUsernameError('');
                }}
                placeholder="registry user"
                data-testid="organization-image-pull-secrets-edit-username"
              />
              {editUsernameError ? (
                <p className="text-sm text-destructive" data-testid="organization-image-pull-secrets-edit-username-error">
                  {editUsernameError}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="organization-image-pull-secrets-edit-description-input">Description</Label>
              <Input
                id="organization-image-pull-secrets-edit-description-input"
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
                placeholder="Optional description"
                data-testid="organization-image-pull-secrets-edit-description-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="organization-image-pull-secrets-edit-source-type">Source</Label>
              <Select
                value={editSourceType}
                onValueChange={(value) =>
                  handleSourceChange(
                    value as SourceType,
                    setEditSourceType,
                    () => {
                      setEditValue('');
                      setEditValueError('');
                    },
                    () => {
                      setEditProviderId('');
                      setEditReference('');
                      setEditProviderError('');
                      setEditReferenceError('');
                    },
                  )
                }
              >
                <SelectTrigger
                  id="organization-image-pull-secrets-edit-source-type"
                  data-testid="organization-image-pull-secrets-edit-source-type"
                >
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editSourceType === 'value' ? (
              <div className="space-y-2">
                <Label htmlFor="organization-image-pull-secrets-edit-value">Secret Value</Label>
                <Input
                  id="organization-image-pull-secrets-edit-value"
                  type="password"
                  value={editValue}
                  onChange={(event) => {
                    setEditValue(event.target.value);
                    if (editValueError) setEditValueError('');
                  }}
                  placeholder="Registry token"
                  data-testid="organization-image-pull-secrets-edit-value"
                />
                {editValueError ? (
                  <p className="text-sm text-destructive" data-testid="organization-image-pull-secrets-edit-value-error">
                    {editValueError}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="organization-image-pull-secrets-edit-provider">Secret Provider</Label>
                  <Select
                    value={editProviderId}
                    onValueChange={(value) => {
                      setEditProviderId(value);
                      if (editProviderError) setEditProviderError('');
                    }}
                  >
                    <SelectTrigger
                      id="organization-image-pull-secrets-edit-provider"
                      data-testid="organization-image-pull-secrets-edit-provider"
                    >
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {(providersQuery.data?.secretProviders ?? []).map((provider) => {
                        const providerId = provider.meta?.id;
                        if (!providerId) return null;
                        return (
                          <SelectItem key={providerId} value={providerId}>
                            {provider.title} ({formatSecretProviderType(provider.type)})
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {editProviderError ? (
                    <p className="text-sm text-destructive" data-testid="organization-image-pull-secrets-edit-provider-error">
                      {editProviderError}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="organization-image-pull-secrets-edit-reference">Value Reference</Label>
                  <Input
                    id="organization-image-pull-secrets-edit-reference"
                    value={editReference}
                    onChange={(event) => {
                      setEditReference(event.target.value);
                      if (editReferenceError) setEditReferenceError('');
                    }}
                    placeholder="secret/path"
                    data-testid="organization-image-pull-secrets-edit-reference"
                  />
                  {editReferenceError ? (
                    <p className="text-sm text-destructive" data-testid="organization-image-pull-secrets-edit-reference-error">
                      {editReferenceError}
                    </p>
                  ) : null}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="organization-image-pull-secrets-edit-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={handleEditSave}
              disabled={updateImagePullSecretMutation.isPending}
              data-testid="organization-image-pull-secrets-edit-submit"
            >
              {updateImagePullSecretMutation.isPending ? 'Saving...' : 'Save changes'}
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
        title="Delete image pull secret"
        description="This permanently removes the registry credentials."
        confirmLabel="Delete secret"
        variant="danger"
        onConfirm={() => {
          if (deleteTargetId) {
            deleteImagePullSecretMutation.mutate(deleteTargetId);
          }
        }}
        isPending={deleteImagePullSecretMutation.isPending}
      />
    </div>
  );
}
