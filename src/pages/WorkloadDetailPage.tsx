import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useParams } from 'react-router-dom';
import { Code, ConnectError } from '@connectrpc/connect';
import { useInfiniteQuery, useQuery, type InfiniteData, type UseInfiniteQueryResult } from '@tanstack/react-query';
import { ChevronDownIcon, ChevronRightIcon, CopyIcon } from 'lucide-react';
import { runnersClient } from '@/api/client';
import { DetailPageHeader } from '@/components/DetailPageHeader';
import { LoadMoreButton } from '@/components/LoadMoreButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Container, Volume } from '@/gen/agynio/api/runners/v1/runners_pb';
import { ContainerRole, ContainerStatus, VolumeStatus, WorkloadStatus } from '@/gen/agynio/api/runners/v1/runners_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import { copyText } from '@/lib/clipboard';
import {
  EMPTY_PLACEHOLDER,
  formatAge,
  formatBytes,
  formatContainerStatus,
  formatDurationBetween,
  formatMillicores,
  formatTimestamp,
  formatVolumeStatus,
  formatWorkloadStatus,
  truncate,
  truncateMiddle,
} from '@/lib/format';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { cn } from '@/lib/utils';
import { summarizeVolumeAttachments } from '@/lib/volume';

type LogStreamState = 'loading' | 'streaming' | 'ended' | 'unavailable' | 'error';

type ContainerEntry = {
  container: Container;
  displayName: string;
  name: string;
  roleLabel: string;
};

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

const resolveVolumeVariant = (status: VolumeStatus) => {
  if (status === VolumeStatus.ACTIVE) return 'default';
  if (status === VolumeStatus.PROVISIONING) return 'secondary';
  if (status === VolumeStatus.FAILED) return 'destructive';
  return 'outline';
};

// WorkloadsTable is reached from five pages, so the breadcrumb names the one you left.
const PARENT_SECTIONS = [
  { segment: 'threads', list: 'Threads', detail: 'Thread' },
  { segment: 'instances', list: 'Instances', detail: 'Instance' },
  { segment: 'sandboxes', list: 'Sandboxes', detail: 'Sandbox' },
  { segment: 'runners', list: 'Runners', detail: 'Runner' },
  { segment: 'workloads', list: 'Workloads', detail: 'Workloads' },
];

const resolveParent = (fromPath: string | undefined, organizationId: string) => {
  const fallback = organizationId
    ? { label: 'Workloads', href: `/organizations/${organizationId}/workloads` }
    : { label: 'Runners', href: '/runners' };
  if (!fromPath) return fallback;
  const segments = fromPath.split('/').filter(Boolean);
  const section = PARENT_SECTIONS.find((entry) => segments.includes(entry.segment));
  if (!section) return fallback;
  const isList = segments[segments.length - 1] === section.segment;
  return { label: isList ? section.list : section.detail, href: fromPath };
};

function RailStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function RailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}

function CopyableId({ value, label, href }: { value: string; label: string; href?: string }) {
  if (!value) return <span className="text-sm text-foreground">{EMPTY_PLACEHOLDER}</span>;
  const shortened = truncateMiddle(value);
  return (
    <div className="flex items-center gap-1">
      {href ? (
        <NavLink to={href} className="font-mono text-sm hover:underline" title={value}>
          {shortened}
        </NavLink>
      ) : (
        <span className="font-mono text-sm text-foreground" title={value}>
          {shortened}
        </span>
      )}
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Copy ${label}`}
        onClick={() => copyText(value, `${label} copied.`)}
      >
        <CopyIcon />
      </Button>
    </div>
  );
}

type WorkloadLogViewerProps = {
  workloadId: string;
  containers: ContainerEntry[];
  selectedName: string;
  onSelectName: (name: string) => void;
};

function WorkloadLogViewer({ workloadId, containers, selectedName, onSelectName }: WorkloadLogViewerProps) {
  const [logText, setLogText] = useState('');
  const [streamState, setStreamState] = useState<LogStreamState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [follow, setFollow] = useState(true);
  const [wrap, setWrap] = useState(true);
  const [filterText, setFilterText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!workloadId || !selectedName) {
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
            containerName: selectedName,
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
  }, [selectedName, workloadId]);

  const lines = useMemo(() => (logText ? logText.replace(/\n+$/, '').split('\n') : []), [logText]);
  const needle = filterText.trim().toLowerCase();
  const visibleLines = needle ? lines.filter((line) => line.toLowerCase().includes(needle)) : lines;
  const visibleText = visibleLines.join('\n');

  useEffect(() => {
    if (!follow) return;
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [follow, visibleText]);

  const hasContainers = containers.length > 0;
  const isUnavailable = streamState === 'unavailable';
  const isError = streamState === 'error';
  const isLoading = streamState === 'loading';
  const isEnded = streamState === 'ended';
  const countLabel = needle ? `${visibleLines.length} of ${lines.length} lines` : `${lines.length} lines`;

  return (
    <div className="space-y-3" data-testid="workload-container-logs">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={selectedName} onValueChange={onSelectName} disabled={!hasContainers}>
          <SelectTrigger className="w-[220px]" data-testid="workload-log-container-select">
            <SelectValue placeholder={hasContainers ? 'Select container' : 'No containers available'} />
          </SelectTrigger>
          <SelectContent>
            {containers.map((entry) => (
              <SelectItem key={entry.name} value={entry.name}>
                {entry.displayName} ({entry.roleLabel})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={follow ? 'secondary' : 'outline'}
          size="sm"
          aria-pressed={follow}
          onClick={() => setFollow((prev) => !prev)}
          data-testid="workload-log-follow"
        >
          {follow ? 'Following' : 'Follow'}
        </Button>
        <Button
          variant={wrap ? 'secondary' : 'outline'}
          size="sm"
          aria-pressed={wrap}
          onClick={() => setWrap((prev) => !prev)}
          data-testid="workload-log-wrap"
        >
          Wrap
        </Button>
        <Input
          value={filterText}
          onChange={(event) => setFilterText(event.target.value)}
          placeholder="Filter lines"
          aria-label="Filter log lines"
          className="h-8 w-[200px]"
          data-testid="workload-log-filter"
        />
        {lines.length > 0 ? <span className="text-xs text-muted-foreground">{countLabel}</span> : null}
      </div>

      {isLoading ? <div className="text-sm text-muted-foreground">Loading logs...</div> : null}
      {isUnavailable ? <div className="text-sm text-muted-foreground">Log stream unavailable.</div> : null}
      {isError ? (
        <div className="text-sm text-muted-foreground">
          Failed to stream logs.{errorMessage ? ` ${errorMessage}` : ''}
        </div>
      ) : null}
      {!isUnavailable ? (
        <div
          ref={scrollRef}
          className="max-h-[32rem] overflow-auto rounded-md border border-border bg-muted/30 p-3"
        >
          {visibleLines.length > 0 ? (
            <pre
              className={cn(
                'font-mono text-xs text-foreground',
                wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre',
              )}
              data-testid="workload-container-log-output"
            >
              {visibleText}
            </pre>
          ) : needle && lines.length > 0 ? (
            <div className="text-xs text-muted-foreground">No lines match this filter.</div>
          ) : !isLoading && !isError ? (
            <div className="text-xs text-muted-foreground">No log output yet.</div>
          ) : null}
          {isEnded ? <div className="mt-2 text-xs text-muted-foreground">Stream ended</div> : null}
        </div>
      ) : null}
    </div>
  );
}

function ContainerRow({ entry }: { entry: ContainerEntry }) {
  const [expanded, setExpanded] = useState(false);
  const { container } = entry;
  const reasonLabel = container.reason?.trim();
  const messageLabel = container.message?.trim();
  const exitCodeLabel = container.exitCode === undefined ? EMPTY_PLACEHOLDER : `${container.exitCode}`;

  return (
    <>
      <TableRow data-testid="workload-container-row">
        <TableCell className="align-top">
          <div className="flex items-start gap-2">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-expanded={expanded}
              aria-label={expanded ? `Hide ${entry.displayName} details` : `Show ${entry.displayName} details`}
              onClick={() => setExpanded((prev) => !prev)}
            >
              {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
            </Button>
            <div className="space-y-0.5">
              <div className="font-medium text-foreground">{entry.displayName}</div>
              {reasonLabel ? <div className="text-xs text-muted-foreground">{reasonLabel}</div> : null}
            </div>
          </div>
        </TableCell>
        <TableCell className="align-top text-muted-foreground">{entry.roleLabel}</TableCell>
        <TableCell className="align-top">
          <span className="font-mono text-xs text-muted-foreground" title={container.image}>
            {truncate(container.image, 40)}
          </span>
        </TableCell>
        <TableCell className="align-top tabular-nums">{container.restartCount.toLocaleString()}</TableCell>
        <TableCell className="align-top tabular-nums">{exitCodeLabel}</TableCell>
        <TableCell className="align-top">
          <Badge variant={resolveContainerVariant(container.status)}>{formatContainerStatus(container.status)}</Badge>
        </TableCell>
      </TableRow>
      {expanded ? (
        <TableRow data-testid="workload-container-detail">
          <TableCell colSpan={6} className="bg-muted/30">
            <div className="grid gap-4 pl-8 md:grid-cols-3">
              <RailField label="Container ID" value={truncateMiddle(container.containerId, 12, 8)} />
              <RailField label="Started" value={formatTimestamp(container.startedAt)} />
              <RailField label="Finished" value={formatTimestamp(container.finishedAt)} />
              {messageLabel ? (
                <div className="md:col-span-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Message</div>
                  <div className="whitespace-pre-wrap text-sm text-foreground">{messageLabel}</div>
                </div>
              ) : null}
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

type ThreadStoragePanelProps = {
  currentPath: string;
  organizationId: string;
  volumes: Volume[];
  volumesQuery: UseInfiniteQueryResult<
    InfiniteData<Awaited<ReturnType<typeof runnersClient.listVolumesByThread>>, unknown>,
    Error
  >;
};

function ThreadStoragePanel({ currentPath, organizationId, volumes, volumesQuery }: ThreadStoragePanelProps) {
  return (
    <Card className="border-border" data-testid="workload-thread-storage-card">
      <CardContent className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Attached storage</h3>
        {volumesQuery.isPending ? <div className="text-sm text-muted-foreground">Loading storage volumes...</div> : null}
        {volumesQuery.isError ? <div className="text-sm text-muted-foreground">Failed to load storage.</div> : null}
        {volumes.length === 0 && !volumesQuery.isPending && !volumesQuery.isError ? (
          <div className="text-sm text-muted-foreground">No volumes on this thread.</div>
        ) : null}
        {volumes.length > 0 ? (
          <div className="divide-y divide-border" data-testid="workload-thread-storage-list">
            {volumes.map((volume) => {
              const volumeId = volume.volumeId || volume.meta?.id || '';
              const volumeName = volume.volumeName?.trim() || EMPTY_PLACEHOLDER;
              const volumeLink = volumeId ? `/organizations/${organizationId}/volumes/${volumeId}` : null;
              const sizeLabel = volume.sizeGb ? `${volume.sizeGb} GB` : EMPTY_PLACEHOLDER;
              const attachedLabel = summarizeVolumeAttachments(volume.attachments ?? []);
              return (
                <div
                  key={volume.meta?.id ?? volume.volumeId}
                  className="space-y-1 py-2 first:pt-0 last:pb-0"
                  data-testid="workload-thread-storage-row"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium" data-testid="workload-thread-storage-name">
                      {volumeLink ? (
                        <NavLink to={volumeLink} state={{ from: currentPath }} className="text-foreground hover:underline">
                          {truncate(volumeName, 20)}
                        </NavLink>
                      ) : (
                        truncate(volumeName, 20)
                      )}
                    </span>
                    <Badge variant={resolveVolumeVariant(volume.status)} data-testid="workload-thread-storage-status">
                      {formatVolumeStatus(volume.status)}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <span data-testid="workload-thread-storage-size">{sizeLabel}</span>
                    {' · '}
                    <span data-testid="workload-thread-storage-attached">{attachedLabel}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
        <LoadMoreButton
          hasMore={Boolean(volumesQuery.hasNextPage)}
          isLoading={volumesQuery.isFetchingNextPage}
          onClick={() => {
            void volumesQuery.fetchNextPage();
          }}
        />
      </CardContent>
    </Card>
  );
}

export function WorkloadDetailPage() {
  const { id: organizationIdParam, workloadId: workloadIdParam } = useParams();
  const organizationId = organizationIdParam ?? '';
  const workloadId = workloadIdParam ?? '';
  const location = useLocation();

  const notificationRooms = useMemo(() => {
    const rooms: string[] = [];
    if (organizationId) rooms.push(`organization:${organizationId}`);
    if (workloadId) rooms.push(`workload:${workloadId}`);
    return rooms;
  }, [organizationId, workloadId]);

  useNotifications({
    events: ['workload.status_changed', 'workload.updated'],
    invalidateKeys: [['workloads', workloadId, 'detail']],
    rooms: notificationRooms,
    enabled: Boolean(workloadId) && notificationRooms.length > 0,
  });

  const workloadQuery = useQuery({
    queryKey: ['workloads', workloadId, 'detail'],
    queryFn: () => runnersClient.getWorkload({ id: workloadId }),
    enabled: Boolean(workloadId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const workload = workloadQuery.data?.workload ?? null;

  const volumesQuery = useInfiniteQuery({
    queryKey: ['workloads', workloadId, 'thread-volumes', workload?.threadId ?? ''],
    queryFn: ({ pageParam }) => {
      if (!workload) throw new Error('Workload is required before loading thread storage.');
      return runnersClient.listVolumesByThread({
        threadId: workload.threadId,
        pageSize: DEFAULT_PAGE_SIZE,
        pageToken: pageParam,
      });
    },
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
    enabled: Boolean(workload?.threadId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const volumes = useMemo(
    () => volumesQuery.data?.pages.flatMap((page) => page.volumes) ?? [],
    [volumesQuery.data?.pages],
  );
  const isNotFoundError = workloadQuery.error instanceof ConnectError && workloadQuery.error.code === Code.NotFound;
  const isOrgMismatch = Boolean(workload && organizationId && workload.organizationId !== organizationId);
  const isMissing = !workload && !workloadQuery.isPending && !workloadQuery.isError;
  const showNotFound = isNotFoundError || isOrgMismatch || isMissing;
  const showError = workloadQuery.isError && !isNotFoundError;

  const workloadTitle = workload?.meta?.id ? `Workload ${truncate(workload.meta.id, 12)}` : 'Workload';
  useDocumentTitle(workloadTitle);

  // Only the organization room -- see OrganizationThreadDetailPage: no
  // publisher exists for "thread:{id}".
  const volumeNotificationRooms = useMemo(() => {
    const rooms: string[] = [];
    if (organizationId) rooms.push(`organization:${organizationId}`);
    return rooms;
  }, [organizationId]);

  useNotifications({
    events: ['volume.updated'],
    invalidateKeys: [['workloads', workloadId, 'thread-volumes', workload?.threadId ?? '']],
    rooms: volumeNotificationRooms,
    enabled: Boolean(workload?.threadId) && volumeNotificationRooms.length > 0,
  });

  const containers = workload?.containers ?? [];
  const sortedContainers = [...containers].sort((left, right) => {
    const orderDelta = resolveContainerOrder(left.role) - resolveContainerOrder(right.role);
    if (orderDelta !== 0) return orderDelta;
    const leftName = left.name?.trim() || left.containerId || '';
    const rightName = right.name?.trim() || right.containerId || '';
    return leftName.localeCompare(rightName);
  });
  const containerEntries: ContainerEntry[] = sortedContainers.map((container, index) => ({
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

  const fromState =
    typeof location.state === 'object' &&
    location.state !== null &&
    'from' in location.state &&
    typeof (location.state as { from?: unknown }).from === 'string'
      ? (location.state as { from: string }).from
      : undefined;
  const parent = resolveParent(fromState, organizationId);

  const agentName = workload?.agentName?.trim();
  const runnerName = workload?.runnerName?.trim();
  const agentId = workload?.agentId ?? '';
  const runnerId = workload?.runnerId ?? '';
  const agentLink = organizationId && agentId && agentName ? `/organizations/${organizationId}/agents/${agentId}` : '';
  const runnerLink = organizationId && runnerId && runnerName ? `/organizations/${organizationId}/runners/${runnerId}` : '';
  const threadLink =
    organizationId && workload?.threadId ? `/organizations/${organizationId}/threads/${workload.threadId}` : '';
  const agentLabel = agentName || EMPTY_PLACEHOLDER;
  const runnerLabel = runnerName || EMPTY_PLACEHOLDER;
  const isTerminal = workload
    ? workload.status === WorkloadStatus.STOPPED || workload.status === WorkloadStatus.FAILED
    : false;
  const durationEnd = workload ? (workload.removedAt ?? (isTerminal ? workload.lastActivityAt : undefined)) : undefined;
  const durationLabel = workload ? formatDurationBetween(workload.meta?.createdAt, durationEnd) : EMPTY_PLACEHOLDER;
  const totalRestarts = containers.reduce((sum, container) => sum + container.restartCount, 0);

  // A failed workload states its cause in the header; the container carrying it is below.
  const failedContainer =
    workload?.status === WorkloadStatus.FAILED
      ? sortedContainers.find((container) => container.reason?.trim() || (container.exitCode ?? 0) !== 0)
      : undefined;
  const failureReason = failedContainer?.reason?.trim() ?? '';
  const failureName = failedContainer?.name?.trim() || 'container';
  const failureNote = failedContainer
    ? failureReason
      ? `${failureName}: ${failureReason}`
      : `${failureName} exited ${failedContainer.exitCode}`
    : '';

  const metaLine = [
    agentName,
    runnerName,
    durationLabel === EMPTY_PLACEHOLDER ? '' : isTerminal ? `ran ${durationLabel}` : `up ${durationLabel}`,
    failureNote,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="space-y-6">
      {workloadQuery.isPending ? <div className="text-sm text-muted-foreground">Loading workload...</div> : null}
      {showError ? <div className="text-sm text-muted-foreground">Failed to load workload.</div> : null}
      {showNotFound ? <div className="text-sm text-muted-foreground">Workload not found.</div> : null}
      {workload && !showNotFound ? (
        <>
          <DetailPageHeader
            parentLabel={parent.label}
            parentHref={parent.href}
            title={truncateMiddle(workload.meta?.id, 8, 6)}
            meta={metaLine}
            badge={
              <Badge variant={resolveWorkloadVariant(workload.status)}>{formatWorkloadStatus(workload.status)}</Badge>
            }
            actions={
              <>
                {threadLink ? (
                  <Button variant="outline" size="sm" asChild data-testid="workload-detail-thread">
                    <NavLink to={threadLink}>Open thread</NavLink>
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyText(workload.meta?.id ?? '', 'Workload ID copied.')}
                  data-testid="workload-detail-copy"
                >
                  Copy ID
                </Button>
              </>
            }
            testId="workload-detail-header"
          />

          <div className="grid items-start gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
            <div className="space-y-4 lg:sticky lg:top-20">
              <Card className="border-border" data-testid="workload-detail-card">
                <CardContent className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Summary</h3>
                  <RailStat label="Duration" value={durationLabel} />
                  <RailStat label="CPU" value={formatMillicores(workload.allocatedCpuMillicores)} />
                  <RailStat label="Memory" value={formatBytes(workload.allocatedRamBytes)} />
                  <RailStat label="Restarts" value={totalRestarts.toLocaleString()} />
                  <RailStat label="Containers" value={containerEntries.length.toLocaleString()} />
                  <RailStat label="Last metered" value={formatTimestamp(workload.lastMeteringSampledAt)} />
                </CardContent>
              </Card>

              <Card className="border-border" data-testid="workload-identity-card">
                <CardContent className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Identity</h3>
                  <RailField
                    label="Agent"
                    value={
                      agentLink ? (
                        <NavLink to={agentLink} className="hover:underline">
                          {agentLabel}
                        </NavLink>
                      ) : (
                        agentLabel
                      )
                    }
                  />
                  <RailField
                    label="Runner"
                    value={
                      runnerLink ? (
                        <NavLink to={runnerLink} className="hover:underline">
                          {runnerLabel}
                        </NavLink>
                      ) : (
                        runnerLabel
                      )
                    }
                  />
                  <RailField
                    label="Thread"
                    value={<CopyableId value={workload.threadId} label="Thread ID" href={threadLink || undefined} />}
                  />
                  <RailField
                    label="Workload"
                    value={<CopyableId value={workload.meta?.id ?? ''} label="Workload ID" />}
                  />
                  {workload.instanceId && workload.instanceId !== workload.meta?.id ? (
                    <RailField
                      label="Instance"
                      value={<CopyableId value={workload.instanceId} label="Instance ID" />}
                    />
                  ) : null}
                  <RailField label="Ziti identity" value={workload.zitiIdentityId || EMPTY_PLACEHOLDER} />
                  {organizationId ? null : (
                    <RailField
                      label="Organization"
                      value={<CopyableId value={workload.organizationId} label="Organization ID" />}
                    />
                  )}
                </CardContent>
              </Card>

              <Card className="border-border" data-testid="workload-lifecycle-card">
                <CardContent className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Lifecycle</h3>
                  <RailField
                    label="Created"
                    value={
                      <>
                        {formatTimestamp(workload.meta?.createdAt)}
                        <span className="ml-2 text-xs text-muted-foreground">{formatAge(workload.meta?.createdAt)}</span>
                      </>
                    }
                  />
                  <RailField
                    label="Last activity"
                    value={
                      <>
                        {formatTimestamp(workload.lastActivityAt)}
                        <span className="ml-2 text-xs text-muted-foreground">{formatAge(workload.lastActivityAt)}</span>
                      </>
                    }
                  />
                  <RailField
                    label="Removed"
                    value={
                      <>
                        {formatTimestamp(workload.removedAt)}
                        {workload.removedAt ? (
                          <span className="ml-2 text-xs text-muted-foreground">{formatAge(workload.removedAt)}</span>
                        ) : null}
                      </>
                    }
                  />
                </CardContent>
              </Card>

              <ThreadStoragePanel
                currentPath={location.pathname}
                organizationId={organizationId}
                volumes={volumes}
                volumesQuery={volumesQuery}
              />
            </div>

            <div className="space-y-4">
              <Card className="border-border" data-testid="workload-container-section">
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-foreground">Containers</h3>
                    <span className="text-xs text-muted-foreground">sorted init, main, sidecar</span>
                  </div>
                  {containerEntries.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No containers reported.</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Image</TableHead>
                          <TableHead>Restarts</TableHead>
                          <TableHead>Exit</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {containerEntries.map((entry, index) => (
                          <ContainerRow
                            key={entry.container.containerId || entry.name || `${index}`}
                            entry={entry}
                          />
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border" data-testid="workload-log-viewer">
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-foreground">Logs</h3>
                    <span className="text-xs text-muted-foreground">last 1000 lines</span>
                  </div>
                  {logContainers.length > 0 && selectedContainerName ? (
                    <WorkloadLogViewer
                      workloadId={workloadId}
                      containers={logContainers}
                      selectedName={selectedContainerName}
                      onSelectName={setSelectedContainerName}
                    />
                  ) : (
                    <div className="text-sm text-muted-foreground">No containers available for log streaming.</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
