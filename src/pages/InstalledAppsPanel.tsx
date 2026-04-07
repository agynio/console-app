import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { appsClient } from '@/api/client';
import { SortableHeader } from '@/components/SortableHeader';
import { LoadMoreButton } from '@/components/LoadMoreButton';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { InstallAppDialog } from '@/components/InstallAppDialog';
import { UpdateInstallationDialog } from '@/components/UpdateInstallationDialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { Installation } from '@/gen/agynio/api/apps/v1/apps_pb';
import { useListControls } from '@/hooks/useListControls';
import { formatDateOnly, timestampToMillis } from '@/lib/format';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

type InstalledAppsPanelProps = {
  organizationId: string;
};

export function InstalledAppsPanel({ organizationId }: InstalledAppsPanelProps) {
  const queryClient = useQueryClient();
  const [installOpen, setInstallOpen] = useState(false);
  const [configureInstallation, setConfigureInstallation] = useState<Installation | null>(null);
  const [uninstallInstallation, setUninstallInstallation] = useState<Installation | null>(null);

  const installationsQuery = useInfiniteQuery({
    queryKey: ['installations', organizationId, 'list'],
    queryFn: ({ pageParam }) =>
      appsClient.listInstallations({
        organizationId,
        appId: '',
        pageSize: DEFAULT_PAGE_SIZE,
        pageToken: pageParam,
      }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const uninstallMutation = useMutation({
    mutationFn: (installationId: string) => appsClient.uninstallApp({ id: installationId }),
    onSuccess: () => {
      toast.success('App uninstalled.');
      void queryClient.invalidateQueries({ queryKey: ['installations', organizationId] });
      setUninstallInstallation(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to uninstall app.');
    },
  });

  const installations = installationsQuery.data?.pages.flatMap((page) => page.installations) ?? [];
  const getConfigCount = (installation: Installation) =>
    installation.configuration ? Object.keys(installation.configuration).length : 0;

  const listControls = useListControls({
    items: installations,
    searchFields: [
      (installation) => installation.slug,
      (installation) => installation.meta?.id ?? '',
      (installation) => installation.appId || '',
      (installation) => {
        const configCount = getConfigCount(installation);
        return `${configCount} ${configCount === 1 ? 'key' : 'keys'}`;
      },
      (installation) => formatDateOnly(installation.meta?.createdAt),
    ],
    sortOptions: {
      installation: (installation) => installation.slug,
      app: (installation) => installation.appId || '',
      configuration: (installation) => getConfigCount(installation),
      created: (installation) => timestampToMillis(installation.meta?.createdAt),
    },
    defaultSortKey: 'installation',
  });

  const visibleInstallations = listControls.filteredItems;
  const hasSearch = listControls.searchTerm.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setInstallOpen(true)}
          data-testid="organization-apps-install"
        >
          Install app
        </Button>
      </div>
      <div className="max-w-sm">
        <Input
          placeholder="Search installations..."
          value={listControls.searchTerm}
          onChange={(event) => listControls.setSearchTerm(event.target.value)}
          data-testid="list-search"
        />
      </div>
      {installationsQuery.isPending ? (
        <div className="text-sm text-muted-foreground">Loading installations...</div>
      ) : null}
      {installationsQuery.isError ? (
        <div className="text-sm text-muted-foreground">Failed to load installations.</div>
      ) : null}
      {installations.length === 0 && !installationsQuery.isPending ? (
        <Card className="border-border" data-testid="organization-apps-empty">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No apps installed.
          </CardContent>
        </Card>
      ) : null}
      {installations.length > 0 ? (
        <Card className="border-border" data-testid="organization-apps-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[2fr_1fr_1fr_1fr_160px]"
              data-testid="organization-apps-header"
            >
              <SortableHeader
                label="Installation"
                sortKey="installation"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="App"
                sortKey="app"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Configuration"
                sortKey="configuration"
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
            {visibleInstallations.length === 0 ? (
              <div className="px-6 py-6 text-sm text-muted-foreground">
                {hasSearch ? 'No results found.' : 'No apps installed.'}
              </div>
            ) : (
              visibleInstallations.map((installation) => {
                const installationId = installation.meta?.id;
                const configCount = installation.configuration
                  ? Object.keys(installation.configuration).length
                  : null;
                const configLabel =
                  configCount === null ? '—' : `${configCount} ${configCount === 1 ? 'key' : 'keys'}`;
                return (
                  <div
                    key={installationId ?? installation.slug}
                    className="grid items-center gap-2 px-6 py-4 text-sm text-foreground md:grid-cols-[2fr_1fr_1fr_1fr_160px]"
                    data-testid="organization-app-row"
                  >
                    <div>
                      <div className="font-medium" data-testid="organization-installation-slug">
                        {installation.slug}
                      </div>
                      <div className="text-xs text-muted-foreground" data-testid="organization-installation-id">
                        {installationId ?? '—'}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground" data-testid="organization-installation-app">
                      {installation.appId || '—'}
                    </span>
                    <div className="text-xs text-muted-foreground" data-testid="organization-installation-config">
                      {configCount === null ? '—' : <Badge variant="secondary">{configLabel}</Badge>}
                    </div>
                    <span
                      className="text-xs text-muted-foreground"
                      data-testid="organization-installation-created"
                    >
                      {formatDateOnly(installation.meta?.createdAt)}
                    </span>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfigureInstallation(installation)}
                        disabled={!installationId}
                        data-testid="organization-installation-configure"
                      >
                        Configure
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setUninstallInstallation(installation)}
                        disabled={!installationId}
                        data-testid="organization-installation-uninstall"
                      >
                        Uninstall
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
        hasMore={Boolean(installationsQuery.hasNextPage)}
        isLoading={installationsQuery.isFetchingNextPage}
        onClick={() => {
          void installationsQuery.fetchNextPage();
        }}
      />
      <InstallAppDialog open={installOpen} onOpenChange={setInstallOpen} organizationId={organizationId} />
      <UpdateInstallationDialog
        open={Boolean(configureInstallation)}
        onOpenChange={(open) => {
          if (!open) setConfigureInstallation(null);
        }}
        installation={configureInstallation}
        organizationId={organizationId}
      />
      <ConfirmDialog
        open={Boolean(uninstallInstallation)}
        onOpenChange={(open) => {
          if (!open) setUninstallInstallation(null);
        }}
        title="Uninstall app"
        description="This action removes the app installation from the organization."
        confirmLabel="Uninstall"
        variant="danger"
        onConfirm={() => {
          const installationId = uninstallInstallation?.meta?.id;
          if (installationId) uninstallMutation.mutate(installationId);
        }}
        isPending={uninstallMutation.isPending}
      />
    </div>
  );
}
