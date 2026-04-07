import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usersClient } from '@/api/client';
import { SortableHeader } from '@/components/SortableHeader';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CreateApiTokenDialog } from '@/components/CreateApiTokenDialog';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { APIToken } from '@/gen/agynio/api/users/v1/users_pb';
import { useListControls } from '@/hooks/useListControls';
import { formatDateOnly, timestampToMillis } from '@/lib/format';
import { toast } from 'sonner';

export function ApiTokensPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [revokeToken, setRevokeToken] = useState<APIToken | null>(null);

  const tokensQuery = useQuery({
    queryKey: ['api-tokens', 'list'],
    queryFn: () => usersClient.listAPITokens({}),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const revokeMutation = useMutation({
    mutationFn: (tokenId: string) => usersClient.revokeAPIToken({ tokenId }),
    onSuccess: () => {
      toast.success('API token revoked.');
      void queryClient.invalidateQueries({ queryKey: ['api-tokens'] });
      setRevokeToken(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to revoke token.');
    },
  });

  const tokens = tokensQuery.data?.tokens ?? [];
  const listControls = useListControls({
    items: tokens,
    searchFields: [
      (token) => token.name,
      (token) => token.tokenPrefix,
      (token) => formatDateOnly(token.createdAt),
      (token) => (token.expiresAt ? formatDateOnly(token.expiresAt) : 'Never'),
      (token) => (token.lastUsedAt ? formatDateOnly(token.lastUsedAt) : 'Never'),
    ],
    sortOptions: {
      name: (token) => token.name,
      prefix: (token) => token.tokenPrefix,
      created: (token) => timestampToMillis(token.createdAt),
      expires: (token) => (token.expiresAt ? timestampToMillis(token.expiresAt) : Number.MAX_SAFE_INTEGER),
      lastUsed: (token) => (token.lastUsedAt ? timestampToMillis(token.lastUsedAt) : 0),
    },
    defaultSortKey: 'name',
  });

  const visibleTokens = listControls.filteredItems;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">API Tokens</h2>
          <p className="text-sm text-muted-foreground">Issue and revoke platform API tokens.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)} data-testid="api-tokens-create">
          Create token
        </Button>
      </div>
      <div className="max-w-sm">
        <Input
          placeholder="Search tokens..."
          value={listControls.searchTerm}
          onChange={(event) => listControls.setSearchTerm(event.target.value)}
          data-testid="list-search"
        />
      </div>
      {tokensQuery.isPending ? <div className="text-sm text-muted-foreground">Loading tokens...</div> : null}
      {tokensQuery.isError ? <div className="text-sm text-muted-foreground">Failed to load tokens.</div> : null}
      {tokens.length === 0 && !tokensQuery.isPending ? (
        <Card className="border-border" data-testid="api-tokens-empty">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No API tokens. Create one to enable programmatic API access.
          </CardContent>
        </Card>
      ) : null}
      {tokens.length > 0 ? (
        <Card className="border-border" data-testid="api-tokens-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[2fr_1fr_1fr_1fr_1fr_120px]"
              data-testid="api-tokens-header"
            >
              <SortableHeader
                label="Name"
                sortKey="name"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Token Prefix"
                sortKey="prefix"
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
              <SortableHeader
                label="Expires"
                sortKey="expires"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Last Used"
                sortKey="lastUsed"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-border">
              {visibleTokens.length === 0 ? (
                <div className="px-6 py-6 text-sm text-muted-foreground">No results found.</div>
              ) : (
                visibleTokens.map((token) => (
                  <div
                    key={token.id}
                    className="grid items-center gap-2 px-6 py-4 text-sm text-foreground md:grid-cols-[2fr_1fr_1fr_1fr_1fr_120px]"
                    data-testid="api-token-row"
                  >
                    <span className="font-medium" data-testid="api-token-name">
                      {token.name}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground" data-testid="api-token-prefix">
                      {token.tokenPrefix}
                    </span>
                    <span className="text-xs text-muted-foreground" data-testid="api-token-created">
                      {formatDateOnly(token.createdAt)}
                    </span>
                    <span className="text-xs text-muted-foreground" data-testid="api-token-expires">
                      {token.expiresAt ? formatDateOnly(token.expiresAt) : 'Never'}
                    </span>
                    <span className="text-xs text-muted-foreground" data-testid="api-token-last-used">
                      {token.lastUsedAt ? formatDateOnly(token.lastUsedAt) : 'Never'}
                    </span>
                    <div className="text-right">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setRevokeToken(token)}
                        data-testid="api-token-revoke"
                      >
                        Revoke
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}
      <CreateApiTokenDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ConfirmDialog
        open={Boolean(revokeToken)}
        onOpenChange={(open) => {
          if (!open) setRevokeToken(null);
        }}
        title="Revoke API token"
        description="This token will no longer be valid for API access."
        confirmLabel="Revoke token"
        variant="danger"
        onConfirm={() => {
          if (revokeToken?.id) {
            revokeMutation.mutate(revokeToken.id);
          }
        }}
        isPending={revokeMutation.isPending}
      />
    </div>
  );
}
