import { useMemo, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { appsClient } from '@/api/client';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LoadMoreButton } from '@/components/LoadMoreButton';
import { Markdown } from '@/components/Markdown';
import { UpdateInstallationDialog } from '@/components/UpdateInstallationDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { InstallationAuditLogLevel } from '@/gen/agynio/api/apps/v1/apps_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { formatDateOnly, formatInstallationAuditLogLevel, formatTimestamp, timestampToMillis } from '@/lib/format';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

export function InstallationDetailPage() {
  const { id: organizationIdParam, installationId: installationIdParam } = useParams();
  const organizationId = organizationIdParam ?? '';
  const installationId = installationIdParam ?? '';
  const queryClient = useQueryClient();
  const [configureOpen, setConfigureOpen] = useState(false);
  const [uninstallOpen, setUninstallOpen] = useState(false);

  const installationQuery = useQuery({
    queryKey: ['installations', installationId],
    queryFn: () => appsClient.getInstallation({ id: installationId }),
    enabled: Boolean(installationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const installation = installationQuery.data?.installation ?? null;
  const isOrgMismatch = Boolean(installation && organizationId && installation.organizationId !== organizationId);
  const isMissing = !installation && !installationQuery.isPending && !installationQuery.isError;
  const showNotFound = isOrgMismatch || isMissing;

  useDocumentTitle(installation?.slug ?? 'Installation');

  const statusContent = useMemo(() => installation?.status?.trim() ?? '', [installation?.status]);

  const auditLogQuery = useInfiniteQuery({
    queryKey: ['installation-audit-log', installationId],
    queryFn: ({ pageParam }) =>
      appsClient.listInstallationAuditLogEntries({
        installationId,
        pageSize: DEFAULT_PAGE_SIZE,
        pageToken: pageParam,
      }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
    enabled: Boolean(installationId) && Boolean(installation) && !isOrgMismatch,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const auditLogEntries = useMemo(() => {
    const entries = auditLogQuery.data?.pages.flatMap((page) => page.entries) ?? [];
    return [...entries].sort(
      (first, second) => timestampToMillis(second.createdAt) - timestampToMillis(first.createdAt),
    );
  }, [auditLogQuery.data?.pages]);

  const showAuditLog = auditLogQuery.isPending || auditLogQuery.isError || auditLogEntries.length > 0;
  const hasAuditLogEntries = auditLogEntries.length > 0;

  const uninstallMutation = useMutation({
    mutationFn: (payload: string) => appsClient.uninstallApp({ id: payload }),
    onSuccess: () => {
      toast.success('App uninstalled.');
      void queryClient.invalidateQueries({ queryKey: ['installations', organizationId] });
      setUninstallOpen(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to uninstall app.');
    },
  });

  const resolveAuditLogVariant = (level: InstallationAuditLogLevel) => {
    if (level === InstallationAuditLogLevel.ERROR) return 'destructive';
    if (level === InstallationAuditLogLevel.WARNING) return 'outline';
    return 'secondary';
  };

  const configurationCount = installation?.configuration ? Object.keys(installation.configuration).length : null;
  const configurationLabel =
    configurationCount === null
      ? '—'
      : `${configurationCount} ${configurationCount === 1 ? 'key' : 'keys'}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="link" asChild data-testid="installation-detail-back">
          <NavLink to={`/organizations/${organizationId}/apps`}>← Back to Apps</NavLink>
        </Button>
        {installation && !showNotFound ? (
          <div className="flex flex-wrap items-center gap-2" data-testid="installation-detail-actions">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfigureOpen(true)}
              disabled={!installationId}
              data-testid="installation-detail-configure"
            >
              Configure
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setUninstallOpen(true)}
              disabled={!installationId}
              data-testid="installation-detail-uninstall"
            >
              Uninstall
            </Button>
          </div>
        ) : null}
      </div>
      {installationQuery.isPending ? (
        <div className="text-sm text-muted-foreground">Loading installation...</div>
      ) : null}
      {installationQuery.isError ? (
        <div className="text-sm text-muted-foreground">Failed to load installation.</div>
      ) : null}
      {showNotFound ? <div className="text-sm text-muted-foreground">Installation not found.</div> : null}
      {installation && !showNotFound ? (
        <div className="space-y-6">
          {statusContent ? (
            <Card className="border-border" data-testid="installation-status">
              <CardContent className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</div>
                <Markdown content={statusContent} />
              </CardContent>
            </Card>
          ) : null}
          <Card className="border-border" data-testid="installation-detail-card">
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Details</h3>
                <p className="text-sm text-muted-foreground">Installation metadata and configuration.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Slug</div>
                  <div className="text-sm text-foreground" data-testid="installation-detail-slug">
                    {installation.slug}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Installation ID</div>
                  <div className="text-sm text-foreground" data-testid="installation-detail-id">
                    {installation.meta?.id ?? '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">App ID</div>
                  <div className="text-sm text-foreground" data-testid="installation-detail-app">
                    {installation.appId || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Organization ID</div>
                  <div className="text-sm text-foreground" data-testid="installation-detail-organization">
                    {installation.organizationId || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Configuration</div>
                  <div className="text-sm text-foreground" data-testid="installation-detail-configuration">
                    {configurationCount === null ? '—' : <Badge variant="secondary">{configurationLabel}</Badge>}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Created</div>
                  <div className="text-sm text-foreground" data-testid="installation-detail-created">
                    {formatDateOnly(installation.meta?.createdAt)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          {showAuditLog ? (
            <div className="space-y-2" data-testid="installation-audit-log">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Audit log</h3>
                <p className="text-sm text-muted-foreground">Recent installation activity.</p>
              </div>
              {auditLogQuery.isPending ? (
                <div className="text-sm text-muted-foreground">Loading audit log...</div>
              ) : null}
              {auditLogQuery.isError ? (
                <div className="text-sm text-muted-foreground">Failed to load audit log.</div>
              ) : null}
              {hasAuditLogEntries ? (
                <Card className="border-border">
                  <CardContent className="px-0">
                    <div className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[180px_120px_1fr]">
                      <span>Time</span>
                      <span>Level</span>
                      <span>Message</span>
                    </div>
                    <div className="divide-y divide-border">
                      {auditLogEntries.map((entry) => (
                        <div
                          key={entry.id}
                          className="grid gap-2 px-6 py-4 text-sm text-foreground md:grid-cols-[180px_120px_1fr]"
                        >
                          <span className="text-xs text-muted-foreground">{formatTimestamp(entry.createdAt)}</span>
                          <Badge variant={resolveAuditLogVariant(entry.level)}>
                            {formatInstallationAuditLogLevel(entry.level)}
                          </Badge>
                          <span className="text-sm text-foreground whitespace-pre-wrap">{entry.message}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : null}
              {hasAuditLogEntries ? (
                <LoadMoreButton
                  hasMore={Boolean(auditLogQuery.hasNextPage)}
                  isLoading={auditLogQuery.isFetchingNextPage}
                  onClick={() => {
                    void auditLogQuery.fetchNextPage();
                  }}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <UpdateInstallationDialog
        open={configureOpen}
        onOpenChange={setConfigureOpen}
        installation={installation}
        organizationId={organizationId}
      />
      <ConfirmDialog
        open={uninstallOpen}
        onOpenChange={setUninstallOpen}
        title="Uninstall app"
        description="This action removes the app installation from the organization."
        confirmLabel="Uninstall"
        variant="danger"
        onConfirm={() => {
          if (installationId) uninstallMutation.mutate(installationId);
        }}
        isPending={uninstallMutation.isPending}
      />
    </div>
  );
}
