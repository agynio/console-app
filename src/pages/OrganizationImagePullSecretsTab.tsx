import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { secretsClient } from '@/api/client';
import { SortableHeader } from '@/components/SortableHeader';
import { LoadMoreButton } from '@/components/LoadMoreButton';
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
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useListControls } from '@/hooks/useListControls';
import { formatDateOnly, formatSecretProviderType, timestampToMillis } from '@/lib/format';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

type SourceType = 'value' | 'remote';

const SOURCE_OPTIONS: Array<{ value: SourceType; label: string }> = [
  { value: 'value', label: 'Inline value' },
  { value: 'remote', label: 'Remote provider' },
];

type ImagePullSecretFormValues = {
  registry: string;
  username: string;
  description: string;
  sourceType: SourceType;
  value: string;
  providerId: string;
  reference: string;
};

type ImagePullSecretFormErrors = {
  registry?: string;
  username?: string;
  value?: string;
  providerId?: string;
  reference?: string;
};

const DEFAULT_FORM_VALUES: ImagePullSecretFormValues = {
  registry: '',
  username: '',
  description: '',
  sourceType: 'value',
  value: '',
  providerId: '',
  reference: '',
};

const normalizeFormValues = (values: ImagePullSecretFormValues): ImagePullSecretFormValues => ({
  ...values,
  registry: values.registry.trim(),
  username: values.username.trim(),
  description: values.description.trim(),
  value: values.value.trim(),
  reference: values.reference.trim(),
});

function validateImagePullSecretForm(values: ImagePullSecretFormValues): ImagePullSecretFormErrors {
  const errors: ImagePullSecretFormErrors = {};

  if (!values.registry.trim()) {
    errors.registry = 'Registry is required.';
  }

  if (!values.username.trim()) {
    errors.username = 'Username is required.';
  }

  if (values.sourceType === 'value') {
    if (!values.value.trim()) {
      errors.value = 'Secret value is required.';
    }
  } else {
    if (!values.providerId) {
      errors.providerId = 'Select a secret provider.';
    }
    if (!values.reference.trim()) {
      errors.reference = 'Value reference is required.';
    }
  }

  return errors;
}

const buildFormValuesFromSecret = (secret: ImagePullSecret | null): ImagePullSecretFormValues => {
  if (!secret) return { ...DEFAULT_FORM_VALUES };

  if (secret.source.case === 'remote') {
    return {
      registry: secret.registry,
      username: secret.username,
      description: secret.description ?? '',
      sourceType: 'remote',
      value: '',
      providerId: secret.source.value.valueProviderId,
      reference: secret.source.value.valueReference,
    };
  }

  return {
    registry: secret.registry,
    username: secret.username,
    description: secret.description ?? '',
    sourceType: 'value',
    value: secret.source.case === 'value' ? secret.source.value : '',
    providerId: '',
    reference: '',
  };
};

type ImagePullSecretFormDialogProps = {
  mode: 'create' | 'edit';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providers: SecretProvider[];
  initialValues: ImagePullSecretFormValues;
  onSubmit: (values: ImagePullSecretFormValues) => void;
  isSubmitting: boolean;
};

function ImagePullSecretFormDialog({
  mode,
  open,
  onOpenChange,
  providers,
  initialValues,
  onSubmit,
  isSubmitting,
}: ImagePullSecretFormDialogProps) {
  const [values, setValues] = useState<ImagePullSecretFormValues>(initialValues);
  const [errors, setErrors] = useState<ImagePullSecretFormErrors>({});

  const resolvedInitialValues = useMemo(
    () => ({ ...DEFAULT_FORM_VALUES, ...initialValues }),
    [initialValues],
  );

  useEffect(() => {
    if (open) {
      setValues(resolvedInitialValues);
      setErrors({});
      return;
    }
    setValues({ ...DEFAULT_FORM_VALUES });
    setErrors({});
  }, [open, resolvedInitialValues]);

  const testIdPrefix = mode === 'create' ? 'organization-image-pull-secrets-create' : 'organization-image-pull-secrets-edit';
  const dialogTitle = mode === 'create' ? 'Add secret' : 'Edit secret';
  const dialogDescription =
    mode === 'create' ? 'Store registry credentials for private images.' : 'Update registry credentials for this secret.';
  const submitLabel = mode === 'create' ? 'Add secret' : 'Save changes';
  const pendingLabel = mode === 'create' ? 'Creating...' : 'Saving...';

  const clearError = (field: keyof ImagePullSecretFormErrors) => {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  };

  const handleSourceTypeChange = (nextType: SourceType) => {
    setValues((prev) => ({
      ...prev,
      sourceType: nextType,
      value: nextType === 'value' ? prev.value : '',
      providerId: nextType === 'remote' ? prev.providerId : '',
      reference: nextType === 'remote' ? prev.reference : '',
    }));
    setErrors((prev) => ({
      ...prev,
      value: undefined,
      providerId: undefined,
      reference: undefined,
    }));
  };

  const handleSubmit = () => {
    const normalized = normalizeFormValues(values);
    const validation = validateImagePullSecretForm(normalized);
    setErrors(validation);
    if (Object.values(validation).some(Boolean)) return;
    onSubmit(normalized);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={`${testIdPrefix}-dialog`}>
        <DialogHeader>
          <DialogTitle data-testid={`${testIdPrefix}-title`}>{dialogTitle}</DialogTitle>
          <DialogDescription data-testid={`${testIdPrefix}-description`}>{dialogDescription}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`${testIdPrefix}-registry`}>Registry</Label>
            <Input
              id={`${testIdPrefix}-registry`}
              value={values.registry}
              onChange={(event) => {
                setValues((prev) => ({ ...prev, registry: event.target.value }));
                clearError('registry');
              }}
              placeholder="registry.example.com"
              data-testid={`${testIdPrefix}-registry`}
            />
            {errors.registry ? (
              <p className="text-sm text-destructive" data-testid={`${testIdPrefix}-registry-error`}>
                {errors.registry}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${testIdPrefix}-username`}>Username</Label>
            <Input
              id={`${testIdPrefix}-username`}
              value={values.username}
              onChange={(event) => {
                setValues((prev) => ({ ...prev, username: event.target.value }));
                clearError('username');
              }}
              placeholder="registry user"
              data-testid={`${testIdPrefix}-username`}
            />
            {errors.username ? (
              <p className="text-sm text-destructive" data-testid={`${testIdPrefix}-username-error`}>
                {errors.username}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${testIdPrefix}-description-input`}>Description</Label>
            <Input
              id={`${testIdPrefix}-description-input`}
              value={values.description}
              onChange={(event) => setValues((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Optional description"
              data-testid={`${testIdPrefix}-description-input`}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${testIdPrefix}-source-type`}>Source</Label>
            <Select value={values.sourceType} onValueChange={(value) => handleSourceTypeChange(value as SourceType)}>
              <SelectTrigger id={`${testIdPrefix}-source-type`} data-testid={`${testIdPrefix}-source-type`}>
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
          {values.sourceType === 'value' ? (
            <div className="space-y-2">
              <Label htmlFor={`${testIdPrefix}-value`}>Secret Value</Label>
              <Input
                id={`${testIdPrefix}-value`}
                type="password"
                value={values.value}
                onChange={(event) => {
                  setValues((prev) => ({ ...prev, value: event.target.value }));
                  clearError('value');
                }}
                placeholder="Registry token"
                data-testid={`${testIdPrefix}-value`}
              />
              {errors.value ? (
                <p className="text-sm text-destructive" data-testid={`${testIdPrefix}-value-error`}>
                  {errors.value}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor={`${testIdPrefix}-provider`}>Secret Provider</Label>
                <Select
                  value={values.providerId}
                  onValueChange={(value) => {
                    setValues((prev) => ({ ...prev, providerId: value }));
                    clearError('providerId');
                  }}
                >
                  <SelectTrigger id={`${testIdPrefix}-provider`} data-testid={`${testIdPrefix}-provider`}>
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((provider) => {
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
                {errors.providerId ? (
                  <p className="text-sm text-destructive" data-testid={`${testIdPrefix}-provider-error`}>
                    {errors.providerId}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${testIdPrefix}-reference`}>Value Reference</Label>
                <Input
                  id={`${testIdPrefix}-reference`}
                  value={values.reference}
                  onChange={(event) => {
                    setValues((prev) => ({ ...prev, reference: event.target.value }));
                    clearError('reference');
                  }}
                  placeholder="secret/path"
                  data-testid={`${testIdPrefix}-reference`}
                />
                {errors.reference ? (
                  <p className="text-sm text-destructive" data-testid={`${testIdPrefix}-reference-error`}>
                    {errors.reference}
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm" data-testid={`${testIdPrefix}-cancel`}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isSubmitting}
            data-testid={`${testIdPrefix}-submit`}
          >
            {isSubmitting ? pendingLabel : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OrganizationImagePullSecretsTab() {
  useDocumentTitle('Image Pull Secrets');

  const { id } = useParams();
  const organizationId = id ?? '';
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editSecret, setEditSecret] = useState<ImagePullSecret | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const providersQuery = useQuery({
    queryKey: ['secrets', organizationId, 'providers', 'all'],
    queryFn: () => secretsClient.listSecretProviders({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const imagePullSecretsQuery = useInfiniteQuery({
    queryKey: ['imagePullSecrets', organizationId, 'list', 'infinite'],
    queryFn: ({ pageParam }) =>
      secretsClient.listImagePullSecrets({ organizationId, pageSize: DEFAULT_PAGE_SIZE, pageToken: pageParam }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
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
      setEditSecret(null);
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

  const buildSource = (values: ImagePullSecretFormValues) => {
    if (values.sourceType === 'value') {
      return { case: 'value' as const, value: values.value };
    }
    return {
      case: 'remote' as const,
      value: {
        valueProviderId: values.providerId,
        valueReference: values.reference,
      },
    };
  };

  const handleCreate = (values: ImagePullSecretFormValues) => {
    createImagePullSecretMutation.mutate({
      description: values.description,
      registry: values.registry,
      username: values.username,
      source: buildSource(values),
      organizationId,
    });
  };

  const handleCreateOpenChange = (open: boolean) => {
    setCreateOpen(open);
  };

  const handleEditOpen = (secret: ImagePullSecret) => {
    const secretId = secret.meta?.id;
    if (!secretId) {
      toast.error('Missing image pull secret ID.');
      return;
    }
    setEditSecret(secret);
    setEditOpen(true);
  };

  const handleEditSave = (values: ImagePullSecretFormValues) => {
    const secretId = editSecret?.meta?.id;
    if (!secretId) {
      toast.error('Missing image pull secret ID.');
      return;
    }

    updateImagePullSecretMutation.mutate({
      id: secretId,
      description: values.description,
      registry: values.registry,
      username: values.username,
      source: buildSource(values),
    });
  };

  const handleEditOpenChange = (open: boolean) => {
    setEditOpen(open);
    if (!open) {
      setEditSecret(null);
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

  const providers = useMemo(() => providersQuery.data?.secretProviders ?? [], [providersQuery.data?.secretProviders]);
  const providerMap = useMemo(() => {
    return new Map(
      providers.flatMap((provider) => {
        const providerId = provider.meta?.id;
        return providerId ? ([[providerId, provider]] as const) : [];
      }),
    );
  }, [providers]);

  const imagePullSecrets = imagePullSecretsQuery.data?.pages.flatMap((page) => page.imagePullSecrets) ?? [];
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
  const editInitialValues = useMemo(() => buildFormValuesFromSecret(editSecret), [editSecret]);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-sm flex-1">
          <Input
            placeholder="Search image pull secrets..."
            value={listControls.searchTerm}
            onChange={(event) => listControls.setSearchTerm(event.target.value)}
            data-testid="list-search"
          />
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
      <LoadMoreButton
        hasMore={Boolean(imagePullSecretsQuery.hasNextPage)}
        isLoading={imagePullSecretsQuery.isFetchingNextPage}
        onClick={() => {
          void imagePullSecretsQuery.fetchNextPage();
        }}
      />
      <ImagePullSecretFormDialog
        mode="create"
        open={createOpen}
        onOpenChange={handleCreateOpenChange}
        providers={providers}
        initialValues={DEFAULT_FORM_VALUES}
        onSubmit={handleCreate}
        isSubmitting={createImagePullSecretMutation.isPending}
      />
      <ImagePullSecretFormDialog
        mode="edit"
        open={editOpen}
        onOpenChange={handleEditOpenChange}
        providers={providers}
        initialValues={editInitialValues}
        onSubmit={handleEditSave}
        isSubmitting={updateImagePullSecretMutation.isPending}
      />
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
