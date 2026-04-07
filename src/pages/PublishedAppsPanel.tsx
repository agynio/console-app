import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { appsClient } from '@/api/client';
import { SortableHeader } from '@/components/SortableHeader';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CreateAppDialog } from '@/components/CreateAppDialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { App } from '@/gen/agynio/api/apps/v1/apps_pb';
import { AppVisibility } from '@/gen/agynio/api/apps/v1/apps_pb';
import { useListControls } from '@/hooks/useListControls';
import { formatAppVisibility, formatDateOnly, timestampToMillis } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

type PublishedAppsPanelProps = {
  organizationId: string;
};

export function PublishedAppsPanel({ organizationId }: PublishedAppsPanelProps) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteApp, setDeleteApp] = useState<App | null>(null);

  const appsQuery = useQuery({
    queryKey: ['apps', 'published', organizationId],
    queryFn: () =>
      appsClient.listApps({
        organizationId,
        pageSize: MAX_PAGE_SIZE,
        pageToken: '',
        visibility: AppVisibility.UNSPECIFIED,
      }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const deleteMutation = useMutation({
    mutationFn: (appId: string) => appsClient.deleteApp({ id: appId }),
    onSuccess: () => {
      toast.success('App deleted.');
      void queryClient.invalidateQueries({ queryKey: ['apps', 'published', organizationId] });
      void queryClient.invalidateQueries({ queryKey: ['apps', 'list'] });
      setDeleteApp(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete app.');
    },
  });

  const apps = appsQuery.data?.apps ?? [];
  const listControls = useListControls({
    items: apps,
    searchFields: [
      (app) => app.name,
      (app) => app.slug,
      (app) => app.meta?.id ?? '',
      (app) => formatAppVisibility(app.visibility),
      (app) => formatDateOnly(app.meta?.createdAt),
    ],
    sortOptions: {
      name: (app) => app.name,
      slug: (app) => app.slug,
      visibility: (app) => formatAppVisibility(app.visibility),
      created: (app) => timestampToMillis(app.meta?.createdAt),
    },
    defaultSortKey: 'name',
  });

  const visibleApps = listControls.filteredItems;
  const hasSearch = listControls.searchTerm.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-foreground">Published apps</h4>
          <p className="text-sm text-muted-foreground">Manage apps published by this organization.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCreateOpen(true)}
          data-testid="published-apps-create"
        >
          Create app
        </Button>
      </div>
      <div className="max-w-sm">
        <Input
          placeholder="Search apps..."
          value={listControls.searchTerm}
          onChange={(event) => listControls.setSearchTerm(event.target.value)}
          data-testid="list-search"
        />
      </div>
      {appsQuery.isPending ? <div className="text-sm text-muted-foreground">Loading apps...</div> : null}
      {appsQuery.isError ? <div className="text-sm text-muted-foreground">Failed to load apps.</div> : null}
      {apps.length === 0 && !appsQuery.isPending ? (
        <Card className="border-border" data-testid="published-apps-empty">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No apps published by this organization.
          </CardContent>
        </Card>
      ) : null}
      {apps.length > 0 ? (
        <Card className="border-border" data-testid="published-apps-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[2fr_1fr_1fr_1fr_160px]"
              data-testid="published-apps-header"
            >
              <SortableHeader
                label="App"
                sortKey="name"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Slug"
                sortKey="slug"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Visibility"
                sortKey="visibility"
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
            {visibleApps.length === 0 ? (
              <div className="px-6 py-6 text-sm text-muted-foreground">
                {hasSearch ? 'No results found.' : 'No apps published by this organization.'}
              </div>
            ) : (
              visibleApps.map((app) => {
                const appId = app.meta?.id;
                return (
                  <div
                    key={appId ?? app.slug}
                    className="grid items-center gap-2 px-6 py-4 text-sm text-foreground md:grid-cols-[2fr_1fr_1fr_1fr_160px]"
                    data-testid="published-app-row"
                  >
                    <div>
                      <div className="font-medium" data-testid="published-app-name">
                        {app.name}
                      </div>
                      <div className="text-xs text-muted-foreground" data-testid="published-app-id">
                        {appId ?? '—'}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground" data-testid="published-app-slug">
                      {app.slug}
                    </span>
                    <Badge variant="secondary" data-testid="published-app-visibility">
                      {formatAppVisibility(app.visibility)}
                    </Badge>
                    <span className="text-xs text-muted-foreground" data-testid="published-app-created">
                      {formatDateOnly(app.meta?.createdAt)}
                    </span>
                    <div className="flex items-center justify-end gap-2">
                      {appId ? (
                        <Button variant="outline" size="sm" asChild>
                          <NavLink
                            to={`/organizations/${organizationId}/apps/${appId}`}
                            data-testid="published-app-view"
                          >
                            View
                          </NavLink>
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" disabled data-testid="published-app-view">
                          View
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeleteApp(app)}
                        disabled={!appId}
                        data-testid="published-app-delete"
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
      <CreateAppDialog open={createOpen} onOpenChange={setCreateOpen} organizationId={organizationId} />
      <ConfirmDialog
        open={Boolean(deleteApp)}
        onOpenChange={(open) => {
          if (!open) setDeleteApp(null);
        }}
        title="Delete app"
        description="This action permanently deletes the app."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          const appId = deleteApp?.meta?.id;
          if (appId) deleteMutation.mutate(appId);
        }}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}
