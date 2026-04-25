import { useMemo } from 'react';
import { NavLink, useLocation, useParams } from 'react-router-dom';
import { Code, ConnectError } from '@connectrpc/connect';
import { useQuery } from '@tanstack/react-query';
import { runnersClient } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AttachmentKind, type Attachment, VolumeStatus } from '@/gen/agynio/api/runners/v1/runners_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import { EMPTY_PLACEHOLDER, formatTimestamp, formatVolumeStatus, truncate } from '@/lib/format';

const ATTACHMENT_KIND_LABELS: Record<AttachmentKind, string> = {
  [AttachmentKind.UNSPECIFIED]: 'Attachment',
  [AttachmentKind.AGENT]: 'Agent',
  [AttachmentKind.MCP]: 'MCP',
  [AttachmentKind.HOOK]: 'Hook',
};

const formatAttachmentLabel = (attachment: Attachment) => {
  const name = attachment.name?.trim() || attachment.id || '';
  if (!name) return EMPTY_PLACEHOLDER;
  const kindLabel = ATTACHMENT_KIND_LABELS[attachment.kind] ?? 'Attachment';
  return kindLabel === 'Attachment' ? name : `${kindLabel} ${name}`;
};

const getStatusVariant = (status: VolumeStatus) => {
  if (status === VolumeStatus.ACTIVE) return 'default';
  if (status === VolumeStatus.PROVISIONING) return 'secondary';
  if (status === VolumeStatus.FAILED) return 'destructive';
  return 'outline';
};

export function VolumeDetailPage() {
  const { id: organizationIdParam, volumeId: volumeIdParam } = useParams();
  const organizationId = organizationIdParam ?? '';
  const volumeId = volumeIdParam ?? '';
  const location = useLocation();

  const notificationRooms = useMemo(() => {
    const rooms: string[] = [];
    if (organizationId) rooms.push(`organization:${organizationId}`);
    if (volumeId) rooms.push(`volume:${volumeId}`);
    return rooms;
  }, [organizationId, volumeId]);

  useNotifications({
    events: ['volume.updated'],
    invalidateKeys: [['volumes', volumeId, 'detail']],
    rooms: notificationRooms,
    enabled: Boolean(volumeId) && notificationRooms.length > 0,
  });

  const volumeQuery = useQuery({
    queryKey: ['volumes', volumeId, 'detail'],
    queryFn: () => runnersClient.getVolume({ id: volumeId }),
    enabled: Boolean(volumeId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const volume = volumeQuery.data?.volume ?? null;
  const isNotFoundError = volumeQuery.error instanceof ConnectError && volumeQuery.error.code === Code.NotFound;
  const isOrgMismatch = Boolean(volume && organizationId && volume.organizationId !== organizationId);
  const isMissing = !volume && !volumeQuery.isPending && !volumeQuery.isError;
  const showNotFound = isNotFoundError || isOrgMismatch || isMissing;
  const showError = volumeQuery.isError && !isNotFoundError;

  const volumeTitle = volume?.volumeName || volume?.volumeId ? `Volume ${truncate(volume.volumeName || volume.volumeId, 18)}` : 'Volume';
  useDocumentTitle(volumeTitle);

  const fromState =
    typeof location.state === 'object' &&
    location.state !== null &&
    'from' in location.state &&
    typeof (location.state as { from?: unknown }).from === 'string'
      ? (location.state as { from: string }).from
      : undefined;
  const fallbackBack = organizationId ? `/organizations/${organizationId}/activity/storage` : '/organizations';
  const backHref = fromState || fallbackBack;
  const backLabel = fromState ? '← Back' : organizationId ? '← Back to Storage' : '← Back';

  const volumeName = volume?.volumeName || volume?.volumeId || volume?.meta?.id || EMPTY_PLACEHOLDER;
  const volumeIdLabel = volume?.volumeId || volume?.meta?.id || EMPTY_PLACEHOLDER;
  const sizeLabel = volume?.sizeGb ? `${volume.sizeGb} GB` : EMPTY_PLACEHOLDER;
  const runnerId = volume?.runnerId || '';
  const agentId = volume?.agentId || '';
  const runnerLink = organizationId && runnerId ? `/organizations/${organizationId}/runners/${runnerId}` : '';
  const agentLink = organizationId && agentId ? `/organizations/${organizationId}/agents/${agentId}` : '';
  const threadLink = organizationId && volume?.threadId ? `/organizations/${organizationId}/threads/${volume.threadId}` : '';
  const attachments = volume?.attachments ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="link" asChild data-testid="volume-detail-back">
          <NavLink to={backHref}>{backLabel}</NavLink>
        </Button>
      </div>
      {volumeQuery.isPending ? <div className="text-sm text-muted-foreground">Loading volume...</div> : null}
      {showError ? <div className="text-sm text-muted-foreground">Failed to load volume.</div> : null}
      {showNotFound ? <div className="text-sm text-muted-foreground">Volume not found.</div> : null}
      {volume && !showNotFound ? (
        <div className="space-y-6">
          <Card className="border-border" data-testid="volume-detail-card">
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Details</h3>
                <p className="text-sm text-muted-foreground">Identifiers and storage status.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Name</div>
                  <div className="text-sm text-foreground">{volumeName}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Volume ID</div>
                  <div className="text-sm text-foreground">{volumeIdLabel}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Status</div>
                  <Badge variant={getStatusVariant(volume.status)}>{formatVolumeStatus(volume.status)}</Badge>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Size</div>
                  <div className="text-sm text-foreground">{sizeLabel}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Organization ID</div>
                  <div className="text-sm text-foreground">{volume.organizationId || EMPTY_PLACEHOLDER}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Runner</div>
                  <div className="text-sm text-foreground">
                    {runnerLink ? (
                      <NavLink to={runnerLink} className="hover:underline">
                        {runnerId || EMPTY_PLACEHOLDER}
                      </NavLink>
                    ) : (
                      runnerId || EMPTY_PLACEHOLDER
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Agent</div>
                  <div className="text-sm text-foreground">
                    {agentLink ? (
                      <NavLink to={agentLink} className="hover:underline">
                        {agentId || EMPTY_PLACEHOLDER}
                      </NavLink>
                    ) : (
                      agentId || EMPTY_PLACEHOLDER
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Thread</div>
                  <div className="text-sm text-foreground">
                    {threadLink ? (
                      <NavLink to={threadLink} className="hover:underline">
                        {truncate(volume.threadId, 18)}
                      </NavLink>
                    ) : (
                      truncate(volume.threadId, 18)
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Instance ID</div>
                  <div className="text-sm text-foreground">{volume.instanceId || EMPTY_PLACEHOLDER}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Created</div>
                  <div className="text-sm text-foreground">{formatTimestamp(volume.meta?.createdAt)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Removed</div>
                  <div className="text-sm text-foreground">{formatTimestamp(volume.removedAt)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Last Metering Sample</div>
                  <div className="text-sm text-foreground">{formatTimestamp(volume.lastMeteringSampledAt)}</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border" data-testid="volume-attachments-card">
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Attachments</h3>
                <p className="text-sm text-muted-foreground">Active attachment targets for this volume.</p>
              </div>
              {attachments.length === 0 ? (
                <div className="text-sm text-muted-foreground">No attachments reported.</div>
              ) : (
                <div className="space-y-3">
                  {attachments.map((attachment) => {
                    const label = formatAttachmentLabel(attachment);
                    return (
                      <div key={`${attachment.kind}-${attachment.id}`} className="text-sm text-foreground">
                        <div className="font-medium">{label}</div>
                        {attachment.id && attachment.id !== attachment.name ? (
                          <div className="text-xs text-muted-foreground">{attachment.id}</div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
