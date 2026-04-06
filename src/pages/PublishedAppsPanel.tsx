import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { appsClient } from '@/api/client';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CreateAppDialog } from '@/components/CreateAppDialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { App } from '@/gen/agynio/api/apps/v1/apps_pb';
import { AppVisibility } from '@/gen/agynio/api/apps/v1/apps_pb';
import { formatAppVisibility, formatDateOnly } from '@/lib/format';
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-[var(--agyn-dark)]">Published apps</h4>
          <p className="text-sm text-[var(--agyn-gray)]">
            Manage apps published by this organization.
          </p>
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
      {appsQuery.isPending ? <div className="text-sm text-[var(--agyn-gray)]">Loading apps...</div> : null}
      {appsQuery.isError ? <div className="text-sm text-[var(--agyn-gray)]">Failed to load apps.</div> : null}
      {apps.length === 0 && !appsQuery.isPending ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="published-apps-empty">
          <CardContent className="py-10 text-center text-sm text-[var(--agyn-gray)]">
            No apps published by this organization.
          </CardContent>
        </Card>
      ) : null}
      {apps.length > 0 ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="published-apps-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-[var(--agyn-gray)] md:grid-cols-[2fr_1fr_1fr_1fr_160px]"
              data-testid="published-apps-header"
            >
              <span>App</span>
              <span>Slug</span>
              <span>Visibility</span>
              <span>Created</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-[var(--agyn-border-subtle)]">
              {apps.map((app) => {
                const appId = app.meta?.id;
                return (
                  <div
                    key={appId ?? app.slug}
                    className="grid items-center gap-2 px-6 py-4 text-sm text-[var(--agyn-dark)] md:grid-cols-[2fr_1fr_1fr_1fr_160px]"
                    data-testid="published-app-row"
                  >
                    <div>
                      <div className="font-medium" data-testid="published-app-name">
                        {app.name}
                      </div>
                      <div className="text-xs text-[var(--agyn-gray)]" data-testid="published-app-id">
                        {appId ?? '—'}
                      </div>
                    </div>
                    <span className="text-xs text-[var(--agyn-gray)]" data-testid="published-app-slug">
                      {app.slug}
                    </span>
                    <Badge variant="secondary" data-testid="published-app-visibility">
                      {formatAppVisibility(app.visibility)}
                    </Badge>
                    <span className="text-xs text-[var(--agyn-gray)]" data-testid="published-app-created">
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
                        variant="danger"
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
              })}
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
