import { useState } from 'react';
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
import { AuthMethod, type LLMProvider } from '@/gen/agynio/api/llm/v1/llm_pb';
import { formatAuthMethod, formatDateOnly } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

export function OrganizationLlmProvidersTab() {
  const { id } = useParams();
  const organizationId = id ?? '';
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createEndpoint, setCreateEndpoint] = useState('');
  const [createAuthMethod, setCreateAuthMethod] = useState<AuthMethod>(AuthMethod.BEARER);
  const [createToken, setCreateToken] = useState('');
  const [createEndpointError, setCreateEndpointError] = useState('');
  const [createTokenError, setCreateTokenError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editProviderId, setEditProviderId] = useState<string | null>(null);
  const [editEndpoint, setEditEndpoint] = useState('');
  const [editAuthMethod, setEditAuthMethod] = useState<AuthMethod>(AuthMethod.BEARER);
  const [editToken, setEditToken] = useState('');
  const [editEndpointError, setEditEndpointError] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const providersQuery = useQuery({
    queryKey: ['llm', organizationId, 'providers'],
    queryFn: () => llmClient.listLLMProviders({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const createProviderMutation = useMutation({
    mutationFn: (payload: { endpoint: string; authMethod: AuthMethod; token: string; organizationId: string }) =>
      llmClient.createLLMProvider(payload),
    onSuccess: () => {
      toast.success('LLM provider created.');
      void queryClient.invalidateQueries({ queryKey: ['llm', organizationId, 'providers'] });
      setCreateOpen(false);
      setCreateEndpoint('');
      setCreateAuthMethod(AuthMethod.BEARER);
      setCreateToken('');
      setCreateEndpointError('');
      setCreateTokenError('');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create LLM provider.');
    },
  });

  const updateProviderMutation = useMutation({
    mutationFn: (payload: { id: string; endpoint?: string; authMethod?: AuthMethod; token?: string }) =>
      llmClient.updateLLMProvider(payload),
    onSuccess: () => {
      toast.success('LLM provider updated.');
      void queryClient.invalidateQueries({ queryKey: ['llm', organizationId, 'providers'] });
      setEditOpen(false);
      setEditProviderId(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update LLM provider.');
    },
  });

  const deleteProviderMutation = useMutation({
    mutationFn: (providerId: string) => llmClient.deleteLLMProvider({ id: providerId }),
    onSuccess: () => {
      toast.success('LLM provider deleted.');
      void queryClient.invalidateQueries({ queryKey: ['llm', organizationId, 'providers'] });
      void queryClient.invalidateQueries({ queryKey: ['llm', organizationId, 'models'] });
      setDeleteTargetId(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete LLM provider.');
    },
  });

  const isEndpointValid = (value: string) => value.startsWith('http://') || value.startsWith('https://');

  const handleCreate = () => {
    const trimmedEndpoint = createEndpoint.trim();
    const trimmedToken = createToken.trim();
    let hasError = false;

    if (!trimmedEndpoint) {
      setCreateEndpointError('Endpoint URL is required.');
      hasError = true;
    } else if (!isEndpointValid(trimmedEndpoint)) {
      setCreateEndpointError('Endpoint must start with http:// or https://.');
      hasError = true;
    } else if (createEndpointError) {
      setCreateEndpointError('');
    }

    if (!trimmedToken) {
      setCreateTokenError('Token is required.');
      hasError = true;
    } else if (createTokenError) {
      setCreateTokenError('');
    }

    if (hasError) return;

    createProviderMutation.mutate({
      endpoint: trimmedEndpoint,
      authMethod: createAuthMethod,
      token: trimmedToken,
      organizationId,
    });
  };

  const handleCreateOpenChange = (open: boolean) => {
    setCreateOpen(open);
    if (!open) {
      setCreateEndpoint('');
      setCreateAuthMethod(AuthMethod.BEARER);
      setCreateToken('');
      setCreateEndpointError('');
      setCreateTokenError('');
    }
  };

  const handleEditOpen = (provider: LLMProvider) => {
    const providerId = provider.meta?.id;
    if (!providerId) {
      toast.error('Missing LLM provider ID.');
      return;
    }
    setEditProviderId(providerId);
    setEditEndpoint(provider.endpoint);
    setEditAuthMethod(provider.authMethod || AuthMethod.BEARER);
    setEditToken('');
    setEditEndpointError('');
    setEditOpen(true);
  };

  const handleEditSave = () => {
    const trimmedEndpoint = editEndpoint.trim();
    if (!trimmedEndpoint) {
      setEditEndpointError('Endpoint URL is required.');
      return;
    }
    if (!isEndpointValid(trimmedEndpoint)) {
      setEditEndpointError('Endpoint must start with http:// or https://.');
      return;
    }
    if (!editProviderId) {
      toast.error('Missing LLM provider ID.');
      return;
    }
    const trimmedToken = editToken.trim();
    updateProviderMutation.mutate({
      id: editProviderId,
      endpoint: trimmedEndpoint,
      authMethod: editAuthMethod,
      ...(trimmedToken ? { token: trimmedToken } : {}),
    });
  };

  const handleEditOpenChange = (open: boolean) => {
    setEditOpen(open);
    if (!open) {
      setEditProviderId(null);
      setEditEndpoint('');
      setEditAuthMethod(AuthMethod.BEARER);
      setEditToken('');
      setEditEndpointError('');
    }
  };

  const handleDeleteOpen = (provider: LLMProvider) => {
    const providerId = provider.meta?.id;
    if (!providerId) {
      toast.error('Missing LLM provider ID.');
      return;
    }
    setDeleteTargetId(providerId);
  };

  const providers = providersQuery.data?.providers ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
        <h3
          className="text-lg font-semibold text-[var(--agyn-dark)]"
          data-testid="organization-llm-providers-heading"
        >
          LLM Providers
        </h3>
        <p className="text-sm text-[var(--agyn-gray)]">Provider endpoints configured for this organization.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleCreateOpenChange(true)}
          data-testid="organization-llm-providers-create"
        >
          Add provider
        </Button>
      </div>
      {providersQuery.isPending ? (
        <div className="text-sm text-[var(--agyn-gray)]">Loading providers...</div>
      ) : null}
      {providersQuery.isError ? (
        <div className="text-sm text-[var(--agyn-gray)]">Failed to load providers.</div>
      ) : null}
      {providers.length === 0 && !providersQuery.isPending ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="organization-llm-providers-empty">
          <CardContent className="py-10 text-center text-sm text-[var(--agyn-gray)]">
            No providers configured.
          </CardContent>
        </Card>
      ) : null}
      {providers.length > 0 ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="organization-llm-providers-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-[var(--agyn-gray)] md:grid-cols-[2fr_1fr_1fr_140px]"
              data-testid="organization-llm-providers-header"
            >
              <span>Provider</span>
              <span>Auth Method</span>
              <span>Created</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-[var(--agyn-border-subtle)]">
              {providers.map((provider) => (
                <div
                  key={provider.meta?.id ?? provider.endpoint}
                  className="grid items-center gap-2 px-6 py-4 text-sm text-[var(--agyn-dark)] md:grid-cols-[2fr_1fr_1fr_140px]"
                  data-testid="organization-llm-provider-row"
                >
                  <div>
                    <div className="font-medium" data-testid="organization-llm-provider-endpoint">
                      {provider.endpoint}
                    </div>
                    <div className="text-xs text-[var(--agyn-gray)]" data-testid="organization-llm-provider-id">
                      {provider.meta?.id ?? '—'}
                    </div>
                  </div>
                  <span className="text-xs text-[var(--agyn-gray)]" data-testid="organization-llm-provider-auth">
                    {formatAuthMethod(provider.authMethod)}
                  </span>
                  <span className="text-xs text-[var(--agyn-gray)]" data-testid="organization-llm-provider-created">
                    {formatDateOnly(provider.meta?.createdAt)}
                  </span>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditOpen(provider)}
                      data-testid="organization-llm-provider-edit"
                    >
                      Edit
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDeleteOpen(provider)}
                      data-testid="organization-llm-provider-delete"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
      <Dialog open={createOpen} onOpenChange={handleCreateOpenChange}>
        <DialogContent data-testid="organization-llm-providers-create-dialog">
          <DialogHeader>
            <DialogTitle data-testid="organization-llm-providers-create-title">Add provider</DialogTitle>
            <DialogDescription data-testid="organization-llm-providers-create-description">
              Register a new LLM provider endpoint.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              label="Endpoint URL"
              placeholder="https://api.example.com"
              value={createEndpoint}
              onChange={(event) => {
                setCreateEndpoint(event.target.value);
                if (createEndpointError) setCreateEndpointError('');
              }}
              error={createEndpointError}
              data-testid="organization-llm-providers-create-endpoint"
            />
            <div className="space-y-2">
              <div className="text-sm text-[var(--agyn-dark)]">Auth Method</div>
              <Select
                value={createAuthMethod === AuthMethod.BEARER ? 'bearer' : 'unspecified'}
                onValueChange={(value) =>
                  setCreateAuthMethod(value === 'bearer' ? AuthMethod.BEARER : AuthMethod.UNSPECIFIED)
                }
              >
                <SelectTrigger data-testid="organization-llm-providers-create-auth">
                  <SelectValue placeholder="Select auth method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bearer">Bearer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input
              label="Token"
              type="password"
              value={createToken}
              onChange={(event) => {
                setCreateToken(event.target.value);
                if (createTokenError) setCreateTokenError('');
              }}
              error={createTokenError}
              data-testid="organization-llm-providers-create-token"
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="organization-llm-providers-create-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreate}
              disabled={createProviderMutation.isPending}
              data-testid="organization-llm-providers-create-submit"
            >
              {createProviderMutation.isPending ? 'Adding...' : 'Add provider'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={editOpen} onOpenChange={handleEditOpenChange}>
        <DialogContent data-testid="organization-llm-providers-edit-dialog">
          <DialogHeader>
            <DialogTitle data-testid="organization-llm-providers-edit-title">Edit provider</DialogTitle>
            <DialogDescription data-testid="organization-llm-providers-edit-description">
              Update LLM provider configuration.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              label="Endpoint URL"
              value={editEndpoint}
              onChange={(event) => {
                setEditEndpoint(event.target.value);
                if (editEndpointError) setEditEndpointError('');
              }}
              error={editEndpointError}
              data-testid="organization-llm-providers-edit-endpoint"
            />
            <div className="space-y-2">
              <div className="text-sm text-[var(--agyn-dark)]">Auth Method</div>
              <Select
                value={editAuthMethod === AuthMethod.BEARER ? 'bearer' : 'unspecified'}
                onValueChange={(value) =>
                  setEditAuthMethod(value === 'bearer' ? AuthMethod.BEARER : AuthMethod.UNSPECIFIED)
                }
              >
                <SelectTrigger data-testid="organization-llm-providers-edit-auth">
                  <SelectValue placeholder="Select auth method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bearer">Bearer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input
              label="Token"
              type="password"
              placeholder="Leave blank to keep current token"
              value={editToken}
              onChange={(event) => setEditToken(event.target.value)}
              data-testid="organization-llm-providers-edit-token"
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="organization-llm-providers-edit-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="primary"
              size="sm"
              onClick={handleEditSave}
              disabled={updateProviderMutation.isPending}
              data-testid="organization-llm-providers-edit-submit"
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
        title="Delete provider"
        description="This will permanently remove the LLM provider."
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
