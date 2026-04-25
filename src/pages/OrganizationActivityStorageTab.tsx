import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useInfiniteQuery, useQueries } from '@tanstack/react-query';
import { agentsClient, runnersClient } from '@/api/client';
import { LoadMoreButton } from '@/components/LoadMoreButton';
import { SortableHeader } from '@/components/SortableHeader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { VolumeAttachment } from '@/gen/agynio/api/agents/v1/agents_pb';
import {
  ListVolumesSortField,
  SortDirection as VolumesSortDirection,
  VolumeStatus,
  type Volume,
} from '@/gen/agynio/api/runners/v1/runners_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import { type SortDirection } from '@/hooks/useListControls';
import { EMPTY_PLACEHOLDER, formatVolumeStatus, truncate } from '@/lib/format';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/pagination';

const UNATTACHED_LABEL = 'Unattached';

type VolumeSortKey = 'name' | 'size' | 'status';

const VOLUME_STATUS_OPTIONS = [
  VolumeStatus.PROVISIONING,
  VolumeStatus.ACTIVE,
  VolumeStatus.DEPROVISIONING,
  VolumeStatus.DELETED,
  VolumeStatus.FAILED,
];

const getVolumeName = (volume: Volume) => volume.meta?.id || volume.instanceId || volume.volumeId || '';

const formatAttachmentTarget = (attachment: VolumeAttachment) => {
  const targetId = attachment.target.value;
  if (!targetId) return EMPTY_PLACEHOLDER;
  if (attachment.target.case === 'agentId') return `Agent ${truncate(targetId, 18)}`;
  if (attachment.target.case === 'mcpId') return `MCP ${truncate(targetId, 18)}`;
  if (attachment.target.case === 'hookId') return `Hook ${truncate(targetId, 18)}`;
  return EMPTY_PLACEHOLDER;
};

export function OrganizationActivityStorageTab() {
  useDocumentTitle('Storage');

  const { id } = useParams();
  const organizationId = id ?? '';
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState<VolumeSortKey>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const notificationRooms = useMemo(
    () => (organizationId ? [`organization:${organizationId}`] : []),
    [organizationId],
  );

  useNotifications({
    events: ['volume.updated'],
    invalidateKeys: [['runners', organizationId, 'volumes', 'list']],
    rooms: notificationRooms,
    enabled: Boolean(organizationId) && notificationRooms.length > 0,
  });

  const normalizedSearch = searchTerm.trim();
  const filterKey = useMemo(
    () => ({ search: normalizedSearch, status: statusFilter }),
    [normalizedSearch, statusFilter],
  );
  const sortSpec = useMemo(() => {
    const fieldMap: Record<VolumeSortKey, ListVolumesSortField> = {
      name: ListVolumesSortField.NAME,
      size: ListVolumesSortField.SIZE,
      status: ListVolumesSortField.STATUS,
    };
    return {
      field: fieldMap[sortKey],
      direction: sortDirection === 'asc' ? VolumesSortDirection.ASC : VolumesSortDirection.DESC,
    };
  }, [sortDirection, sortKey]);
  const filterSpec = useMemo(() => {
    const statusValue = statusFilter === 'all' ? null : (Number(statusFilter) as VolumeStatus);
    return {
      volumeNameSubstring: normalizedSearch || undefined,
      statusIn: statusValue ? [statusValue] : [],
    };
  }, [normalizedSearch, statusFilter]);

  const volumesQuery = useInfiniteQuery({
    queryKey: ['runners', organizationId, 'volumes', 'list', filterKey, sortSpec],
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
  const attachmentVolumes = useMemo(() => volumes.filter((volume) => volume.volumeId), [volumes]);
  const attachmentQueries = useQueries({
    queries: attachmentVolumes.map((volume) => ({
      queryKey: ['volumeAttachments', organizationId, volume.volumeId],
      queryFn: () =>
        agentsClient.listVolumeAttachments({
          volumeId: volume.volumeId,
          agentId: '',
          mcpId: '',
          hookId: '',
          pageSize: MAX_PAGE_SIZE,
          pageToken: '',
        }),
      enabled: Boolean(volume.volumeId),
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    })),
  });

  const attachmentsByVolume = useMemo(() => {
    const map = new Map<string, VolumeAttachment[]>();
    attachmentVolumes.forEach((volume, index) => {
      const attachments = attachmentQueries[index]?.data?.volumeAttachments ?? [];
      map.set(volume.volumeId, attachments);
    });
    return map;
  }, [attachmentQueries, attachmentVolumes]);

  const getAttachedLabel = (volume: Volume) => {
    const attachments = volume.volumeId ? attachmentsByVolume.get(volume.volumeId) ?? [] : [];
    if (attachments.length === 0) return UNATTACHED_LABEL;
    const labels = attachments
      .map((attachment) => formatAttachmentTarget(attachment))
      .filter((label) => label !== EMPTY_PLACEHOLDER);
    return labels.length > 0 ? labels.join(', ') : UNATTACHED_LABEL;
  };

  const hasActiveFilters = normalizedSearch.length > 0 || statusFilter !== 'all';
  const handleSort = (key: VolumeSortKey) => {
    if (key === sortKey) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection('asc');
  };

  const getStatusVariant = (status: VolumeStatus) => {
    if (status === VolumeStatus.ACTIVE) return 'default';
    if (status === VolumeStatus.PROVISIONING) return 'secondary';
    if (status === VolumeStatus.FAILED) return 'destructive';
    return 'outline';
  };

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
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger data-testid="organization-storage-status-filter">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {VOLUME_STATUS_OPTIONS.map((status) => (
                <SelectItem key={status} value={String(status)}>
                  {formatVolumeStatus(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[2fr_1fr_1fr_2fr_120px]"
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
              <span>Used</span>
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
                const sizeLabel = volume.sizeGb ? `${volume.sizeGb} GB` : EMPTY_PLACEHOLDER;
                const attachedLabel = getAttachedLabel(volume);
                return (
                  <div
                    key={volume.meta?.id ?? volume.volumeId}
                    className="grid items-center gap-2 px-6 py-4 text-sm text-foreground md:grid-cols-[2fr_1fr_1fr_2fr_120px]"
                    data-testid="organization-storage-row"
                  >
                    <div>
                      <div className="font-medium" data-testid="organization-storage-name">
                        {truncate(name, 24)}
                      </div>
                      <div className="text-xs text-muted-foreground" data-testid="organization-storage-id">
                        {name}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground" data-testid="organization-storage-size">
                      {sizeLabel}
                    </span>
                    <span className="text-xs text-muted-foreground" data-testid="organization-storage-used">
                      {EMPTY_PLACEHOLDER}
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
