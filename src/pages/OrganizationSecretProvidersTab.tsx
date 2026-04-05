import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { secretsClient } from '@/api/client';
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
import type { SecretProvider } from '@/gen/agynio/api/secrets/v1/secrets_pb';
import { SecretProviderType } from '@/gen/agynio/api/secrets/v1/secrets_pb';
import { formatDateOnly, formatSecretProviderType } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

export function OrganizationSecretProvidersTab() {
  const { id } = useParams();
  const organizationId = id ?? '';
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createVaultAddress, setCreateVaultAddress] = useState('');
  const [createVaultToken, setCreateVaultToken] = useState('');
  const [createTitleError, setCreateTitleError] = useState('');
  const [createAddressError, setCreateAddressError] = useState('');
  const [createTokenError, setCreateTokenError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editProviderId, setEditProviderId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editVaultAddress, setEditVaultAddress] = useState('');
  const [editVaultToken, setEditVaultToken] = useState('');
  const [editOriginalAddress, setEditOriginalAddress] = useState('');
  const [editTitleError, setEditTitleError] = useState('');
  const [editAddressError, setEditAddressError] = useState('');
  const [editTokenError, setEditTokenError] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const providersQuery = useQuery({
    queryKey: ['secrets', organizationId, 'providers'],
    queryFn: () => secretsClient.listSecretProviders({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const createProviderMutation = useMutation({
    mutationFn: (payload: {
      title: string;
      description: string;
      type: SecretProviderType;
      config: { provider: { case: 'vault'; value: { address: string; token: string } } };
      organizationId: string;
    }) => secretsClient.createSecretProvider(payload),
    onSuccess: () => {
      toast.success('Secret provider created.');
      void queryClient.invalidateQueries({ queryKey: ['secrets', organizationId, 'providers'] });
      setCreateOpen(false);
      setCreateTitle('');
      setCreateDescription('');
      setCreateVaultAddress('');
      setCreateVaultToken('');
      setCreateTitleError('');
      setCreateAddressError('');
      setCreateTokenError('');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create secret provider.');
    },
  });

  const updateProviderMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      title?: string;
      description?: string;
      config?: { provider: { case: 'vault'; value: { address: string; token: string } } };
    }) => secretsClient.updateSecretProvider(payload),
    onSuccess: () => {
      toast.success('Secret provider updated.');
      void queryClient.invalidateQueries({ queryKey: ['secrets', organizationId, 'providers'] });
      setEditOpen(false);
      setEditProviderId(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update secret provider.');
    },
  });

  const deleteProviderMutation = useMutation({
    mutationFn: (providerId: string) => secretsClient.deleteSecretProvider({ id: providerId }),
    onSuccess: () => {
      toast.success('Secret provider deleted.');
      void queryClient.invalidateQueries({ queryKey: ['secrets', organizationId, 'providers'] });
      void queryClient.invalidateQueries({ queryKey: ['secrets', organizationId, 'list'] });
      setDeleteTargetId(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete secret provider.');
    },
  });

  const handleCreate = () => {
    const trimmedTitle = createTitle.trim();
    const trimmedAddress = createVaultAddress.trim();
    const trimmedToken = createVaultToken.trim();
    let hasError = false;

    if (!trimmedTitle) {
      setCreateTitleError('Title is required.');
      hasError = true;
    } else if (createTitleError) {
      setCreateTitleError('');
    }

    if (!trimmedAddress) {
      setCreateAddressError('Vault address is required.');
      hasError = true;
    } else if (createAddressError) {
      setCreateAddressError('');
    }

    if (!trimmedToken) {
      setCreateTokenError('Vault token is required.');
      hasError = true;
    } else if (createTokenError) {
      setCreateTokenError('');
    }

    if (hasError) return;

    createProviderMutation.mutate({
      title: trimmedTitle,
      description: createDescription.trim(),
      type: SecretProviderType.VAULT,
      config: {
        provider: {
          case: 'vault' as const,
          value: {
            address: trimmedAddress,
            token: trimmedToken,
          },
        },
      },
      organizationId,
    });
  };

  const handleCreateOpenChange = (open: boolean) => {
    setCreateOpen(open);
    if (!open) {
      setCreateTitle('');
      setCreateDescription('');
      setCreateVaultAddress('');
      setCreateVaultToken('');
      setCreateTitleError('');
      setCreateAddressError('');
      setCreateTokenError('');
    }
  };

  const handleEditOpen = (provider: SecretProvider) => {
    const providerId = provider.meta?.id;
    if (!providerId) {
      toast.error('Missing secret provider ID.');
      return;
    }
    const vaultAddress =
      provider.config?.provider.case === 'vault' ? provider.config.provider.value.address : '';
    setEditProviderId(providerId);
    setEditTitle(provider.title);
    setEditDescription(provider.description);
    setEditVaultAddress(vaultAddress);
    setEditOriginalAddress(vaultAddress);
    setEditVaultToken('');
    setEditTitleError('');
    setEditAddressError('');
    setEditTokenError('');
    setEditOpen(true);
  };

  const handleEditSave = () => {
    const trimmedTitle = editTitle.trim();
    const trimmedAddress = editVaultAddress.trim();
    const trimmedToken = editVaultToken.trim();
    let hasError = false;

    if (!trimmedTitle) {
      setEditTitleError('Title is required.');
      hasError = true;
    } else if (editTitleError) {
      setEditTitleError('');
    }

    if (!trimmedAddress) {
      setEditAddressError('Vault address is required.');
      hasError = true;
    } else if (editAddressError) {
      setEditAddressError('');
    }

    if (hasError) return;
    if (!editProviderId) {
      toast.error('Missing secret provider ID.');
      return;
    }

    let config: { provider: { case: 'vault'; value: { address: string; token: string } } } | undefined;
    if (trimmedToken) {
      config = {
        provider: {
          case: 'vault' as const,
          value: {
            address: trimmedAddress,
            token: trimmedToken,
          },
        },
      };
    } else if (trimmedAddress !== editOriginalAddress) {
      setEditTokenError('Vault token is required to update the address.');
      return;
    }

    updateProviderMutation.mutate({
      id: editProviderId,
      title: trimmedTitle,
      description: editDescription.trim(),
      ...(config ? { config } : {}),
    });
  };

  const handleEditOpenChange = (open: boolean) => {
    setEditOpen(open);
    if (!open) {
      setEditProviderId(null);
      setEditTitle('');
      setEditDescription('');
      setEditVaultAddress('');
      setEditVaultToken('');
      setEditOriginalAddress('');
      setEditTitleError('');
      setEditAddressError('');
      setEditTokenError('');
    }
  };

  const handleDeleteOpen = (provider: SecretProvider) => {
    const providerId = provider.meta?.id;
    if (!providerId) {
      toast.error('Missing secret provider ID.');
      return;
    }
    setDeleteTargetId(providerId);
  };

  const providers = providersQuery.data?.secretProviders ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3
            className="text-lg font-semibold text-[var(--agyn-dark)]"
            data-testid="organization-secret-providers-heading"
          >
            Secret Providers
          </h3>
          <p className="text-sm text-[var(--agyn-gray)]">Vault-backed secret providers for this organization.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleCreateOpenChange(true)}
          data-testid="organization-secret-providers-create"
        >
          Add provider
        </Button>
      </div>
      {providersQuery.isPending ? (
        <div className="text-sm text-[var(--agyn-gray)]">Loading secret providers...</div>
      ) : null}
      {providersQuery.isError ? (
        <div className="text-sm text-[var(--agyn-gray)]">Failed to load secret providers.</div>
      ) : null}
      {providers.length === 0 && !providersQuery.isPending ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="organization-secret-providers-empty">
          <CardContent className="py-10 text-center text-sm text-[var(--agyn-gray)]">
            No secret providers configured.
          </CardContent>
        </Card>
      ) : null}
      {providers.length > 0 ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="organization-secret-providers-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-[var(--agyn-gray)] md:grid-cols-[2fr_1fr_1fr_1fr_140px]"
              data-testid="organization-secret-providers-header"
            >
              <span>Title</span>
              <span>Type</span>
              <span>Vault Address</span>
              <span>Created</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-[var(--agyn-border-subtle)]">
              {providers.map((provider) => {
                const vaultAddress =
                  provider.config?.provider.case === 'vault' ? provider.config.provider.value.address : '—';
                return (
                  <div
                    key={provider.meta?.id ?? provider.title}
                    className="grid items-center gap-2 px-6 py-4 text-sm text-[var(--agyn-dark)] md:grid-cols-[2fr_1fr_1fr_1fr_140px]"
                    data-testid="organization-secret-provider-row"
                  >
                    <div>
                      <div className="font-medium" data-testid="organization-secret-provider-title">
                        {provider.title}
                      </div>
                      <div className="text-xs text-[var(--agyn-gray)]" data-testid="organization-secret-provider-id">
                        {provider.meta?.id ?? '—'}
                      </div>
                    </div>
                    <span className="text-xs text-[var(--agyn-gray)]" data-testid="organization-secret-provider-type">
                      {formatSecretProviderType(provider.type)}
                    </span>
                    <span
                      className="text-xs text-[var(--agyn-gray)]"
                      data-testid="organization-secret-provider-address"
                    >
                      {vaultAddress}
                    </span>
                    <span
                      className="text-xs text-[var(--agyn-gray)]"
                      data-testid="organization-secret-provider-created"
                    >
                      {formatDateOnly(provider.meta?.createdAt)}
                    </span>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditOpen(provider)}
                        data-testid="organization-secret-provider-edit"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDeleteOpen(provider)}
                        data-testid="organization-secret-provider-delete"
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
        <DialogContent data-testid="organization-secret-providers-create-dialog">
          <DialogHeader>
            <DialogTitle data-testid="organization-secret-providers-create-title">Add provider</DialogTitle>
            <DialogDescription data-testid="organization-secret-providers-create-description">
              Configure a new Vault secret provider.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              label="Title"
              value={createTitle}
              onChange={(event) => {
                setCreateTitle(event.target.value);
                if (createTitleError) setCreateTitleError('');
              }}
              error={createTitleError}
              data-testid="organization-secret-providers-create-title-input"
            />
            <Input
              label="Description"
              value={createDescription}
              onChange={(event) => setCreateDescription(event.target.value)}
              data-testid="organization-secret-providers-create-description-input"
            />
            <Input
              label="Vault Address"
              placeholder="http://vault:8200"
              value={createVaultAddress}
              onChange={(event) => {
                setCreateVaultAddress(event.target.value);
                if (createAddressError) setCreateAddressError('');
              }}
              error={createAddressError}
              data-testid="organization-secret-providers-create-address"
            />
            <Input
              label="Vault Token"
              type="password"
              value={createVaultToken}
              onChange={(event) => {
                setCreateVaultToken(event.target.value);
                if (createTokenError) setCreateTokenError('');
              }}
              error={createTokenError}
              data-testid="organization-secret-providers-create-token"
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="organization-secret-providers-create-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreate}
              disabled={createProviderMutation.isPending}
              data-testid="organization-secret-providers-create-submit"
            >
              {createProviderMutation.isPending ? 'Adding...' : 'Add provider'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={editOpen} onOpenChange={handleEditOpenChange}>
        <DialogContent data-testid="organization-secret-providers-edit-dialog">
          <DialogHeader>
            <DialogTitle data-testid="organization-secret-providers-edit-title">Edit provider</DialogTitle>
            <DialogDescription data-testid="organization-secret-providers-edit-description">
              Update Vault provider configuration.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              label="Title"
              value={editTitle}
              onChange={(event) => {
                setEditTitle(event.target.value);
                if (editTitleError) setEditTitleError('');
              }}
              error={editTitleError}
              data-testid="organization-secret-providers-edit-title-input"
            />
            <Input
              label="Description"
              value={editDescription}
              onChange={(event) => setEditDescription(event.target.value)}
              data-testid="organization-secret-providers-edit-description-input"
            />
            <Input
              label="Vault Address"
              placeholder="http://vault:8200"
              value={editVaultAddress}
              onChange={(event) => {
                setEditVaultAddress(event.target.value);
                if (editAddressError) setEditAddressError('');
                if (editTokenError) setEditTokenError('');
              }}
              error={editAddressError}
              data-testid="organization-secret-providers-edit-address"
            />
            <Input
              label="Vault Token"
              type="password"
              placeholder="Leave blank to keep current token"
              value={editVaultToken}
              onChange={(event) => {
                setEditVaultToken(event.target.value);
                if (editTokenError) setEditTokenError('');
              }}
              error={editTokenError}
              data-testid="organization-secret-providers-edit-token"
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="organization-secret-providers-edit-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="primary"
              size="sm"
              onClick={handleEditSave}
              disabled={updateProviderMutation.isPending}
              data-testid="organization-secret-providers-edit-submit"
            >
              {updateProviderMutation.isPending ? 'Saving...' : 'Save changes'}
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
        title="Delete secret provider"
        description="This will permanently remove the secret provider."
        confirmLabel="Delete provider"
        variant="danger"
        onConfirm={() => {
          if (deleteTargetId) {
            deleteProviderMutation.mutate(deleteTargetId);
          }
        }}
        isPending={deleteProviderMutation.isPending}
      />
    </div>
  );
}
