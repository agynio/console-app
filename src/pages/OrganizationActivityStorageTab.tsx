import { useMemo, useState } from 'react';
import { NavLink, useLocation, useParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { runnersClient } from '@/api/client';
import { LoadMoreButton } from '@/components/LoadMoreButton';
import { MultiSelectFilter } from '@/components/MultiSelectFilter';
import { SortableHeader } from '@/components/SortableHeader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  AttachmentKind,
  ListVolumesSortField,
  SortDirection as VolumesSortDirection,
  VolumeAttachmentFilterKind,
  VolumeStatus,
  type Attachment,
  type Volume,
} from '@/gen/agynio/api/runners/v1/runners_pb';
import type { NotificationEnvelope } from '@/gen/agynio/api/notifications/v1/notifications_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import { type SortDirection } from '@/hooks/useListControls';
import { EMPTY_PLACEHOLDER, formatDateOnly, formatVolumeStatus, truncate } from '@/lib/format';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/pagination';

const UNATTACHED_LABEL = 'Unattached';

type VolumeSortKey = 'name' | 'size' | 'status' | 'created';

const VOLUME_STATUS_OPTIONS = [
  VolumeStatus.PROVISIONING,
  VolumeStatus.ACTIVE,
  VolumeStatus.DEPROVISIONING,
  VolumeStatus.DELETED,
  VolumeStatus.FAILED,
];

const VOLUME_ATTACHMENT_OPTIONS = [
  { value: String(VolumeAttachmentFilterKind.AGENT), label: 'Agent' },
  { value: String(VolumeAttachmentFilterKind.MCP), label: 'MCP' },
  { value: String(VolumeAttachmentFilterKind.HOOK), label: 'Hook' },
  { value: String(VolumeAttachmentFilterKind.UNATTACHED), label: 'Unattached' },
];

const ATTACHMENT_KIND_LABELS: Record<AttachmentKind, string> = {
  [AttachmentKind.UNSPECIFIED]: 'Attachment',
  [AttachmentKind.AGENT]: 'Agent',
  [AttachmentKind.MCP]: 'MCP',
  [AttachmentKind.HOOK]: 'Hook',
};

const getVolumeName = (volume: Volume) => volume.volumeName || volume.volumeId || volume.meta?.id || '';

const formatAttachmentLabel = (attachment: Attachment) => {
  const name = attachment.name?.trim() || attachment.id || '';
  if (!name) return EMPTY_PLACEHOLDER;
  const kindLabel = ATTACHMENT_KIND_LABELS[attachment.kind] ?? 'Attachment';
  return kindLabel === 'Attachment' ? name : `${kindLabel} ${name}`;
};

const summarizeAttachments = (attachments: Attachment[]) => {
  if (attachments.length === 0) return UNATTACHED_LABEL;
  const labels = [...attachments]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((attachment) => formatAttachmentLabel(attachment))
    .filter((label) => label !== EMPTY_PLACEHOLDER);
  if (labels.length === 0) return UNATTACHED_LABEL;
  if (labels.length === 1) return labels[0];
  return `${labels[0]} +${labels.length - 1} more`;
};

const extractVolumeId = (payload?: NotificationEnvelope['payload']): string | null => {
  if (!payload) return null;
  const resolveString = (value: unknown): string | null =>
    typeof value === 'string' && value.trim().length > 0 ? value : null;
  const direct = resolveString(payload.volumeId ?? payload.volume_id ?? payload.id);
  if (direct) return direct;
  const volume = payload.volume;
  if (!volume || typeof volume !== 'object' || Array.isArray(volume)) return null;
  const volumeRecord = volume as Record<string, unknown>;
  const nested = resolveString(volumeRecord.volumeId ?? volumeRecord.volume_id ?? volumeRecord.id);
  if (nested) return nested;
  const meta = volumeRecord.meta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  return resolveString((meta as Record<string, unknown>).id);
};

const replaceFirstPage = <TPage,>(
  data: InfiniteData<TPage, unknown> | undefined,
  firstPage: TPage,
): InfiniteData<TPage, unknown> => {
  if (!data) {
    return { pages: [firstPage], pageParams: [''] };
  }
  const nextPages = [firstPage, ...data.pages.slice(1)];
  const nextPageParams = data.pageParams.length > 0 ? data.pageParams : [''];
  return { ...data, pages: nextPages, pageParams: nextPageParams };
};

const upsertVolume = (
  data: InfiniteData<Awaited<ReturnType<typeof runnersClient.listVolumes>>, unknown> | undefined,
  volume: Volume,
): InfiniteData<Awaited<ReturnType<typeof runnersClient.listVolumes>>, unknown> | undefined => {
  if (!data) return data;
  const volumeId = volume.volumeId || volume.meta?.id;
  if (!volumeId) return data;

  let found = false;
  const nextPages = data.pages.map((page) => {
    const nextVolumes = page.volumes.map((item) => {
      const itemId = item.volumeId || item.meta?.id;
      if (itemId && itemId === volumeId) {
        found = true;
        return volume;
      }
      return item;
    });
    return { ...page, volumes: nextVolumes };
  });

  if (!found && nextPages.length > 0) {
    const firstPage = nextPages[0];
    const withoutDuplicate = firstPage.volumes.filter((item) => (item.volumeId || item.meta?.id) !== volumeId);
    const nextVolumes = [volume, ...withoutDuplicate]
      .sort((left, right) => getVolumeName(left).localeCompare(getVolumeName(right)))
      .slice(0, DEFAULT_PAGE_SIZE);
    nextPages[0] = { ...firstPage, volumes: nextVolumes };
  }

  return { ...data, pages: nextPages };
};

export function OrganizationActivityStorageTab() {
  useDocumentTitle('Storage');

  const { id } = useParams();
  const organizationId = id ?? '';
  const location = useLocation();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [runnerFilter, setRunnerFilter] = useState<string[]>([]);
  const [attachedKindFilter, setAttachedKindFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<VolumeSortKey>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const runnersQuery = useQuery({
    queryKey: ['runners', organizationId, 'list', 'options'],
    queryFn: () => runnersClient.listRunners({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const runnerOptions = useMemo(() => {
    const runners = runnersQuery.data?.runners ?? [];
    return runners
      .map((runner) => {
        const runnerId = runner.meta?.id ?? '';
        if (!runnerId) return null;
        const name = runner.name?.trim() || runnerId;
        return {
          value: runnerId,
          label: name,
          secondary: name === runnerId ? undefined : runnerId,
        };
      })
      .filter((option): option is NonNullable<typeof option> => option !== null)
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [runnersQuery.data?.runners]);

  const statusOptions = useMemo(
    () =>
      VOLUME_STATUS_OPTIONS.map((status) => ({
        value: String(status),
        label: formatVolumeStatus(status),
      })),
    [],
  );

  const notificationRooms = useMemo(
    () => (organizationId ? [`organization:${organizationId}`] : []),
    [organizationId],
  );

  const normalizedSearch = searchTerm.trim();
  const filterKey = useMemo(
    () => ({ search: normalizedSearch, runner: runnerFilter, attached: attachedKindFilter, status: statusFilter }),
    [normalizedSearch, runnerFilter, attachedKindFilter, statusFilter],
  );
  const sortSpec = useMemo(() => {
    const fieldMap: Record<VolumeSortKey, ListVolumesSortField> = {
      name: ListVolumesSortField.NAME,
      size: ListVolumesSortField.SIZE,
      status: ListVolumesSortField.STATUS,
      created: ListVolumesSortField.CREATED,
    };
    return {
      field: fieldMap[sortKey],
      direction: sortDirection === 'asc' ? VolumesSortDirection.ASC : VolumesSortDirection.DESC,
    };
  }, [sortDirection, sortKey]);
  const filterSpec = useMemo(() => {
    const statusValues = statusFilter.map((value) => Number(value) as VolumeStatus).filter((value) => value > 0);
    const attachedKinds = attachedKindFilter
      .map((value) => Number(value) as VolumeAttachmentFilterKind)
      .filter((value) => value > 0);
    return {
      volumeNameSubstring: normalizedSearch || undefined,
      statusIn: statusValues,
      runnerIdIn: runnerFilter,
      attachedToKindIn: attachedKinds,
    };
  }, [normalizedSearch, statusFilter, runnerFilter, attachedKindFilter]);

  const volumesQueryKey = useMemo(
    () => ['runners', organizationId, 'volumes', 'list', filterKey, sortSpec] as const,
    [filterKey, organizationId, sortSpec],
  );

  const volumesQuery = useInfiniteQuery({
    queryKey: volumesQueryKey,
    queryFn: ({ pageParam }) =>
      runnersClient.listVolumes({
        organizationId,
        pageSize: DEFAULT_PAGE_SIZE,
        pageToken: pageParam,
        filter: filterSpec,
        sort: sortSpec,
      }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const volumes = useMemo(
    () => volumesQuery.data?.pages.flatMap((page) => page.volumes) ?? [],
    [volumesQuery.data?.pages],
  );
  const hasActiveFilters =
    normalizedSearch.length > 0 ||
    runnerFilter.length > 0 ||
    attachedKindFilter.length > 0 ||
    statusFilter.length > 0;
  const handleSort = (key: VolumeSortKey) => {
    if (key === sortKey) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection('asc');
  };

  const hasActiveControls = hasActiveFilters || sortKey !== 'name' || sortDirection !== 'asc';

  const getStatusVariant = (status: VolumeStatus) => {
    if (status === VolumeStatus.ACTIVE) return 'default';
    if (status === VolumeStatus.PROVISIONING) return 'secondary';
    if (status === VolumeStatus.FAILED) return 'destructive';
    return 'outline';
  };

  useNotifications({
    events: ['volume.updated'],
    rooms: notificationRooms,
    enabled: Boolean(organizationId) && notificationRooms.length > 0,
    onEvent: (envelope) => {
      if (hasActiveControls) {
        void (async () => {
          try {
            const firstPage = await runnersClient.listVolumes({
              organizationId,
              pageSize: DEFAULT_PAGE_SIZE,
              pageToken: '',
              filter: filterSpec,
              sort: sortSpec,
            });
            queryClient.setQueryData<InfiniteData<Awaited<ReturnType<typeof runnersClient.listVolumes>>, unknown>>(
              volumesQueryKey,
              (data) => replaceFirstPage(data, firstPage),
            );
          } catch (error) {
            console.error('[useNotifications] volume refetch error:', error);
          }
        })();
        return;
      }

      const volumeId = extractVolumeId(envelope.payload);
      if (!volumeId) return;
      void (async () => {
        try {
          const response = await runnersClient.getVolume({ id: volumeId });
          const volume = response.volume;
          if (!volume || volume.organizationId !== organizationId) return;
          queryClient.setQueryData<InfiniteData<Awaited<ReturnType<typeof runnersClient.listVolumes>>, unknown>>(
            volumesQueryKey,
            (data) => upsertVolume(data, volume),
          );
        } catch (error) {
          console.error('[useNotifications] volume update error:', error);
        }
      })();
    },
  });

  return (
    <div className="space-y-4" data-testid="organization-activity-storage">
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-foreground">Storage</h3>
        <p className="text-sm text-muted-foreground">
          Real-time view of persistent volumes in use across the organization.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[220px] max-w-sm flex-1">
          <Input
            placeholder="Search storage volumes..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            data-testid="organization-storage-search"
          />
        </div>
        <div className="min-w-[180px]">
          <MultiSelectFilter
            label="Runner"
            options={runnerOptions}
            selectedValues={runnerFilter}
            onChange={setRunnerFilter}
            testId="organization-storage-runner-filter"
          />
        </div>
        <div className="min-w-[180px]">
          <MultiSelectFilter
            label="Attached to"
            options={VOLUME_ATTACHMENT_OPTIONS}
            selectedValues={attachedKindFilter}
            onChange={setAttachedKindFilter}
            testId="organization-storage-attached-filter"
          />
        </div>
        <div className="min-w-[180px]">
          <MultiSelectFilter
            label="Status"
            options={statusOptions}
            selectedValues={statusFilter}
            onChange={setStatusFilter}
            testId="organization-storage-status-filter"
          />
        </div>
      </div>
      {volumesQuery.isPending ? <div className="text-sm text-muted-foreground">Loading storage volumes...</div> : null}
      {volumesQuery.isError ? <div className="text-sm text-muted-foreground">Failed to load storage.</div> : null}
      {volumes.length === 0 && !volumesQuery.isPending ? (
        <Card className="border-border" data-testid="organization-storage-empty">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {hasActiveFilters ? 'No results found.' : 'No storage volumes yet.'}
          </CardContent>
        </Card>
      ) : null}
      {volumes.length > 0 ? (
        <Card className="border-border" data-testid="organization-storage-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[2fr_1fr_1fr_2fr_140px]"
              data-testid="organization-storage-header"
            >
              <SortableHeader
                label="Name"
                sortKey="name"
                activeSortKey={sortKey}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                label="Size"
                sortKey="size"
                activeSortKey={sortKey}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                label="Created"
                sortKey="created"
                activeSortKey={sortKey}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
              <span>Attached to</span>
              <SortableHeader
                label="Status"
                sortKey="status"
                activeSortKey={sortKey}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            </div>
            <div className="divide-y divide-border">
              {volumes.map((volume) => {
                const name = getVolumeName(volume) || EMPTY_PLACEHOLDER;
                const volumeId = volume.volumeId || volume.meta?.id || '';
                const volumeLink = volumeId ? `/organizations/${organizationId}/volumes/${volumeId}` : null;
                const sizeLabel = volume.sizeGb ? `${volume.sizeGb} GB` : EMPTY_PLACEHOLDER;
                const attachedLabel = summarizeAttachments(volume.attachments ?? []);
                const createdLabel = formatDateOnly(volume.meta?.createdAt);
                return (
                  <div
                    key={volume.meta?.id ?? volume.volumeId}
                    className="grid items-center gap-2 px-6 py-4 text-sm text-foreground md:grid-cols-[2fr_1fr_1fr_2fr_140px]"
                    data-testid="organization-storage-row"
                  >
                    <div>
                      <div className="font-medium" data-testid="organization-storage-name">
                        {volumeLink ? (
                          <NavLink
                            to={volumeLink}
                            state={{ from: location.pathname }}
                            className="text-foreground hover:underline"
                            data-testid="organization-storage-link"
                          >
                            {truncate(name, 24)}
                          </NavLink>
                        ) : (
                          truncate(name, 24)
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground" data-testid="organization-storage-id">
                        {volumeId || name}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground" data-testid="organization-storage-size">
                      {sizeLabel}
                    </span>
                    <span className="text-xs text-muted-foreground" data-testid="organization-storage-created">
                      {createdLabel}
                    </span>
                    <span className="text-xs text-muted-foreground" data-testid="organization-storage-attached">
                      {attachedLabel}
                    </span>
                    <Badge variant={getStatusVariant(volume.status)} data-testid="organization-storage-status">
                      {formatVolumeStatus(volume.status)}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}
      <LoadMoreButton
        hasMore={Boolean(volumesQuery.hasNextPage)}
        isLoading={volumesQuery.isFetchingNextPage}
        onClick={() => {
          void volumesQuery.fetchNextPage();
        }}
      />
    </div>
  );
}
