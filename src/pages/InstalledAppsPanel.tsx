import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { appsClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { InstallAppDialog } from '@/components/InstallAppDialog';
import { UpdateInstallationDialog } from '@/components/UpdateInstallationDialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { Installation } from '@/gen/agynio/api/apps/v1/apps_pb';
import { formatDateOnly } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

type InstalledAppsPanelProps = {
  organizationId: string;
};

export function InstalledAppsPanel({ organizationId }: InstalledAppsPanelProps) {
  const queryClient = useQueryClient();
  const [installOpen, setInstallOpen] = useState(false);
  const [configureInstallation, setConfigureInstallation] = useState<Installation | null>(null);
  const [uninstallInstallation, setUninstallInstallation] = useState<Installation | null>(null);

  const installationsQuery = useQuery({
    queryKey: ['installations', organizationId, 'list'],
    queryFn: () =>
      appsClient.listInstallations({ organizationId, appId: '', pageSize: MAX_PAGE_SIZE, pageToken: '' }),
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

  const installations = installationsQuery.data?.installations ?? [];

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
              <span>Installation</span>
              <span>App</span>
              <span>Configuration</span>
              <span>Created</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-border">
              {installations.map((installation) => {
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
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}
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
