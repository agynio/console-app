import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usersClient } from '@/api/client';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CreateApiTokenDialog } from '@/components/CreateApiTokenDialog';
import { Card, CardContent } from '@/components/ui/card';
import type { APIToken } from '@/gen/agynio/api/users/v1/users_pb';
import { formatDateOnly } from '@/lib/format';
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-[var(--agyn-dark)]">API Tokens</h2>
          <p className="text-sm text-[var(--agyn-gray)]">Issue and revoke platform API tokens.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)} data-testid="api-tokens-create">
          Create token
        </Button>
      </div>
      {tokensQuery.isPending ? <div className="text-sm text-[var(--agyn-gray)]">Loading tokens...</div> : null}
      {tokensQuery.isError ? <div className="text-sm text-[var(--agyn-gray)]">Failed to load tokens.</div> : null}
      {tokens.length === 0 && !tokensQuery.isPending ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="api-tokens-empty">
          <CardContent className="py-10 text-center text-sm text-[var(--agyn-gray)]">
            No API tokens. Create one to enable programmatic API access.
          </CardContent>
        </Card>
      ) : null}
      {tokens.length > 0 ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="api-tokens-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-[var(--agyn-gray)] md:grid-cols-[2fr_1fr_1fr_1fr_1fr_120px]"
              data-testid="api-tokens-header"
            >
              <span>Name</span>
              <span>Token Prefix</span>
              <span>Created</span>
              <span>Expires</span>
              <span>Last Used</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-[var(--agyn-border-subtle)]">
              {tokens.map((token) => (
                <div
                  key={token.id}
                  className="grid items-center gap-2 px-6 py-4 text-sm text-[var(--agyn-dark)] md:grid-cols-[2fr_1fr_1fr_1fr_1fr_120px]"
                  data-testid="api-token-row"
                >
                  <span className="font-medium" data-testid="api-token-name">
                    {token.name}
                  </span>
                  <span className="text-xs font-mono text-[var(--agyn-gray)]" data-testid="api-token-prefix">
                    {token.tokenPrefix}
                  </span>
                  <span className="text-xs text-[var(--agyn-gray)]" data-testid="api-token-created">
                    {formatDateOnly(token.createdAt)}
                  </span>
                  <span className="text-xs text-[var(--agyn-gray)]" data-testid="api-token-expires">
                    {token.expiresAt ? formatDateOnly(token.expiresAt) : 'Never'}
                  </span>
                  <span className="text-xs text-[var(--agyn-gray)]" data-testid="api-token-last-used">
                    {token.lastUsedAt ? formatDateOnly(token.lastUsedAt) : 'Never'}
                  </span>
                  <div className="text-right">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setRevokeToken(token)}
                      data-testid="api-token-revoke"
                    >
                      Revoke
                    </Button>
                  </div>
                </div>
              ))}
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
