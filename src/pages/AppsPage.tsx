import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { appsClient } from '@/api/client';
import { Button } from '@/components/Button';
import { RegisterAppDialog } from '@/components/RegisterAppDialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatAppVisibility, formatDateOnly } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';

export function AppsPage() {
  const [registerOpen, setRegisterOpen] = useState(false);

  const appsQuery = useQuery({
    queryKey: ['apps', 'list'],
    queryFn: () => appsClient.listApps({ pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const apps = appsQuery.data?.apps ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-[var(--agyn-dark)]">Apps</h2>
          <p className="text-sm text-[var(--agyn-gray)]">Register and manage platform apps.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setRegisterOpen(true)} data-testid="apps-register">
          Register app
        </Button>
      </div>
      {appsQuery.isPending ? <div className="text-sm text-[var(--agyn-gray)]">Loading apps...</div> : null}
      {appsQuery.isError ? <div className="text-sm text-[var(--agyn-gray)]">Failed to load apps.</div> : null}
      {apps.length === 0 && !appsQuery.isPending ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="apps-empty">
          <CardContent className="py-10 text-center text-sm text-[var(--agyn-gray)]">
            No apps registered.
          </CardContent>
        </Card>
      ) : null}
      {apps.length > 0 ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="apps-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-[var(--agyn-gray)] md:grid-cols-[2fr_1fr_1fr_1fr_1fr_120px]"
              data-testid="apps-header"
            >
              <span>App</span>
              <span>Organization</span>
              <span>Visibility</span>
              <span>Permissions</span>
              <span>Created</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-[var(--agyn-border-subtle)]">
              {apps.map((app) => {
                const appId = app.meta?.id;
                return (
                  <div
                    key={appId ?? app.slug}
                    className="grid items-center gap-2 px-6 py-4 text-sm text-[var(--agyn-dark)] md:grid-cols-[2fr_1fr_1fr_1fr_1fr_120px]"
                    data-testid="apps-row"
                  >
                    <div>
                      <div className="font-medium" data-testid="apps-name">
                        {app.name}
                      </div>
                      <div className="text-xs text-[var(--agyn-gray)]" data-testid="apps-slug">
                        {app.slug}
                      </div>
                      <div className="text-xs text-[var(--agyn-gray)]" data-testid="apps-id">
                        {appId ?? '—'}
                      </div>
                    </div>
                    <span className="text-xs text-[var(--agyn-gray)]" data-testid="apps-organization">
                      {app.organizationId || '—'}
                    </span>
                    <Badge variant="secondary" data-testid="apps-visibility">
                      {formatAppVisibility(app.visibility)}
                    </Badge>
                    <span className="text-xs text-[var(--agyn-gray)]" data-testid="apps-permissions">
                      {app.permissions.length > 0 ? app.permissions.join(', ') : '—'}
                    </span>
                    <span className="text-xs text-[var(--agyn-gray)]" data-testid="apps-created">
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
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}
      <RegisterAppDialog open={registerOpen} onOpenChange={setRegisterOpen} />
    </div>
  );
}
