import { useQuery } from '@tanstack/react-query';
import { appsClient } from '@/api/client';
import { Card, CardContent } from '@/components/ui/card';
import { formatDateOnly } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';

export function OrganizationAppsTab() {
  const appsQuery = useQuery({
    queryKey: ['apps', 'list'],
    queryFn: () => appsClient.listApps({ pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const apps = appsQuery.data?.apps ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-[var(--agyn-dark)]" data-testid="organization-apps-heading">
          Apps
        </h3>
        <p className="text-sm text-[var(--agyn-gray)]" data-testid="organization-apps-scope">
          Cluster-wide apps shared across organizations.
        </p>
      </div>
      {appsQuery.isPending ? <div className="text-sm text-[var(--agyn-gray)]">Loading apps...</div> : null}
      {appsQuery.isError ? <div className="text-sm text-[var(--agyn-gray)]">Failed to load apps.</div> : null}
      {apps.length === 0 && !appsQuery.isPending ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="organization-apps-empty">
          <CardContent className="py-10 text-center text-sm text-[var(--agyn-gray)]">No apps installed.</CardContent>
        </Card>
      ) : null}
      {apps.length > 0 ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="organization-apps-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-[var(--agyn-gray)] md:grid-cols-[2fr_1fr_1fr]"
              data-testid="organization-apps-header"
            >
              <span>App</span>
              <span>Configuration</span>
              <span>Created</span>
            </div>
            <div className="divide-y divide-[var(--agyn-border-subtle)]">
              {apps.map((app) => (
                <div
                  key={app.meta?.id ?? app.slug}
                  className="grid items-center gap-2 px-6 py-4 text-sm text-[var(--agyn-dark)] md:grid-cols-[2fr_1fr_1fr]"
                  data-testid="organization-app-row"
                >
                  <div>
                    <div className="font-medium" data-testid="organization-app-slug">
                      {app.slug}
                    </div>
                    <div className="text-xs text-[var(--agyn-gray)]" data-testid="organization-app-id">
                      {app.meta?.id ?? '—'}
                    </div>
                  </div>
                  <span className="text-xs text-[var(--agyn-gray)]" data-testid="organization-app-configuration">
                    {app.description || '—'}
                  </span>
                  <span className="text-xs text-[var(--agyn-gray)]" data-testid="organization-app-created">
                    {formatDateOnly(app.meta?.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
