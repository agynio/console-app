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
import type { Secret, SecretProvider } from '@/gen/agynio/api/secrets/v1/secrets_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useListControls } from '@/hooks/useListControls';
import { formatDateOnly, timestampToMillis } from '@/lib/format';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

type StorageMode = 'local' | 'remote';

const STORAGE_MODE_OPTIONS: Array<{ value: StorageMode; label: string }> = [
  { value: 'local', label: 'Local (built-in)' },
  { value: 'remote', label: 'Remote provider' },
];

type SecretFormValues = {
  title: string;
  description: string;
  storageMode: StorageMode;
  value: string;
  providerId: string;
  remoteName: string;
};

type SecretFormErrors = {
  title?: string;
  value?: string;
  providerId?: string;
  remoteName?: string;
};

const DEFAULT_FORM_VALUES: SecretFormValues = {
  title: '',
  description: '',
  storageMode: 'remote',
  value: '',
  providerId: '',
  remoteName: '',
};

const normalizeSecretFormValues = (values: SecretFormValues): SecretFormValues => ({
  ...values,
  title: values.title.trim(),
  description: values.description.trim(),
  value: values.value.trim(),
  remoteName: values.remoteName.trim(),
});

const isRemoteSecret = (secret: Secret) => Boolean(secret.secretProviderId || secret.remoteName);

const buildFormValuesFromSecret = (secret: Secret | null): SecretFormValues => {
  if (!secret) return { ...DEFAULT_FORM_VALUES };

  const storageMode: StorageMode = isRemoteSecret(secret) ? 'remote' : 'local';

  return {
    title: secret.title,
    description: secret.description,
    storageMode,
    value: '',
    providerId: storageMode === 'remote' ? secret.secretProviderId : '',
    remoteName: storageMode === 'remote' ? secret.remoteName : '',
  };
};

function validateSecretForm(values: SecretFormValues, mode: 'create' | 'edit'): SecretFormErrors {
  const errors: SecretFormErrors = {};

  if (!values.title.trim()) {
    errors.title = 'Title is required.';
  }

  if (values.storageMode === 'local') {
    if (mode === 'create' && !values.value.trim()) {
      errors.value = 'Secret value is required.';
    }
  } else {
    if (!values.providerId) {
      errors.providerId = 'Select a provider.';
    }
    if (!values.remoteName.trim()) {
      errors.remoteName = 'Remote name is required.';
    }
  }

  return errors;
}

type SecretFormDialogProps = {
  mode: 'create' | 'edit';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providers: SecretProvider[];
  initialValues: SecretFormValues;
  onSubmit: (values: SecretFormValues) => void;
  isSubmitting: boolean;
  storageModeLocked?: boolean;
};

function SecretFormDialog({
  mode,
  open,
  onOpenChange,
  providers,
  initialValues,
  onSubmit,
  isSubmitting,
  storageModeLocked = false,
}: SecretFormDialogProps) {
  const [values, setValues] = useState<SecretFormValues>(initialValues);
  const [errors, setErrors] = useState<SecretFormErrors>({});

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

  const testIdPrefix = mode === 'create' ? 'secrets-create' : 'secrets-edit';
  const dialogTitle = mode === 'create' ? 'Add secret' : 'Edit secret';
  const dialogDescription =
    mode === 'create'
      ? 'Store a secret locally or link it to a provider.'
      : 'Update secret metadata and storage settings.';
  const submitLabel = mode === 'create' ? 'Add secret' : 'Save changes';
  const pendingLabel = mode === 'create' ? 'Adding...' : 'Saving...';
  const valueLabel = mode === 'create' ? 'Secret Value' : 'New Secret Value';
  const valuePlaceholder = mode === 'create' ? 'Secret value' : 'Enter a new value';

  const clearError = (field: keyof SecretFormErrors) => {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  };

  const handleStorageModeChange = (nextMode: StorageMode) => {
    setValues((prev) => ({
      ...prev,
      storageMode: nextMode,
      value: nextMode === 'local' ? prev.value : '',
      providerId: nextMode === 'remote' ? prev.providerId : '',
      remoteName: nextMode === 'remote' ? prev.remoteName : '',
    }));
    setErrors((prev) => ({
      ...prev,
      value: undefined,
      providerId: undefined,
      remoteName: undefined,
    }));
  };

  const handleSubmit = () => {
    const normalized = normalizeSecretFormValues(values);
    const validation = validateSecretForm(normalized, mode);
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
            <Label htmlFor={`${testIdPrefix}-title-input`}>Title</Label>
            <Input
              id={`${testIdPrefix}-title-input`}
              value={values.title}
              onChange={(event) => {
                setValues((prev) => ({ ...prev, title: event.target.value }));
                clearError('title');
              }}
              data-testid={`${testIdPrefix}-title-input`}
            />
            {errors.title ? <p className="text-sm text-destructive">{errors.title}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${testIdPrefix}-description-input`}>Description</Label>
            <Input
              id={`${testIdPrefix}-description-input`}
              value={values.description}
              onChange={(event) => setValues((prev) => ({ ...prev, description: event.target.value }))}
              data-testid={`${testIdPrefix}-description-input`}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${testIdPrefix}-storage-mode`}>Storage Mode</Label>
            <Select
              value={values.storageMode}
              onValueChange={(value) => handleStorageModeChange(value as StorageMode)}
              disabled={storageModeLocked}
            >
              <SelectTrigger id={`${testIdPrefix}-storage-mode`} data-testid={`${testIdPrefix}-storage-mode`}>
                <SelectValue placeholder="Select mode" />
              </SelectTrigger>
              <SelectContent>
                {STORAGE_MODE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {storageModeLocked ? (
              <p className="text-xs text-muted-foreground">Storage mode cannot be changed after creation.</p>
            ) : null}
          </div>
          {values.storageMode === 'local' ? (
            <div className="space-y-2">
              <Label htmlFor={`${testIdPrefix}-value`}>{valueLabel}</Label>
              <Input
                id={`${testIdPrefix}-value`}
                type="password"
                value={values.value}
                onChange={(event) => {
                  setValues((prev) => ({ ...prev, value: event.target.value }));
                  clearError('value');
                }}
                placeholder={valuePlaceholder}
                data-testid={`${testIdPrefix}-value`}
              />
              {errors.value ? (
                <p className="text-sm text-destructive" data-testid={`${testIdPrefix}-value-error`}>
                  {errors.value}
                </p>
              ) : null}
              {mode === 'edit' ? (
                <p className="text-xs text-muted-foreground">Leave blank to keep the existing value.</p>
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
                          {provider.title}
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
                <Label htmlFor={`${testIdPrefix}-remote`}>Remote Name</Label>
                <Input
                  id={`${testIdPrefix}-remote`}
                  placeholder="secret/data/my-secret"
                  value={values.remoteName}
                  onChange={(event) => {
                    setValues((prev) => ({ ...prev, remoteName: event.target.value }));
                    clearError('remoteName');
                  }}
                  data-testid={`${testIdPrefix}-remote`}
                />
                {errors.remoteName ? (
                  <p className="text-sm text-destructive" data-testid={`${testIdPrefix}-remote-error`}>
                    {errors.remoteName}
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
          <Button size="sm" onClick={handleSubmit} disabled={isSubmitting} data-testid={`${testIdPrefix}-submit`}>
            {isSubmitting ? pendingLabel : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OrganizationSecretsTab() {
  useDocumentTitle('Secrets');

  const { id } = useParams();
  const organizationId = id ?? '';
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editSecret, setEditSecret] = useState<Secret | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const providersQuery = useQuery({
    queryKey: ['secrets', organizationId, 'providers', 'all'],
    queryFn: () => secretsClient.listSecretProviders({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const secretsQuery = useInfiniteQuery({
    queryKey: ['secrets', organizationId, 'list', 'infinite'],
    queryFn: ({ pageParam }) =>
      secretsClient.listSecrets({
        organizationId,
        pageSize: DEFAULT_PAGE_SIZE,
        pageToken: pageParam,
        secretProviderId: '',
      }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
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
      value: string;
    }) => secretsClient.createSecret(payload),
    onSuccess: () => {
      toast.success('Secret created.');
      void queryClient.invalidateQueries({ queryKey: ['secrets', organizationId, 'list'] });
      setCreateOpen(false);
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
      value?: string;
    }) => secretsClient.updateSecret(payload),
    onSuccess: () => {
      toast.success('Secret updated.');
      void queryClient.invalidateQueries({ queryKey: ['secrets', organizationId, 'list'] });
      setEditOpen(false);
      setEditSecret(null);
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

  const handleCreate = (values: SecretFormValues) => {
    const payload =
      values.storageMode === 'local'
        ? {
            title: values.title,
            description: values.description,
            secretProviderId: '',
            remoteName: '',
            value: values.value,
            organizationId,
          }
        : {
            title: values.title,
            description: values.description,
            secretProviderId: values.providerId,
            remoteName: values.remoteName,
            value: '',
            organizationId,
          };

    createSecretMutation.mutate(payload);
  };

  const handleCreateOpenChange = (open: boolean) => {
    setCreateOpen(open);
  };

  const handleEditOpen = (secret: Secret) => {
    const secretId = secret.meta?.id;
    if (!secretId) {
      toast.error('Missing secret ID.');
      return;
    }
    setEditSecret(secret);
    setEditOpen(true);
  };

  const handleEditSave = (values: SecretFormValues) => {
    const secretId = editSecret?.meta?.id;
    if (!secretId) {
      toast.error('Missing secret ID.');
      return;
    }

    const payload: {
      id: string;
      title: string;
      description: string;
      secretProviderId?: string;
      remoteName?: string;
      value?: string;
    } = {
      id: secretId,
      title: values.title,
      description: values.description,
    };

    if (values.storageMode === 'remote') {
      payload.secretProviderId = values.providerId;
      payload.remoteName = values.remoteName;
    } else if (values.value) {
      payload.value = values.value;
    }

    updateSecretMutation.mutate(payload);
  };

  const handleEditOpenChange = (open: boolean) => {
    setEditOpen(open);
    if (!open) {
      setEditSecret(null);
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

  const providers = useMemo(() => providersQuery.data?.secretProviders ?? [], [providersQuery.data?.secretProviders]);
  const providerMap = useMemo(() => {
    return new Map(
      providers.flatMap((provider) => {
        const providerId = provider.meta?.id;
        return providerId ? ([[providerId, provider]] as const) : [];
      }),
    );
  }, [providers]);

  const secrets = secretsQuery.data?.pages.flatMap((page) => page.secrets) ?? [];
  const getProviderLabel = (providerId: string) => providerMap.get(providerId)?.title ?? (providerId || 'Remote provider');
  const getSourceLabel = (secret: Secret) => (isRemoteSecret(secret) ? getProviderLabel(secret.secretProviderId) : 'Built-in');
  const getSourceDetail = (secret: Secret) =>
    isRemoteSecret(secret) ? secret.remoteName || '—' : 'Stored in console';

  const listControls = useListControls({
    items: secrets,
    searchFields: [
      (secret) => secret.title,
      (secret) => secret.description,
      (secret) => secret.meta?.id ?? '',
      (secret) => getSourceLabel(secret),
      (secret) => getSourceDetail(secret),
      (secret) => formatDateOnly(secret.meta?.createdAt),
    ],
    sortOptions: {
      title: (secret) => secret.title,
      source: (secret) => getSourceLabel(secret),
      reference: (secret) => getSourceDetail(secret),
      created: (secret) => timestampToMillis(secret.meta?.createdAt),
    },
    defaultSortKey: 'title',
  });

  const visibleSecrets = listControls.filteredItems;
  const hasSearch = listControls.searchTerm.trim().length > 0;
  const isLoading = providersQuery.isPending || secretsQuery.isPending;
  const isError = providersQuery.isError || secretsQuery.isError;
  const editInitialValues = useMemo(() => buildFormValuesFromSecret(editSecret), [editSecret]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-sm flex-1">
          <Input
            placeholder="Search secrets..."
            value={listControls.searchTerm}
            onChange={(event) => listControls.setSearchTerm(event.target.value)}
            data-testid="list-search"
          />
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
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No secrets configured.</CardContent>
        </Card>
      ) : null}
      {secrets.length > 0 ? (
        <Card className="border-border" data-testid="secrets-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[2fr_1fr_1fr_1fr_140px]"
              data-testid="secrets-header"
            >
              <SortableHeader
                label="Title"
                sortKey="title"
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
                label="Reference"
                sortKey="reference"
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
                  {hasSearch ? 'No results found.' : 'No secrets configured.'}
                </div>
              ) : (
                visibleSecrets.map((secret) => (
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
                    <span className="text-xs text-muted-foreground" data-testid="secret-source">
                      {getSourceLabel(secret)}
                    </span>
                    <span className="text-xs text-muted-foreground" data-testid="secret-reference">
                      {getSourceDetail(secret)}
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
                ))
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}
      <LoadMoreButton
        hasMore={Boolean(secretsQuery.hasNextPage)}
        isLoading={secretsQuery.isFetchingNextPage}
        onClick={() => {
          void secretsQuery.fetchNextPage();
        }}
      />
      <SecretFormDialog
        mode="create"
        open={createOpen}
        onOpenChange={handleCreateOpenChange}
        providers={providers}
        initialValues={DEFAULT_FORM_VALUES}
        onSubmit={handleCreate}
        isSubmitting={createSecretMutation.isPending}
      />
      <SecretFormDialog
        mode="edit"
        open={editOpen}
        onOpenChange={handleEditOpenChange}
        providers={providers}
        initialValues={editInitialValues}
        onSubmit={handleEditSave}
        isSubmitting={updateSecretMutation.isPending}
        storageModeLocked
      />
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
