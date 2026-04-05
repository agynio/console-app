import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { llmClient } from '@/api/client';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
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
import type { Model } from '@/gen/agynio/api/llm/v1/llm_pb';
import { formatDateOnly } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

export function OrganizationModelsTab() {
  const { id } = useParams();
  const organizationId = id ?? '';
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createProviderId, setCreateProviderId] = useState('');
  const [createRemoteName, setCreateRemoteName] = useState('');
  const [createNameError, setCreateNameError] = useState('');
  const [createProviderError, setCreateProviderError] = useState('');
  const [createRemoteError, setCreateRemoteError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editModelId, setEditModelId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editProviderId, setEditProviderId] = useState('');
  const [editRemoteName, setEditRemoteName] = useState('');
  const [editNameError, setEditNameError] = useState('');
  const [editProviderError, setEditProviderError] = useState('');
  const [editRemoteError, setEditRemoteError] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const modelsQuery = useQuery({
    queryKey: ['llm', organizationId, 'models'],
    queryFn: () => llmClient.listModels({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const providersQuery = useQuery({
    queryKey: ['llm', organizationId, 'providers'],
    queryFn: () => llmClient.listLLMProviders({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const createModelMutation = useMutation({
    mutationFn: (payload: {
      name: string;
      llmProviderId: string;
      remoteName: string;
      organizationId: string;
    }) => llmClient.createModel(payload),
    onSuccess: () => {
      toast.success('Model created.');
      void queryClient.invalidateQueries({ queryKey: ['llm', organizationId, 'models'] });
      setCreateOpen(false);
      setCreateName('');
      setCreateProviderId('');
      setCreateRemoteName('');
      setCreateNameError('');
      setCreateProviderError('');
      setCreateRemoteError('');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create model.');
    },
  });

  const updateModelMutation = useMutation({
    mutationFn: (payload: { id: string; name?: string; llmProviderId?: string; remoteName?: string }) =>
      llmClient.updateModel(payload),
    onSuccess: () => {
      toast.success('Model updated.');
      void queryClient.invalidateQueries({ queryKey: ['llm', organizationId, 'models'] });
      setEditOpen(false);
      setEditModelId(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update model.');
    },
  });

  const deleteModelMutation = useMutation({
    mutationFn: (modelId: string) => llmClient.deleteModel({ id: modelId }),
    onSuccess: () => {
      toast.success('Model deleted.');
      void queryClient.invalidateQueries({ queryKey: ['llm', organizationId, 'models'] });
      setDeleteTargetId(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete model.');
    },
  });

  const handleCreate = () => {
    const trimmedName = createName.trim();
    const trimmedRemote = createRemoteName.trim();
    let hasError = false;

    if (!trimmedName) {
      setCreateNameError('Name is required.');
      hasError = true;
    } else if (createNameError) {
      setCreateNameError('');
    }

    if (!createProviderId) {
      setCreateProviderError('Select a provider.');
      hasError = true;
    } else if (createProviderError) {
      setCreateProviderError('');
    }

    if (!trimmedRemote) {
      setCreateRemoteError('Remote model name is required.');
      hasError = true;
    } else if (createRemoteError) {
      setCreateRemoteError('');
    }

    if (hasError) return;

    createModelMutation.mutate({
      name: trimmedName,
      llmProviderId: createProviderId,
      remoteName: trimmedRemote,
      organizationId,
    });
  };

  const handleCreateOpenChange = (open: boolean) => {
    setCreateOpen(open);
    if (!open) {
      setCreateName('');
      setCreateProviderId('');
      setCreateRemoteName('');
      setCreateNameError('');
      setCreateProviderError('');
      setCreateRemoteError('');
    }
  };

  const handleEditOpen = (model: Model) => {
    const modelId = model.meta?.id;
    if (!modelId) {
      toast.error('Missing model ID.');
      return;
    }
    setEditModelId(modelId);
    setEditName(model.name);
    setEditProviderId(model.llmProviderId);
    setEditRemoteName(model.remoteName);
    setEditNameError('');
    setEditProviderError('');
    setEditRemoteError('');
    setEditOpen(true);
  };

  const handleEditSave = () => {
    const trimmedName = editName.trim();
    const trimmedRemote = editRemoteName.trim();
    let hasError = false;

    if (!trimmedName) {
      setEditNameError('Name is required.');
      hasError = true;
    } else if (editNameError) {
      setEditNameError('');
    }

    if (!editProviderId) {
      setEditProviderError('Select a provider.');
      hasError = true;
    } else if (editProviderError) {
      setEditProviderError('');
    }

    if (!trimmedRemote) {
      setEditRemoteError('Remote model name is required.');
      hasError = true;
    } else if (editRemoteError) {
      setEditRemoteError('');
    }

    if (hasError) return;
    if (!editModelId) {
      toast.error('Missing model ID.');
      return;
    }

    updateModelMutation.mutate({
      id: editModelId,
      name: trimmedName,
      llmProviderId: editProviderId,
      remoteName: trimmedRemote,
    });
  };

  const handleEditOpenChange = (open: boolean) => {
    setEditOpen(open);
    if (!open) {
      setEditModelId(null);
      setEditName('');
      setEditProviderId('');
      setEditRemoteName('');
      setEditNameError('');
      setEditProviderError('');
      setEditRemoteError('');
    }
  };

  const handleDeleteOpen = (model: Model) => {
    const modelId = model.meta?.id;
    if (!modelId) {
      toast.error('Missing model ID.');
      return;
    }
    setDeleteTargetId(modelId);
  };

  const providerMap = useMemo(() => {
    const providers = providersQuery.data?.providers ?? [];
    return new Map(
      providers.flatMap((provider) => {
        const providerId = provider.meta?.id;
        return providerId ? ([[providerId, provider]] as const) : [];
      }),
    );
  }, [providersQuery.data?.providers]);

  const models = modelsQuery.data?.models ?? [];
  const isLoading = modelsQuery.isPending || providersQuery.isPending;
  const isError = modelsQuery.isError || providersQuery.isError;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
        <h3 className="text-lg font-semibold text-[var(--agyn-dark)]" data-testid="organization-models-heading">
          Models
        </h3>
        <p className="text-sm text-[var(--agyn-gray)]">Models available in this organization.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleCreateOpenChange(true)}
          data-testid="organization-models-create"
        >
          Add model
        </Button>
      </div>
      {isLoading ? <div className="text-sm text-[var(--agyn-gray)]">Loading models...</div> : null}
      {isError ? <div className="text-sm text-[var(--agyn-gray)]">Failed to load models.</div> : null}
      {models.length === 0 && !isLoading ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="organization-models-empty">
          <CardContent className="py-10 text-center text-sm text-[var(--agyn-gray)]">No models found.</CardContent>
        </Card>
      ) : null}
      {models.length > 0 ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="organization-models-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-[var(--agyn-gray)] md:grid-cols-[2fr_1fr_1fr_1fr_140px]"
              data-testid="organization-models-header"
            >
              <span>Model</span>
              <span>Provider</span>
              <span>Remote Name</span>
              <span>Created</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-[var(--agyn-border-subtle)]">
              {models.map((model) => {
                const provider = providerMap.get(model.llmProviderId);
                return (
                  <div
                    key={model.meta?.id ?? model.name}
                    className="grid items-center gap-2 px-6 py-4 text-sm text-[var(--agyn-dark)] md:grid-cols-[2fr_1fr_1fr_1fr_140px]"
                    data-testid="organization-model-row"
                  >
                    <div>
                      <div className="font-medium" data-testid="organization-model-name">
                        {model.name}
                      </div>
                      <div className="text-xs text-[var(--agyn-gray)]" data-testid="organization-model-id">
                        {model.meta?.id ?? '—'}
                      </div>
                    </div>
                    <span className="text-xs text-[var(--agyn-gray)]" data-testid="organization-model-provider">
                      {provider?.endpoint ?? (model.llmProviderId || '—')}
                    </span>
                    <span className="text-xs text-[var(--agyn-gray)]" data-testid="organization-model-remote">
                      {model.remoteName || '—'}
                    </span>
                    <span className="text-xs text-[var(--agyn-gray)]" data-testid="organization-model-created">
                      {formatDateOnly(model.meta?.createdAt)}
                    </span>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditOpen(model)}
                        data-testid="organization-model-edit"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDeleteOpen(model)}
                        data-testid="organization-model-delete"
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
        <DialogContent data-testid="organization-models-create-dialog">
          <DialogHeader>
            <DialogTitle data-testid="organization-models-create-title">Add model</DialogTitle>
            <DialogDescription data-testid="organization-models-create-description">
              Register a new model for this organization.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              label="Name"
              value={createName}
              onChange={(event) => {
                setCreateName(event.target.value);
                if (createNameError) setCreateNameError('');
              }}
              error={createNameError}
              data-testid="organization-models-create-name"
            />
            <div className="space-y-2">
              <div className="text-sm text-[var(--agyn-dark)]">Provider</div>
              <Select
                value={createProviderId}
                onValueChange={(value) => {
                  setCreateProviderId(value);
                  if (createProviderError) setCreateProviderError('');
                }}
              >
                <SelectTrigger data-testid="organization-models-create-provider">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {(providersQuery.data?.providers ?? []).map((provider) => {
                    const providerId = provider.meta?.id;
                    if (!providerId) return null;
                    return (
                      <SelectItem key={providerId} value={providerId}>
                        {provider.endpoint}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {createProviderError ? (
                <div className="text-xs text-[var(--agyn-danger)]" data-testid="organization-models-create-error">
                  {createProviderError}
                </div>
              ) : null}
            </div>
            <Input
              label="Remote Model Name"
              value={createRemoteName}
              onChange={(event) => {
                setCreateRemoteName(event.target.value);
                if (createRemoteError) setCreateRemoteError('');
              }}
              error={createRemoteError}
              data-testid="organization-models-create-remote"
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="organization-models-create-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreate}
              disabled={createModelMutation.isPending}
              data-testid="organization-models-create-submit"
            >
              {createModelMutation.isPending ? 'Adding...' : 'Add model'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={editOpen} onOpenChange={handleEditOpenChange}>
        <DialogContent data-testid="organization-models-edit-dialog">
          <DialogHeader>
            <DialogTitle data-testid="organization-models-edit-title">Edit model</DialogTitle>
            <DialogDescription data-testid="organization-models-edit-description">
              Update model details for this organization.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              label="Name"
              value={editName}
              onChange={(event) => {
                setEditName(event.target.value);
                if (editNameError) setEditNameError('');
              }}
              error={editNameError}
              data-testid="organization-models-edit-name"
            />
            <div className="space-y-2">
              <div className="text-sm text-[var(--agyn-dark)]">Provider</div>
              <Select
                value={editProviderId}
                onValueChange={(value) => {
                  setEditProviderId(value);
                  if (editProviderError) setEditProviderError('');
                }}
              >
                <SelectTrigger data-testid="organization-models-edit-provider">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {(providersQuery.data?.providers ?? []).map((provider) => {
                    const providerId = provider.meta?.id;
                    if (!providerId) return null;
                    return (
                      <SelectItem key={providerId} value={providerId}>
                        {provider.endpoint}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {editProviderError ? (
                <div className="text-xs text-[var(--agyn-danger)]" data-testid="organization-models-edit-error">
                  {editProviderError}
                </div>
              ) : null}
            </div>
            <Input
              label="Remote Model Name"
              value={editRemoteName}
              onChange={(event) => {
                setEditRemoteName(event.target.value);
                if (editRemoteError) setEditRemoteError('');
              }}
              error={editRemoteError}
              data-testid="organization-models-edit-remote"
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="organization-models-edit-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="primary"
              size="sm"
              onClick={handleEditSave}
              disabled={updateModelMutation.isPending}
              data-testid="organization-models-edit-submit"
            >
              {updateModelMutation.isPending ? 'Saving...' : 'Save changes'}
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
        title="Delete model"
        description="This will permanently remove the model."
        confirmLabel="Delete model"
        variant="danger"
        onConfirm={() => {
          if (deleteTargetId) {
            deleteModelMutation.mutate(deleteTargetId);
          }
        }}
        isPending={deleteModelMutation.isPending}
      />
    </div>
  );
}
