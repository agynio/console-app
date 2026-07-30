import { useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agentsClient } from '@/api/client';
import { SortableHeader } from '@/components/SortableHeader';
import { LoadMoreButton } from '@/components/LoadMoreButton';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { Sandbox } from '@/gen/agynio/api/agents/v1/agents_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useListControls } from '@/hooks/useListControls';
import { EMPTY_PLACEHOLDER, formatTimestamp, timestampToMillis } from '@/lib/format';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { canStopSandbox, formatSandboxStatus, sandboxStatusVariant } from '@/lib/sandbox';
import { toast } from 'sonner';

export function OrganizationSandboxesTab() {
  useDocumentTitle('Sandboxes');

  const { id } = useParams();
  const organizationId = id ?? '';
  const queryClient = useQueryClient();
  const [stopTarget, setStopTarget] = useState<Sandbox | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Sandbox | null>(null);

  const sandboxesQuery = useInfiniteQuery({
    queryKey: ['sandboxes', organizationId, 'list', 'infinite'],
    queryFn: ({ pageParam }) =>
      agentsClient.listSandboxes({ organizationId, pageSize: DEFAULT_PAGE_SIZE, pageToken: pageParam }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const invalidateSandboxes = () => {
    void queryClient.invalidateQueries({ queryKey: ['sandboxes', organizationId, 'list'] });
  };

  const stopSandboxMutation = useMutation({
    mutationFn: (sandboxId: string) => agentsClient.stopSandbox({ id: sandboxId }),
    onSuccess: () => {
      toast.success('Sandbox stopped.');
      invalidateSandboxes();
      setStopTarget(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to stop sandbox.');
    },
  });

  const deleteSandboxMutation = useMutation({
    mutationFn: (sandboxId: string) => agentsClient.deleteSandbox({ id: sandboxId }),
    onSuccess: () => {
      toast.success('Sandbox deleted.');
      invalidateSandboxes();
      setDeleteTarget(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete sandbox.');
    },
  });

  const sandboxes = sandboxesQuery.data?.pages.flatMap((page) => page.sandboxes) ?? [];
  const listControls = useListControls({
    items: sandboxes,
    searchFields: [
      (sandbox) => sandbox.name,
      (sandbox) => sandbox.meta?.id ?? '',
      (sandbox) => sandbox.environmentName,
      (sandbox) => formatSandboxStatus(sandbox.status),
    ],
    sortOptions: {
      name: (sandbox) => sandbox.name,
      environment: (sandbox) => sandbox.environmentName,
      status: (sandbox) => formatSandboxStatus(sandbox.status),
      lastSession: (sandbox) => timestampToMillis(sandbox.lastSessionAt),
    },
    defaultSortKey: 'name',
  });

  const visibleSandboxes = listControls.filteredItems;
  const hasSearch = listControls.searchTerm.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="max-w-sm">
        <Input
          placeholder="Search sandboxes..."
          value={listControls.searchTerm}
          onChange={(event) => listControls.setSearchTerm(event.target.value)}
          data-testid="list-search"
        />
      </div>
      {sandboxesQuery.isPending ? <div className="text-sm text-muted-foreground">Loading sandboxes...</div> : null}
      {sandboxesQuery.isError ? <div className="text-sm text-muted-foreground">Failed to load sandboxes.</div> : null}
      {sandboxes.length === 0 && !sandboxesQuery.isPending ? (
        <Card className="border-border" data-testid="organization-sandboxes-empty">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No sandboxes provisioned.
          </CardContent>
        </Card>
      ) : null}
      {sandboxes.length > 0 ? (
        <Card className="border-border" data-testid="organization-sandboxes-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[2fr_1fr_1fr_1fr_200px]"
              data-testid="organization-sandboxes-header"
            >
              <SortableHeader
                label="Sandbox"
                sortKey="name"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Environment"
                sortKey="environment"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Status"
                sortKey="status"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Last Session"
                sortKey="lastSession"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-border">
              {visibleSandboxes.length === 0 ? (
                <div className="px-6 py-6 text-sm text-muted-foreground">
                  {hasSearch ? 'No results found.' : 'No sandboxes provisioned.'}
                </div>
              ) : (
                visibleSandboxes.map((sandbox) => {
                  const sandboxId = sandbox.meta?.id ?? '';
                  return (
                    <div
                      key={sandboxId || sandbox.name}
                      className="grid items-center gap-2 px-6 py-4 text-sm text-foreground md:grid-cols-[2fr_1fr_1fr_1fr_200px]"
                      data-testid="organization-sandbox-row"
                    >
                      <div>
                        <div className="font-medium" data-testid="organization-sandbox-name">
                          {sandbox.name || 'Sandbox'}
                        </div>
                        <div className="text-xs text-muted-foreground" data-testid="organization-sandbox-id">
                          {sandboxId || EMPTY_PLACEHOLDER}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground" data-testid="organization-sandbox-environment">
                        {sandbox.environmentName || EMPTY_PLACEHOLDER}
                      </span>
                      <Badge variant={sandboxStatusVariant(sandbox.status)} data-testid="organization-sandbox-status">
                        {formatSandboxStatus(sandbox.status)}
                      </Badge>
                      <span className="text-xs text-muted-foreground" data-testid="organization-sandbox-last-session">
                        {formatTimestamp(sandbox.lastSessionAt)}
                      </span>
                      <div className="flex items-center justify-end gap-2">
                        {sandboxId && organizationId ? (
                          <Button variant="outline" size="sm" asChild>
                            <NavLink
                              to={`/organizations/${organizationId}/sandboxes/${sandboxId}`}
                              data-testid="organization-sandbox-view"
                            >
                              View
                            </NavLink>
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" disabled data-testid="organization-sandbox-view">
                            View
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!sandboxId || !canStopSandbox(sandbox.status)}
                          onClick={() => setStopTarget(sandbox)}
                          data-testid="organization-sandbox-stop"
                        >
                          Stop
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={!sandboxId}
                          onClick={() => setDeleteTarget(sandbox)}
                          data-testid="organization-sandbox-delete"
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}
      <LoadMoreButton
        hasMore={Boolean(sandboxesQuery.hasNextPage)}
        isLoading={sandboxesQuery.isFetchingNextPage}
        onClick={() => {
          void sandboxesQuery.fetchNextPage();
        }}
      />
      <ConfirmDialog
        open={Boolean(stopTarget)}
        onOpenChange={(open) => {
          if (!open) setStopTarget(null);
        }}
        title="Stop sandbox"
        description="This shuts down the running workload. The workspace volume is kept, so the sandbox can be started again."
        confirmLabel="Stop sandbox"
        onConfirm={() => {
          const sandboxId = stopTarget?.meta?.id;
          if (sandboxId) {
            stopSandboxMutation.mutate(sandboxId);
          }
        }}
        isPending={stopSandboxMutation.isPending}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete sandbox"
        description="This permanently removes the sandbox and its workspace volume."
        confirmLabel="Delete sandbox"
        variant="danger"
        onConfirm={() => {
          const sandboxId = deleteTarget?.meta?.id;
          if (sandboxId) {
            deleteSandboxMutation.mutate(sandboxId);
          }
        }}
        isPending={deleteSandboxMutation.isPending}
      />
    </div>
  );
}
