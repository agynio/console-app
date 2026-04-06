import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentsClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Volume, VolumeAttachment } from '@/gen/agynio/api/agents/v1/agents_pb';
import { formatDateOnly } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

type AgentVolumeAttachmentsTabProps = {
  agentId: string;
  organizationId: string;
};

export function AgentVolumeAttachmentsTab({ agentId, organizationId }: AgentVolumeAttachmentsTabProps) {
  const queryClient = useQueryClient();
  const [attachOpen, setAttachOpen] = useState(false);
  const [selectedVolumeId, setSelectedVolumeId] = useState('');
  const [selectedVolumeError, setSelectedVolumeError] = useState('');
  const [detachTargetId, setDetachTargetId] = useState<string | null>(null);

  const attachmentsQuery = useQuery({
    queryKey: ['volumeAttachments', agentId, 'list'],
    queryFn: () => agentsClient.listVolumeAttachments({ agentId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(agentId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const volumesQuery = useQuery({
    queryKey: ['volumes', organizationId, 'list'],
    queryFn: () => agentsClient.listVolumes({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const volumeMap = useMemo(() => {
    const volumes = volumesQuery.data?.volumes ?? [];
    return new Map(
      volumes.flatMap((volume) => {
        const volumeId = volume.meta?.id;
        return volumeId ? ([[volumeId, volume]] as const) : [];
      }),
    );
  }, [volumesQuery.data?.volumes]);

  const attachments = attachmentsQuery.data?.volumeAttachments ?? [];

  const createAttachmentMutation = useMutation({
    mutationFn: (payload: { volumeId: string; target: { case: 'agentId'; value: string } }) =>
      agentsClient.createVolumeAttachment(payload),
    onSuccess: () => {
      toast.success('Volume attached.');
      void queryClient.invalidateQueries({ queryKey: ['volumeAttachments', agentId, 'list'] });
      setAttachOpen(false);
      setSelectedVolumeId('');
      setSelectedVolumeError('');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to attach volume.');
    },
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: (attachmentId: string) => agentsClient.deleteVolumeAttachment({ id: attachmentId }),
    onSuccess: () => {
      toast.success('Volume detached.');
      void queryClient.invalidateQueries({ queryKey: ['volumeAttachments', agentId, 'list'] });
      setDetachTargetId(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to detach volume.');
    },
  });

  const handleAttach = () => {
    if (!selectedVolumeId) {
      setSelectedVolumeError('Select a volume to attach.');
      return;
    }
    createAttachmentMutation.mutate({
      volumeId: selectedVolumeId,
      target: { case: 'agentId', value: agentId },
    });
  };

  const handleDetachOpen = (attachment: VolumeAttachment) => {
    const attachmentId = attachment.meta?.id;
    if (!attachmentId) {
      toast.error('Missing volume attachment ID.');
      return;
    }
    setDetachTargetId(attachmentId);
  };

  const renderVolumeSummary = (attachment: VolumeAttachment, volumes: Map<string, Volume>) => {
    const volume = volumes.get(attachment.volumeId);
    const description = volume?.description || 'Volume';
    const mountPath = volume?.mountPath || '—';
    return (
      <div>
        <div className="font-medium" data-testid="agent-volume-attachment-description">
          {description}
        </div>
        <div className="text-xs text-muted-foreground" data-testid="agent-volume-attachment-mount">
          Mount: {mountPath}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground" data-testid="agent-volume-attachments-heading">
            Volumes
          </h3>
          <p className="text-sm text-muted-foreground">Attached storage volumes.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAttachOpen(true)}
          data-testid="agent-volume-attachments-attach"
        >
          Attach volume
        </Button>
      </div>
      {attachmentsQuery.isPending ? (
        <div className="text-sm text-muted-foreground">Loading volume attachments...</div>
      ) : null}
      {attachmentsQuery.isError ? (
        <div className="text-sm text-muted-foreground">Failed to load volume attachments.</div>
      ) : null}
      {attachments.length === 0 && !attachmentsQuery.isPending ? (
        <Card className="border-border" data-testid="agent-volume-attachments-empty">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No volumes attached.
          </CardContent>
        </Card>
      ) : null}
      {attachments.length > 0 ? (
        <Card className="border-border" data-testid="agent-volume-attachments-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[2fr_1fr_120px]"
              data-testid="agent-volume-attachments-header"
            >
              <span>Volume</span>
              <span>Created</span>
              <span className="text-right">Action</span>
            </div>
            <div className="divide-y divide-border">
              {attachments.map((attachment) => (
                <div
                  key={attachment.meta?.id ?? attachment.volumeId}
                  className="grid items-center gap-2 px-6 py-4 text-sm text-foreground md:grid-cols-[2fr_1fr_120px]"
                  data-testid="agent-volume-attachment-row"
                >
                  {renderVolumeSummary(attachment, volumeMap)}
                  <span className="text-xs text-muted-foreground" data-testid="agent-volume-attachment-created">
                    {formatDateOnly(attachment.meta?.createdAt)}
                  </span>
                  <div className="text-right">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDetachOpen(attachment)}
                      data-testid="agent-volume-attachment-detach"
                    >
                      Detach
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
      <Dialog open={attachOpen} onOpenChange={setAttachOpen}>
        <DialogContent data-testid="agent-volume-attachments-attach-dialog">
          <DialogHeader>
            <DialogTitle data-testid="agent-volume-attachments-attach-title">Attach volume</DialogTitle>
            <DialogDescription data-testid="agent-volume-attachments-attach-description">
              Select a volume to attach to this agent.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="agent-volume-attachments-attach-select">Volume</Label>
            <Select
              value={selectedVolumeId}
              onValueChange={(value) => {
                setSelectedVolumeId(value);
                if (selectedVolumeError) setSelectedVolumeError('');
              }}
            >
              <SelectTrigger
                id="agent-volume-attachments-attach-select"
                data-testid="agent-volume-attachments-attach-select"
              >
                <SelectValue placeholder="Select volume" />
              </SelectTrigger>
              <SelectContent>
                {(volumesQuery.data?.volumes ?? []).map((volume) => {
                  const volumeId = volume.meta?.id;
                  if (!volumeId) return null;
                  return (
                    <SelectItem key={volumeId} value={volumeId}>
                      {volume.description || volume.mountPath || 'Volume'}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {selectedVolumeError ? <p className="text-sm text-destructive">{selectedVolumeError}</p> : null}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="agent-volume-attachments-attach-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={handleAttach}
              disabled={createAttachmentMutation.isPending}
              data-testid="agent-volume-attachments-attach-submit"
            >
              {createAttachmentMutation.isPending ? 'Attaching...' : 'Attach volume'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(detachTargetId)}
        onOpenChange={(open) => {
          if (!open) {
            setDetachTargetId(null);
          }
        }}
        title="Detach volume"
        description="This will remove the volume from the agent."
        confirmLabel="Detach volume"
        variant="danger"
        onConfirm={() => {
          if (detachTargetId) {
            deleteAttachmentMutation.mutate(detachTargetId);
          }
        }}
        isPending={deleteAttachmentMutation.isPending}
      />
    </div>
  );
}
