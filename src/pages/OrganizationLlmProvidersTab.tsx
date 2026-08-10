import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { llmClient } from '@/api/client';
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
import { AuthMethod, Protocol, type LLMProvider } from '@/gen/agynio/api/llm/v1/llm_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useListControls } from '@/hooks/useListControls';
import { formatAuthMethod, formatDateOnly, timestampToMillis } from '@/lib/format';
import {
  LLM_PROVIDER_PRESETS,
  formatLlmProtocol,
  type LlmProviderPresetKey,
} from '@/lib/llmProviders';
import { cn } from '@/lib/utils';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

const DEFAULT_PRESET = LLM_PROVIDER_PRESETS[0];

/**
 * A vendor is one of a handful of known things, so it gets tiles rather than a
 * dropdown: every option is visible at once and reachable in one click, and
 * each can carry what it implies about the endpoint underneath its name.
 */
function ProviderPresetPicker({
  value,
  onChange,
}: {
  value: LlmProviderPresetKey;
  onChange: (key: LlmProviderPresetKey) => void;
}) {
  const options: Array<{ key: LlmProviderPresetKey; label: string; hint: string }> = [
    ...LLM_PROVIDER_PRESETS.map((preset) => ({ key: preset.key, label: preset.label, hint: preset.hint })),
    { key: 'custom', label: 'Custom', hint: 'Your own endpoint' },
  ];

  return (
    <div role="radiogroup" aria-label="Provider" className="grid grid-cols-3 gap-2">
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.key)}
            className={cn(
              'flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              selected
                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                : 'border-border hover:bg-accent hover:text-accent-foreground',
            )}
            data-testid={`organization-llm-providers-create-preset-${option.key}`}
          >
            <span className="text-sm font-medium text-foreground">{option.label}</span>
            <span className="text-xs text-muted-foreground">{option.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

export function OrganizationLlmProvidersTab() {
  useDocumentTitle('LLM Providers');

  const { id } = useParams();
  const organizationId = id ?? '';
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createPreset, setCreatePreset] = useState<LlmProviderPresetKey>(DEFAULT_PRESET.key);
  const [createEndpoint, setCreateEndpoint] = useState(DEFAULT_PRESET.endpoint);
  const [createAuthMethod, setCreateAuthMethod] = useState<AuthMethod>(DEFAULT_PRESET.authMethod);
  const [createProtocol, setCreateProtocol] = useState<Protocol>(DEFAULT_PRESET.protocol);
  const [createToken, setCreateToken] = useState('');
  const [createEndpointError, setCreateEndpointError] = useState('');
  const [createTokenError, setCreateTokenError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editProviderId, setEditProviderId] = useState<string | null>(null);
  const [editEndpoint, setEditEndpoint] = useState('');
  const [editAuthMethod, setEditAuthMethod] = useState<AuthMethod>(AuthMethod.BEARER);
  const [editProtocol, setEditProtocol] = useState<Protocol>(Protocol.RESPONSES);
  const [editToken, setEditToken] = useState('');
  const [editEndpointError, setEditEndpointError] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const providersQuery = useInfiniteQuery({
    queryKey: ['llm', organizationId, 'providers', 'infinite'],
    queryFn: ({ pageParam }) =>
      llmClient.listLLMProviders({ organizationId, pageSize: DEFAULT_PAGE_SIZE, pageToken: pageParam }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const createProviderMutation = useMutation({
    mutationFn: (payload: {
      endpoint: string;
      authMethod: AuthMethod;
      protocol: Protocol;
      token: string;
      organizationId: string;
    }) => llmClient.createLLMProvider(payload),
    onSuccess: () => {
      toast.success('LLM provider created.');
      void queryClient.invalidateQueries({ queryKey: ['llm', organizationId, 'providers'] });
      setCreateOpen(false);
      resetCreateFields();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create LLM provider.');
    },
  });

  const updateProviderMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      endpoint?: string;
      authMethod?: AuthMethod;
      protocol?: Protocol;
      token?: string;
    }) => llmClient.updateLLMProvider(payload),
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

  const resetCreateFields = () => {
    setCreatePreset(DEFAULT_PRESET.key);
    setCreateEndpoint(DEFAULT_PRESET.endpoint);
    setCreateAuthMethod(DEFAULT_PRESET.authMethod);
    setCreateProtocol(DEFAULT_PRESET.protocol);
    setCreateToken('');
    setCreateEndpointError('');
    setCreateTokenError('');
  };

  // A preset fixes the endpoint, the auth method and the protocol together --
  // they are the vendor's, not a preference -- so choosing one sets all three
  // and the fields come off screen. Custom clears the endpoint to be typed.
  const handleCreatePresetChange = (key: LlmProviderPresetKey) => {
    setCreatePreset(key);
    const preset = LLM_PROVIDER_PRESETS.find((entry) => entry.key === key);
    if (preset) {
      setCreateEndpoint(preset.endpoint);
      setCreateAuthMethod(preset.authMethod);
      setCreateProtocol(preset.protocol);
    } else {
      setCreateEndpoint('');
    }
    setCreateEndpointError('');
  };

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
      protocol: createProtocol,
      token: trimmedToken,
      organizationId,
    });
  };

  const handleCreateOpenChange = (open: boolean) => {
    setCreateOpen(open);
    if (!open) {
      resetCreateFields();
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
    setEditProtocol(provider.protocol || Protocol.RESPONSES);
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
      protocol: editProtocol,
      ...(trimmedToken ? { token: trimmedToken } : {}),
    });
  };

  const handleEditOpenChange = (open: boolean) => {
    setEditOpen(open);
    if (!open) {
      setEditProviderId(null);
      setEditEndpoint('');
      setEditAuthMethod(AuthMethod.BEARER);
      setEditProtocol(Protocol.RESPONSES);
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

  const providers = providersQuery.data?.pages.flatMap((page) => page.providers) ?? [];
  const listControls = useListControls({
    items: providers,
    searchFields: [
      (provider) => provider.endpoint,
      (provider) => provider.meta?.id ?? '',
      (provider) => formatAuthMethod(provider.authMethod),
      (provider) => formatLlmProtocol(provider.protocol),
      (provider) => formatDateOnly(provider.meta?.createdAt),
    ],
    sortOptions: {
      endpoint: (provider) => provider.endpoint,
      authMethod: (provider) => formatAuthMethod(provider.authMethod),
      protocol: (provider) => formatLlmProtocol(provider.protocol),
      created: (provider) => timestampToMillis(provider.meta?.createdAt),
    },
    defaultSortKey: 'endpoint',
  });

  const visibleProviders = listControls.filteredItems;
  const hasSearch = listControls.searchTerm.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-sm flex-1">
          <Input
            placeholder="Search providers..."
            value={listControls.searchTerm}
            onChange={(event) => listControls.setSearchTerm(event.target.value)}
            data-testid="list-search"
          />
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
      {providersQuery.isPending ? <div className="text-sm text-muted-foreground">Loading providers...</div> : null}
      {providersQuery.isError ? <div className="text-sm text-muted-foreground">Failed to load providers.</div> : null}
      {providers.length === 0 && !providersQuery.isPending ? (
        <Card className="border-border" data-testid="organization-llm-providers-empty">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No providers configured.
          </CardContent>
        </Card>
      ) : null}
      {providers.length > 0 ? (
        <Card className="border-border" data-testid="organization-llm-providers-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[2fr_1fr_1fr_1fr_140px]"
              data-testid="organization-llm-providers-header"
            >
              <SortableHeader
                label="Provider"
                sortKey="endpoint"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Auth Method"
                sortKey="authMethod"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Protocol"
                sortKey="protocol"
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
              {visibleProviders.length === 0 ? (
                <div className="px-6 py-6 text-sm text-muted-foreground">
                  {hasSearch ? 'No results found.' : 'No LLM providers configured.'}
                </div>
              ) : (
                visibleProviders.map((provider) => (
                  <div
                    key={provider.meta?.id ?? provider.endpoint}
                    className="grid items-center gap-2 px-6 py-4 text-sm text-foreground md:grid-cols-[2fr_1fr_1fr_1fr_140px]"
                    data-testid="organization-llm-provider-row"
                  >
                    <div>
                      <div className="font-medium" data-testid="organization-llm-provider-endpoint">
                        {provider.endpoint}
                      </div>
                      <div className="text-xs text-muted-foreground" data-testid="organization-llm-provider-id">
                        {provider.meta?.id ?? '—'}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground" data-testid="organization-llm-provider-auth">
                      {formatAuthMethod(provider.authMethod)}
                    </span>
                    <span className="text-xs text-muted-foreground" data-testid="organization-llm-provider-protocol">
                      {formatLlmProtocol(provider.protocol)}
                    </span>
                    <span className="text-xs text-muted-foreground" data-testid="organization-llm-provider-created">
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
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteOpen(provider)}
                        data-testid="organization-llm-provider-delete"
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
        hasMore={Boolean(providersQuery.hasNextPage)}
        isLoading={providersQuery.isFetchingNextPage}
        onClick={() => {
          void providersQuery.fetchNextPage();
        }}
      />
      <Dialog open={createOpen} onOpenChange={handleCreateOpenChange}>
        <DialogContent data-testid="organization-llm-providers-create-dialog">
          <DialogHeader>
            <DialogTitle data-testid="organization-llm-providers-create-title">Add provider</DialogTitle>
            <DialogDescription data-testid="organization-llm-providers-create-description">
              Register a new LLM provider endpoint.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Provider</Label>
              <ProviderPresetPicker value={createPreset} onChange={handleCreatePresetChange} />
            </div>
            {createPreset === 'custom' ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="organization-llm-providers-create-endpoint">Endpoint URL</Label>
                  <Input
                    id="organization-llm-providers-create-endpoint"
                    placeholder="https://api.example.com/v1/responses"
                    value={createEndpoint}
                    onChange={(event) => {
                      setCreateEndpoint(event.target.value);
                      if (createEndpointError) setCreateEndpointError('');
                    }}
                    data-testid="organization-llm-providers-create-endpoint"
                  />
                  {createEndpointError ? <p className="text-sm text-destructive">{createEndpointError}</p> : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="organization-llm-providers-create-auth">Auth Method</Label>
                  <Select
                    value={createAuthMethod === AuthMethod.X_API_KEY ? 'x-api-key' : 'bearer'}
                    onValueChange={(value) =>
                      setCreateAuthMethod(value === 'x-api-key' ? AuthMethod.X_API_KEY : AuthMethod.BEARER)
                    }
                  >
                    <SelectTrigger
                      id="organization-llm-providers-create-auth"
                      data-testid="organization-llm-providers-create-auth"
                    >
                      <SelectValue placeholder="Select auth method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bearer">Bearer</SelectItem>
                      <SelectItem value="x-api-key">x-api-key</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="organization-llm-providers-create-protocol">Protocol</Label>
                  <Select
                    value={createProtocol === Protocol.ANTHROPIC_MESSAGES ? 'anthropic-messages' : 'responses'}
                    onValueChange={(value) =>
                      setCreateProtocol(
                        value === 'anthropic-messages' ? Protocol.ANTHROPIC_MESSAGES : Protocol.RESPONSES,
                      )
                    }
                  >
                    <SelectTrigger
                      id="organization-llm-providers-create-protocol"
                      data-testid="organization-llm-providers-create-protocol"
                    >
                      <SelectValue placeholder="Select protocol" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="responses">Responses</SelectItem>
                      <SelectItem value="anthropic-messages">Anthropic Messages</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    The request shape the endpoint answers. The proxy reads usage out of the response with it, so a
                    mismatch bills nothing.
                  </p>
                </div>
              </>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="organization-llm-providers-create-token">
                {createPreset === 'custom' ? 'Token' : 'API key'}
              </Label>
              <Input
                id="organization-llm-providers-create-token"
                type="password"
                placeholder={LLM_PROVIDER_PRESETS.find((preset) => preset.key === createPreset)?.tokenPlaceholder}
                value={createToken}
                onChange={(event) => {
                  setCreateToken(event.target.value);
                  if (createTokenError) setCreateTokenError('');
                }}
                data-testid="organization-llm-providers-create-token"
              />
              {createTokenError ? <p className="text-sm text-destructive">{createTokenError}</p> : null}
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="organization-llm-providers-create-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
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
            <div className="space-y-2">
              <Label htmlFor="organization-llm-providers-edit-endpoint">Endpoint URL</Label>
              <Input
                id="organization-llm-providers-edit-endpoint"
                value={editEndpoint}
                onChange={(event) => {
                  setEditEndpoint(event.target.value);
                  if (editEndpointError) setEditEndpointError('');
                }}
                data-testid="organization-llm-providers-edit-endpoint"
              />
              {editEndpointError ? <p className="text-sm text-destructive">{editEndpointError}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="organization-llm-providers-edit-auth">Auth Method</Label>
              <Select
                value={editAuthMethod === AuthMethod.X_API_KEY ? 'x-api-key' : 'bearer'}
                onValueChange={(value) =>
                  setEditAuthMethod(value === 'x-api-key' ? AuthMethod.X_API_KEY : AuthMethod.BEARER)
                }
              >
                <SelectTrigger
                  id="organization-llm-providers-edit-auth"
                  data-testid="organization-llm-providers-edit-auth"
                >
                  <SelectValue placeholder="Select auth method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bearer">Bearer</SelectItem>
                  <SelectItem value="x-api-key">x-api-key</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="organization-llm-providers-edit-protocol">Protocol</Label>
              <Select
                value={editProtocol === Protocol.ANTHROPIC_MESSAGES ? 'anthropic-messages' : 'responses'}
                onValueChange={(value) =>
                  setEditProtocol(value === 'anthropic-messages' ? Protocol.ANTHROPIC_MESSAGES : Protocol.RESPONSES)
                }
              >
                <SelectTrigger
                  id="organization-llm-providers-edit-protocol"
                  data-testid="organization-llm-providers-edit-protocol"
                >
                  <SelectValue placeholder="Select protocol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="responses">Responses</SelectItem>
                  <SelectItem value="anthropic-messages">Anthropic Messages</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The request shape the endpoint answers. The proxy reads usage out of the response with it, so a
                mismatch bills nothing.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="organization-llm-providers-edit-token">Token</Label>
              <Input
                id="organization-llm-providers-edit-token"
                type="password"
                placeholder="Leave blank to keep current token"
                value={editToken}
                onChange={(event) => setEditToken(event.target.value)}
                data-testid="organization-llm-providers-edit-token"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="organization-llm-providers-edit-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
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
