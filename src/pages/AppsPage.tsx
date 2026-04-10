import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { appsClient } from '@/api/client';
import { SortableHeader } from '@/components/SortableHeader';
import { LoadMoreButton } from '@/components/LoadMoreButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RegisterAppDialog } from '@/components/RegisterAppDialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useListControls } from '@/hooks/useListControls';
import { formatAppVisibility, formatDateOnly, timestampToMillis } from '@/lib/format';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';

export function AppsPage() {
  useDocumentTitle('Apps');

  const [registerOpen, setRegisterOpen] = useState(false);

  const appsQuery = useInfiniteQuery({
    queryKey: ['apps', 'list', 'infinite'],
    queryFn: ({ pageParam }) => appsClient.listApps({ pageSize: DEFAULT_PAGE_SIZE, pageToken: pageParam }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const apps = appsQuery.data?.pages.flatMap((page) => page.apps) ?? [];
  const listControls = useListControls({
    items: apps,
    searchFields: [
      (app) => app.name,
      (app) => app.slug,
      (app) => app.meta?.id ?? '',
      (app) => app.organizationId || '',
      (app) => formatAppVisibility(app.visibility),
      (app) => (app.permissions.length > 0 ? app.permissions.join(', ') : ''),
    ],
    sortOptions: {
      name: (app) => app.name,
      organization: (app) => app.organizationId || '',
      visibility: (app) => formatAppVisibility(app.visibility),
      permissions: (app) => (app.permissions.length > 0 ? app.permissions.join(', ') : ''),
      created: (app) => timestampToMillis(app.meta?.createdAt),
    },
    defaultSortKey: 'name',
  });

  const visibleApps = listControls.filteredItems;
  const hasSearch = listControls.searchTerm.trim().length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-sm flex-1">
          <Input
            placeholder="Search apps..."
            value={listControls.searchTerm}
            onChange={(event) => listControls.setSearchTerm(event.target.value)}
            data-testid="list-search"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => setRegisterOpen(true)} data-testid="apps-register">
          Register app
        </Button>
      </div>
      {appsQuery.isPending ? <div className="text-sm text-muted-foreground">Loading apps...</div> : null}
      {appsQuery.isError ? <div className="text-sm text-muted-foreground">Failed to load apps.</div> : null}
      {apps.length === 0 && !appsQuery.isPending ? (
        <Card className="border-border" data-testid="apps-empty">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No apps registered.
          </CardContent>
        </Card>
      ) : null}
      {apps.length > 0 ? (
        <Card className="border-border" data-testid="apps-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[2fr_1fr_1fr_1fr_1fr_120px]"
              data-testid="apps-header"
            >
              <SortableHeader
                label="App"
                sortKey="name"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Organization"
                sortKey="organization"
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
                label="Permissions"
                sortKey="permissions"
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
                  {hasSearch ? 'No results found.' : 'No apps registered.'}
                </div>
              ) : (
                visibleApps.map((app) => {
                  const appId = app.meta?.id;
                  return (
                    <div
                      key={appId ?? app.slug}
                      className="grid items-center gap-2 px-6 py-4 text-sm text-foreground md:grid-cols-[2fr_1fr_1fr_1fr_1fr_120px]"
                      data-testid="apps-row"
                    >
                      <div>
                        <div className="font-medium" data-testid="apps-name">
                          {app.name}
                        </div>
                        <div className="text-xs text-muted-foreground" data-testid="apps-slug">
                          {app.slug}
                        </div>
                        <div className="text-xs text-muted-foreground" data-testid="apps-id">
                          {appId ?? '—'}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground" data-testid="apps-organization">
                        {app.organizationId || '—'}
                      </span>
                      <Badge variant="secondary" data-testid="apps-visibility">
                        {formatAppVisibility(app.visibility)}
                      </Badge>
                      <span className="text-xs text-muted-foreground" data-testid="apps-permissions">
                        {app.permissions.length > 0 ? app.permissions.join(', ') : '—'}
                      </span>
                      <span className="text-xs text-muted-foreground" data-testid="apps-created">
                        {formatDateOnly(app.meta?.createdAt)}
                      </span>
                      <div className="text-right">
                        {appId ? (
                          <Button variant="outline" size="sm" asChild>
                            <NavLink to={`/apps/${appId}`} data-testid="apps-view">
                              View
                            </NavLink>
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" disabled data-testid="apps-view">
                            View
                          </Button>
                        )}
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
        hasMore={Boolean(appsQuery.hasNextPage)}
        isLoading={appsQuery.isFetchingNextPage}
        onClick={() => {
          void appsQuery.fetchNextPage();
        }}
      />
      <RegisterAppDialog open={registerOpen} onOpenChange={setRegisterOpen} />
    </div>
  );
}
