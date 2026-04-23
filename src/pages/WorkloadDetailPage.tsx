import { useEffect, useState } from 'react';
import { NavLink, useLocation, useParams } from 'react-router-dom';
import { Code, ConnectError } from '@connectrpc/connect';
import { useQuery } from '@tanstack/react-query';
import { runnersClient } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Container } from '@/gen/agynio/api/runners/v1/runners_pb';
import { ContainerRole, ContainerStatus, WorkloadStatus } from '@/gen/agynio/api/runners/v1/runners_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import {
  EMPTY_PLACEHOLDER,
  formatContainerStatus,
  formatTimestamp,
  formatWorkloadStatus,
  truncate,
} from '@/lib/format';

type LogStreamState = 'loading' | 'streaming' | 'ended' | 'unavailable' | 'error';

const formatContainerRole = (role: ContainerRole) => {
  if (role === ContainerRole.MAIN) return 'Main';
  if (role === ContainerRole.SIDECAR) return 'Sidecar';
  if (role === ContainerRole.INIT) return 'Init';
  return 'Unspecified';
};

const resolveContainerOrder = (role: ContainerRole) => {
  if (role === ContainerRole.INIT) return 0;
  if (role === ContainerRole.MAIN) return 1;
  if (role === ContainerRole.SIDECAR) return 2;
  return 3;
};

const resolveContainerDisplayName = (container: Container, index: number) =>
  container.name?.trim() || `container-${index + 1}`;

const resolveWorkloadVariant = (status: WorkloadStatus) => {
  if (status === WorkloadStatus.RUNNING) return 'default';
  if (status === WorkloadStatus.STARTING || status === WorkloadStatus.STOPPING) return 'secondary';
  if (status === WorkloadStatus.STOPPED) return 'outline';
  if (status === WorkloadStatus.FAILED) return 'destructive';
  return 'outline';
};

const resolveContainerVariant = (status: ContainerStatus) => {
  if (status === ContainerStatus.RUNNING) return 'default';
  if (status === ContainerStatus.WAITING) return 'secondary';
  if (status === ContainerStatus.TERMINATED) return 'outline';
  return 'outline';
};

type WorkloadLogViewerProps = {
  workloadId: string;
  containerName: string;
};

function WorkloadLogViewer({ workloadId, containerName }: WorkloadLogViewerProps) {
  const [logText, setLogText] = useState('');
  const [streamState, setStreamState] = useState<LogStreamState>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!workloadId || !containerName) {
      setLogText('');
      setErrorMessage('');
      setStreamState('unavailable');
      return;
    }

    let active = true;
    const controller = new AbortController();
    const decoder = new TextDecoder();

    setLogText('');
    setErrorMessage('');
    setStreamState('loading');
    const loadingTimeout = setTimeout(() => {
      if (active) setStreamState('streaming');
    }, 750);

    const appendText = (text: string) => {
      if (!active || !text) return;
      setLogText((prev) => prev + text);
    };

    (async () => {
      try {
        let hasChunk = false;
        for await (const response of runnersClient.streamWorkloadLogs(
          {
            workloadId,
            containerName,
            tailLines: 1000,
            follow: true,
          },
          { signal: controller.signal },
        )) {
          if (!active) return;
          if (response.event.case === 'chunk') {
            const chunkText = decoder.decode(response.event.value.data, { stream: true });
            if (chunkText) appendText(chunkText);
            if (!hasChunk) {
              hasChunk = true;
              clearTimeout(loadingTimeout);
              setStreamState('streaming');
            }
            continue;
          }
          if (response.event.case === 'end') {
            break;
          }
          if (response.event.case === 'error') {
            throw new Error(response.event.value.message || 'Log stream error');
          }
        }

        if (!active) return;
        const flushText = decoder.decode();
        if (flushText) appendText(flushText);
        clearTimeout(loadingTimeout);
        setStreamState('ended');
      } catch (error) {
        if (!active) return;
        clearTimeout(loadingTimeout);
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (error instanceof Error && error.name === 'AbortError') return;
        if (error instanceof ConnectError) {
          if (error.code === Code.NotFound || error.code === Code.Unavailable) {
            setStreamState('unavailable');
            return;
          }
          setErrorMessage(error.rawMessage || error.message);
          setStreamState('error');
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : 'Failed to stream logs.');
        setStreamState('error');
      }
    })();

    return () => {
      active = false;
      clearTimeout(loadingTimeout);
      controller.abort();
    };
  }, [containerName, workloadId]);

  const isUnavailable = streamState === 'unavailable';
  const isError = streamState === 'error';
  const isLoading = streamState === 'loading';
  const isEnded = streamState === 'ended';
  const hasContent = logText.trim().length > 0;

  return (
    <div className="space-y-2" data-testid="workload-container-logs">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Logs</div>
      {isLoading ? <div className="text-sm text-muted-foreground">Loading logs...</div> : null}
      {isUnavailable ? <div className="text-sm text-muted-foreground">Log stream unavailable.</div> : null}
      {isError ? (
        <div className="text-sm text-muted-foreground">
          Failed to stream logs.{errorMessage ? ` ${errorMessage}` : ''}
        </div>
      ) : null}
      {!isUnavailable ? (
        <div className="rounded-md border border-border bg-muted/30 p-3">
          {hasContent ? (
            <pre
              className="whitespace-pre-wrap text-xs font-mono text-foreground"
              data-testid="workload-container-log-output"
            >
              {logText}
            </pre>
          ) : !isLoading && !isError ? (
            <div className="text-xs text-muted-foreground">No log output yet.</div>
          ) : null}
          {isEnded ? <div className="mt-2 text-xs text-muted-foreground">Stream ended</div> : null}
        </div>
      ) : null}
    </div>
  );
}

type ContainerPanelProps = {
  container: Container;
  index: number;
};

function ContainerPanel({ container, index }: ContainerPanelProps) {
  const statusLabel = formatContainerStatus(container.status);
  const roleLabel = formatContainerRole(container.role);
  const reasonLabel = container.reason?.trim();
  const messageLabel = container.message?.trim();
  const displayName = resolveContainerDisplayName(container, index);
  const exitCodeLabel = container.exitCode === undefined ? EMPTY_PLACEHOLDER : `${container.exitCode}`;

  return (
    <Card className="border-border" data-testid="workload-container-card">
      <CardHeader className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base text-foreground">{displayName}</CardTitle>
          <Badge variant={resolveContainerVariant(container.status)}>{statusLabel}</Badge>
        </div>
        {reasonLabel ? <p className="text-sm text-muted-foreground">Reason: {reasonLabel}</p> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Role</div>
            <div className="text-sm text-foreground">{roleLabel}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Image</div>
            <div className="text-sm text-foreground">{container.image || EMPTY_PLACEHOLDER}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Container ID</div>
            <div className="text-sm text-foreground">{truncate(container.containerId, 32)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Restart Count</div>
            <div className="text-sm text-foreground">{container.restartCount.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Exit Code</div>
            <div className="text-sm text-foreground">{exitCodeLabel}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Started</div>
            <div className="text-sm text-foreground">{formatTimestamp(container.startedAt)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Finished</div>
            <div className="text-sm text-foreground">{formatTimestamp(container.finishedAt)}</div>
          </div>
          {messageLabel ? (
            <div className="md:col-span-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Message</div>
              <div className="text-sm text-foreground whitespace-pre-wrap">{messageLabel}</div>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function WorkloadDetailPage() {
  const { id: organizationIdParam, workloadId: workloadIdParam } = useParams();
  const organizationId = organizationIdParam ?? '';
  const workloadId = workloadIdParam ?? '';
  const location = useLocation();

  useNotifications({
    events: ['workload.status_changed', 'workload.updated'],
    invalidateKeys: [['workloads', workloadId, 'detail']],
    enabled: Boolean(workloadId),
  });

  const workloadQuery = useQuery({
    queryKey: ['workloads', workloadId, 'detail'],
    queryFn: () => runnersClient.getWorkload({ id: workloadId }),
    enabled: Boolean(workloadId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const workload = workloadQuery.data?.workload ?? null;
  const isNotFoundError = workloadQuery.error instanceof ConnectError && workloadQuery.error.code === Code.NotFound;
  const isOrgMismatch = Boolean(workload && organizationId && workload.organizationId !== organizationId);
  const isMissing = !workload && !workloadQuery.isPending && !workloadQuery.isError;
  const showNotFound = isNotFoundError || isOrgMismatch || isMissing;
  const showError = workloadQuery.isError && !isNotFoundError;

  const workloadTitle = workload?.meta?.id ? `Workload ${truncate(workload.meta.id, 12)}` : 'Workload';
  useDocumentTitle(workloadTitle);

  const containers = workload?.containers ?? [];
  const sortedContainers = [...containers].sort((left, right) => {
    const orderDelta = resolveContainerOrder(left.role) - resolveContainerOrder(right.role);
    if (orderDelta !== 0) return orderDelta;
    const leftName = left.name?.trim() || left.containerId || '';
    const rightName = right.name?.trim() || right.containerId || '';
    return leftName.localeCompare(rightName);
  });
  const containerEntries = sortedContainers.map((container, index) => ({
    container,
    displayName: resolveContainerDisplayName(container, index),
    name: container.name?.trim() ?? '',
    roleLabel: formatContainerRole(container.role),
  }));
  const logContainers = containerEntries.filter((entry) => entry.name.length > 0);
  const defaultLogContainerName =
    logContainers.find((entry) => entry.container.role === ContainerRole.MAIN)?.name ??
    logContainers[0]?.name ??
    '';
  const [selectedContainerName, setSelectedContainerName] = useState('');
  useEffect(() => {
    if (!defaultLogContainerName) {
      if (selectedContainerName) setSelectedContainerName('');
      return;
    }
    const hasSelection = logContainers.some((entry) => entry.name === selectedContainerName);
    if (!hasSelection) setSelectedContainerName(defaultLogContainerName);
  }, [defaultLogContainerName, logContainers, selectedContainerName]);
  const selectedLogContainer = logContainers.find((entry) => entry.name === selectedContainerName);
  const selectedLogLabel = selectedLogContainer
    ? `${selectedLogContainer.displayName} (${selectedLogContainer.roleLabel})`
    : undefined;
  const hasLogContainers = logContainers.length > 0;
  const fromState =
    typeof location.state === 'object' &&
    location.state !== null &&
    'from' in location.state &&
    typeof (location.state as { from?: unknown }).from === 'string'
      ? (location.state as { from: string }).from
      : undefined;
  const fallbackBack = organizationId ? `/organizations/${organizationId}/monitoring` : '/runners';
  const backHref = fromState || fallbackBack;
  const backLabel = fromState
    ? '← Back'
    : organizationId
      ? '← Back to Monitoring'
      : '← Back to Runners';

  const workloadIdLabel = workload?.meta?.id ?? EMPTY_PLACEHOLDER;
  const allocatedCpu = workload ? `${workload.allocatedCpuMillicores.toLocaleString()} m` : EMPTY_PLACEHOLDER;
  const allocatedRam = workload ? `${workload.allocatedRamBytes.toString()} bytes` : EMPTY_PLACEHOLDER;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="link" asChild data-testid="workload-detail-back">
          <NavLink to={backHref}>{backLabel}</NavLink>
        </Button>
      </div>
      {workloadQuery.isPending ? <div className="text-sm text-muted-foreground">Loading workload...</div> : null}
      {showError ? <div className="text-sm text-muted-foreground">Failed to load workload.</div> : null}
      {showNotFound ? <div className="text-sm text-muted-foreground">Workload not found.</div> : null}
      {workload && !showNotFound ? (
        <div className="space-y-6">
          <Card className="border-border" data-testid="workload-detail-card">
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Details</h3>
                <p className="text-sm text-muted-foreground">Identifiers and status signals.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Workload ID</div>
                  <div className="text-sm text-foreground">{workloadIdLabel}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Status</div>
                  <Badge variant={resolveWorkloadVariant(workload.status)}>{formatWorkloadStatus(workload.status)}</Badge>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Organization ID</div>
                  <div className="text-sm text-foreground">{workload.organizationId || EMPTY_PLACEHOLDER}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Runner ID</div>
                  <div className="text-sm text-foreground">{workload.runnerId || EMPTY_PLACEHOLDER}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Thread ID</div>
                  <div className="text-sm text-foreground">{workload.threadId || EMPTY_PLACEHOLDER}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Agent ID</div>
                  <div className="text-sm text-foreground">{workload.agentId || EMPTY_PLACEHOLDER}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Instance ID</div>
                  <div className="text-sm text-foreground">{workload.instanceId || EMPTY_PLACEHOLDER}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Ziti Identity ID</div>
                  <div className="text-sm text-foreground">{workload.zitiIdentityId || EMPTY_PLACEHOLDER}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Created</div>
                  <div className="text-sm text-foreground">{formatTimestamp(workload.meta?.createdAt)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Last Activity</div>
                  <div className="text-sm text-foreground">{formatTimestamp(workload.lastActivityAt)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Last Metering Sample</div>
                  <div className="text-sm text-foreground">{formatTimestamp(workload.lastMeteringSampledAt)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Removed At</div>
                  <div className="text-sm text-foreground">{formatTimestamp(workload.removedAt)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Allocated CPU</div>
                  <div className="text-sm text-foreground">{allocatedCpu}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Allocated RAM</div>
                  <div className="text-sm text-foreground">{allocatedRam}</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <div className="space-y-3" data-testid="workload-container-section">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Containers</h3>
              <p className="text-sm text-muted-foreground">Runtime status per container.</p>
            </div>
            {containerEntries.length === 0 ? (
              <div className="text-sm text-muted-foreground">No containers reported.</div>
            ) : (
              <div className="space-y-4">
                {containerEntries.map((entry, index) => (
                  <ContainerPanel
                    key={entry.container.containerId || entry.container.name || `${index}`}
                    container={entry.container}
                    index={index}
                  />
                ))}
                <Card className="border-border" data-testid="workload-log-viewer">
                  <CardHeader className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-base text-foreground">Logs</CardTitle>
                        <p className="text-sm text-muted-foreground">Streaming the last 1000 lines.</p>
                      </div>
                      <div className="min-w-[220px] space-y-1">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Container
                        </span>
                        <Select
                          value={selectedContainerName}
                          onValueChange={(value) => setSelectedContainerName(value)}
                          disabled={!hasLogContainers}
                        >
                          <SelectTrigger data-testid="workload-log-container-select">
                            <SelectValue
                              placeholder={hasLogContainers ? 'Select container' : 'No containers available'}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {logContainers.map((entry) => (
                              <SelectItem key={entry.name} value={entry.name}>
                                {entry.displayName} ({entry.roleLabel})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {selectedLogLabel ? (
                      <p className="text-sm text-muted-foreground">Viewing {selectedLogLabel}.</p>
                    ) : null}
                  </CardHeader>
                  <CardContent>
                    {hasLogContainers && selectedContainerName ? (
                      <WorkloadLogViewer workloadId={workloadId} containerName={selectedContainerName} />
                    ) : (
                      <div className="text-sm text-muted-foreground">No containers available for log streaming.</div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
