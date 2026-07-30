import { useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { Code, ConnectError } from '@connectrpc/connect';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentsClient, runnersClient } from '@/api/client';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SandboxTerminal } from '@/components/SandboxTerminal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SandboxStatus } from '@/gen/agynio/api/agents/v1/agents_pb';
import { RuntimeOwnerKind } from '@/gen/agynio/api/runners/v1/runners_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { EMPTY_PLACEHOLDER, formatTimestamp, formatVolumeStatus, truncate } from '@/lib/format';
import { canStopSandbox, formatSandboxStatus, sandboxStatusVariant } from '@/lib/sandbox';
import { toast } from 'sonner';

export function SandboxDetailPage() {
  const { id: organizationIdParam, sandboxId: sandboxIdParam } = useParams();
  const organizationId = organizationIdParam ?? '';
  const sandboxId = sandboxIdParam ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [stopOpen, setStopOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const sandboxQuery = useQuery({
    queryKey: ['sandboxes', sandboxId, 'detail'],
    queryFn: () => agentsClient.getSandbox({ ref: { case: 'id', value: sandboxId } }),
    enabled: Boolean(sandboxId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    // A starting sandbox has no workload to attach to yet, so poll until the
    // runtime state settles.
    refetchInterval: (query) =>
      query.state.data?.sandbox?.status === SandboxStatus.STARTING ? 3_000 : false,
  });

  const sandbox = sandboxQuery.data?.sandbox ?? null;
  const isNotFoundError = sandboxQuery.error instanceof ConnectError && sandboxQuery.error.code === Code.NotFound;
  const isOrgMismatch = Boolean(sandbox && organizationId && sandbox.organizationId !== organizationId);
  const isMissing = !sandbox && !sandboxQuery.isPending && !sandboxQuery.isError;
  const showNotFound = isNotFoundError || isOrgMismatch || isMissing;
  const showError = sandboxQuery.isError && !isNotFoundError;

  useDocumentTitle(sandbox?.name ? `Sandbox ${truncate(sandbox.name, 18)}` : 'Sandbox');

  // The Sandbox message carries no volume reference; the workspace volume is
  // found by its runtime owner instead.
  const workspaceVolumeQuery = useQuery({
    queryKey: ['sandboxes', sandboxId, 'workspace-volume'],
    queryFn: () =>
      runnersClient.listVolumes({
        organizationId,
        pageSize: 1,
        pageToken: '',
        filter: { ownerKindIn: [RuntimeOwnerKind.SANDBOX], ownerIdIn: [sandboxId] },
      }),
    enabled: Boolean(sandboxId) && Boolean(organizationId) && Boolean(sandbox) && !showNotFound,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const workspaceVolume = workspaceVolumeQuery.data?.volumes?.[0] ?? null;

  const invalidateSandbox = () => {
    void queryClient.invalidateQueries({ queryKey: ['sandboxes', sandboxId, 'detail'] });
    void queryClient.invalidateQueries({ queryKey: ['sandboxes', organizationId, 'list'] });
  };

  const startSandboxMutation = useMutation({
    mutationFn: () => agentsClient.ensureSandboxRunning({ id: sandboxId }),
    onSuccess: () => {
      toast.success('Sandbox starting.');
      invalidateSandbox();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to start sandbox.');
    },
  });

  const stopSandboxMutation = useMutation({
    mutationFn: () => agentsClient.stopSandbox({ id: sandboxId }),
    onSuccess: () => {
      toast.success('Sandbox stopped.');
      invalidateSandbox();
      setStopOpen(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to stop sandbox.');
    },
  });

  const deleteSandboxMutation = useMutation({
    mutationFn: () => agentsClient.deleteSandbox({ id: sandboxId }),
    onSuccess: () => {
      toast.success('Sandbox deleted.');
      void queryClient.invalidateQueries({ queryKey: ['sandboxes', organizationId, 'list'] });
      setDeleteOpen(false);
      void navigate(`/organizations/${organizationId}/sandboxes`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete sandbox.');
    },
  });

  const backHref = organizationId ? `/organizations/${organizationId}/sandboxes` : '/organizations';
  const workloadId = sandbox?.workloadId ?? '';
  const workloadLink = organizationId && workloadId ? `/organizations/${organizationId}/workloads/${workloadId}` : '';
  const isRunning = sandbox?.status === SandboxStatus.RUNNING;
  const canAttach = isRunning && Boolean(workloadId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="link" asChild data-testid="sandbox-detail-back">
          <NavLink to={backHref}>← Back to Sandboxes</NavLink>
        </Button>
        {sandbox && !showNotFound ? (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!canStopSandbox(sandbox.status)}
              onClick={() => setStopOpen(true)}
              data-testid="sandbox-detail-stop"
            >
              Stop
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              data-testid="sandbox-detail-delete"
            >
              Delete
            </Button>
          </div>
        ) : null}
      </div>
      {sandboxQuery.isPending ? <div className="text-sm text-muted-foreground">Loading sandbox...</div> : null}
      {showError ? <div className="text-sm text-muted-foreground">Failed to load sandbox.</div> : null}
      {showNotFound ? <div className="text-sm text-muted-foreground">Sandbox not found.</div> : null}
      {sandbox && !showNotFound ? (
        <div className="space-y-6">
          <Card className="border-border" data-testid="sandbox-detail-card">
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Details</h3>
                <p className="text-sm text-muted-foreground">Identifiers, environment and runtime state.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Name</div>
                  <div className="text-sm text-foreground" data-testid="sandbox-detail-name">
                    {sandbox.name || EMPTY_PLACEHOLDER}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Sandbox ID</div>
                  <div className="text-sm text-foreground">{sandbox.meta?.id || EMPTY_PLACEHOLDER}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Status</div>
                  <Badge variant={sandboxStatusVariant(sandbox.status)} data-testid="sandbox-detail-status">
                    {formatSandboxStatus(sandbox.status)}
                  </Badge>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Environment</div>
                  <div className="text-sm text-foreground" data-testid="sandbox-detail-environment">
                    {sandbox.environmentName || sandbox.environmentId || EMPTY_PLACEHOLDER}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Owner</div>
                  <div className="text-sm text-foreground">{sandbox.ownerId || EMPTY_PLACEHOLDER}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Workload</div>
                  <div className="text-sm text-foreground">
                    {workloadLink ? (
                      <NavLink to={workloadLink} className="hover:underline" data-testid="sandbox-detail-workload">
                        {truncate(workloadId, 18)}
                      </NavLink>
                    ) : (
                      EMPTY_PLACEHOLDER
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Idle Timeout</div>
                  <div className="text-sm text-foreground">{sandbox.idleTimeout || EMPTY_PLACEHOLDER}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">TTL</div>
                  <div className="text-sm text-foreground">{sandbox.ttl || EMPTY_PLACEHOLDER}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Last Session</div>
                  <div className="text-sm text-foreground" data-testid="sandbox-detail-last-session">
                    {formatTimestamp(sandbox.lastSessionAt)}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Created</div>
                  <div className="text-sm text-foreground">{formatTimestamp(sandbox.meta?.createdAt)}</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border" data-testid="sandbox-workspace-card">
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Workspace</h3>
                <p className="text-sm text-muted-foreground">
                  Persistent volume for this sandbox. It survives stop and start.
                </p>
              </div>
              {workspaceVolume ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Volume</div>
                    <div className="text-sm text-foreground" data-testid="sandbox-workspace-volume">
                      {organizationId && workspaceVolume.meta?.id ? (
                        <NavLink
                          to={`/organizations/${organizationId}/volumes/${workspaceVolume.meta.id}`}
                          className="hover:underline"
                        >
                          {workspaceVolume.volumeName || workspaceVolume.volumeId || workspaceVolume.meta.id}
                        </NavLink>
                      ) : (
                        workspaceVolume.volumeName || workspaceVolume.volumeId || EMPTY_PLACEHOLDER
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Status</div>
                    <div className="text-sm text-foreground">{formatVolumeStatus(workspaceVolume.status)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Size</div>
                    <div className="text-sm text-foreground">
                      {workspaceVolume.sizeGb ? `${workspaceVolume.sizeGb} GB` : EMPTY_PLACEHOLDER}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground" data-testid="sandbox-workspace-empty">
                  {workspaceVolumeQuery.isPending ? 'Loading workspace volume...' : 'No workspace volume reported.'}
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="border-border" data-testid="sandbox-terminal-card">
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Terminal</h3>
                <p className="text-sm text-muted-foreground">
                  Interactive shell in the sandbox container. Closing the tab ends the session.
                </p>
              </div>
              {canAttach ? (
                <SandboxTerminal workloadId={workloadId} />
              ) : (
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground" data-testid="sandbox-terminal-unavailable">
                    {sandbox.status === SandboxStatus.STARTING
                      ? 'Sandbox is starting. The terminal attaches once it is running.'
                      : 'Sandbox is not running. Start it to open a terminal.'}
                  </div>
                  {sandbox.status !== SandboxStatus.STARTING && sandbox.status !== SandboxStatus.TERMINATED ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={startSandboxMutation.isPending}
                      onClick={() => startSandboxMutation.mutate()}
                      data-testid="sandbox-terminal-start"
                    >
                      {startSandboxMutation.isPending ? 'Starting...' : 'Start sandbox'}
                    </Button>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
      <ConfirmDialog
        open={stopOpen}
        onOpenChange={setStopOpen}
        title="Stop sandbox"
        description="This shuts down the running workload. The workspace volume is kept, so the sandbox can be started again."
        confirmLabel="Stop sandbox"
        onConfirm={() => stopSandboxMutation.mutate()}
        isPending={stopSandboxMutation.isPending}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete sandbox"
        description="This permanently removes the sandbox and its workspace volume."
        confirmLabel="Delete sandbox"
        variant="danger"
        onConfirm={() => deleteSandboxMutation.mutate()}
        isPending={deleteSandboxMutation.isPending}
      />
    </div>
  );
}
