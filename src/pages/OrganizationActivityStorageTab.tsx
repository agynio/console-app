import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useInfiniteQuery, useQueries } from '@tanstack/react-query';
import { agentsClient, runnersClient } from '@/api/client';
import { LoadMoreButton } from '@/components/LoadMoreButton';
import { SortableHeader } from '@/components/SortableHeader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { VolumeAttachment } from '@/gen/agynio/api/agents/v1/agents_pb';
import { VolumeStatus, type Volume } from '@/gen/agynio/api/runners/v1/runners_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useListControls } from '@/hooks/useListControls';
import { EMPTY_PLACEHOLDER, formatVolumeStatus, truncate } from '@/lib/format';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/pagination';

const UNATTACHED_LABEL = 'Unattached';

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

  const volumesQuery = useInfiniteQuery({
    queryKey: ['runners', organizationId, 'volumes', 'list'],
    queryFn: ({ pageParam }) =>
      runnersClient.listVolumes({
        organizationId,
        pageSize: DEFAULT_PAGE_SIZE,
        pageToken: pageParam,
        statuses: [],
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

  const listControls = useListControls({
    items: volumes,
    searchFields: [
      (volume) => getVolumeName(volume),
      (volume) => volume.volumeId,
      (volume) => volume.sizeGb,
      (volume) => getAttachedLabel(volume),
      (volume) => formatVolumeStatus(volume.status),
    ],
    sortOptions: {
      name: (volume) => getVolumeName(volume),
      size: (volume) => volume.sizeGb,
      used: () => '',
      attached: (volume) => getAttachedLabel(volume),
      status: (volume) => formatVolumeStatus(volume.status),
    },
    defaultSortKey: 'name',
  });

  const visibleVolumes = listControls.filteredItems;
  const hasSearch = listControls.searchTerm.trim().length > 0;

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
      <div className="max-w-sm">
        <Input
          placeholder="Search storage volumes..."
          value={listControls.searchTerm}
          onChange={(event) => listControls.setSearchTerm(event.target.value)}
          data-testid="organization-storage-search"
        />
      </div>
      {volumesQuery.isPending ? <div className="text-sm text-muted-foreground">Loading storage volumes...</div> : null}
      {volumesQuery.isError ? <div className="text-sm text-muted-foreground">Failed to load storage.</div> : null}
      {volumes.length === 0 && !volumesQuery.isPending ? (
        <Card className="border-border" data-testid="organization-storage-empty">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No storage volumes yet.
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
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Size"
                sortKey="size"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Used"
                sortKey="used"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Attached to"
                sortKey="attached"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Status"
                sortKey="status"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
            </div>
            <div className="divide-y divide-border">
              {visibleVolumes.length === 0 ? (
                <div className="px-6 py-6 text-sm text-muted-foreground">
                  {hasSearch ? 'No results found.' : 'No storage volumes yet.'}
                </div>
              ) : (
                visibleVolumes.map((volume) => {
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
                })
              )}
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
