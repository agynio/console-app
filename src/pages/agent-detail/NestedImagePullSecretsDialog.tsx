import { useEffect, useMemo, useState } from 'react';
import { Code, ConnectError } from '@connectrpc/connect';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentsClient, secretsClient } from '@/api/client';
import { Button } from '@/components/ui/button';
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
import type { ImagePullSecretAttachment } from '@/gen/agynio/api/agents/v1/agents_pb';
import type { ImagePullSecret } from '@/gen/agynio/api/secrets/v1/secrets_pb';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

const EMPTY_ATTACHMENTS: ImagePullSecretAttachment[] = [];
const EMPTY_SECRETS: ImagePullSecret[] = [];

type NestedImagePullSecretsDialogProps = {
  targetCase: 'mcpId' | 'hookId';
  targetId: string | null;
  organizationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
};

export function NestedImagePullSecretsDialog({
  targetCase,
  targetId,
  organizationId,
  open,
  onOpenChange,
  title = 'Image Pull Secrets',
  description = 'Manage image pull secrets.',
}: NestedImagePullSecretsDialogProps) {
  const queryClient = useQueryClient();
  const [selectedSecretId, setSelectedSecretId] = useState('');
  const [selectedSecretError, setSelectedSecretError] = useState('');

  useEffect(() => {
    if (!open) return;
    setSelectedSecretId('');
    setSelectedSecretError('');
  }, [open, targetId]);

  const attachmentsQuery = useQuery({
    queryKey: ['imagePullSecretAttachments', targetCase, targetId, 'list'],
    queryFn: () => {
      if (!targetId) {
        return Promise.reject(new Error('Missing target ID.'));
      }
      return targetCase === 'mcpId'
        ? agentsClient.listImagePullSecretAttachments({ mcpId: targetId, pageSize: MAX_PAGE_SIZE, pageToken: '' })
        : agentsClient.listImagePullSecretAttachments({ hookId: targetId, pageSize: MAX_PAGE_SIZE, pageToken: '' });
    },
    enabled: Boolean(targetId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const imagePullSecretsQuery = useQuery({
    queryKey: ['imagePullSecrets', organizationId, 'list', 'all'],
    queryFn: () => secretsClient.listImagePullSecrets({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const attachments = attachmentsQuery.data?.imagePullSecretAttachments ?? EMPTY_ATTACHMENTS;
  const secrets = imagePullSecretsQuery.data?.imagePullSecrets ?? EMPTY_SECRETS;

  const secretMap = useMemo(() => {
    return new Map(
      secrets.flatMap((secret) => {
        const secretId = secret.meta?.id;
        return secretId ? ([[secretId, secret]] as const) : [];
      }),
    );
  }, [secrets]);

  const attachedSecretIds = useMemo(() => {
    return new Set(attachments.map((attachment) => attachment.imagePullSecretId));
  }, [attachments]);

  const availableSecrets = useMemo(() => {
    return secrets.filter((secret) => {
      const secretId = secret.meta?.id;
      if (!secretId) return false;
      return !attachedSecretIds.has(secretId);
    });
  }, [secrets, attachedSecretIds]);

  const createAttachmentMutation = useMutation({
    mutationFn: (payload: {
      imagePullSecretId: string;
      target: { case: 'mcpId'; value: string } | { case: 'hookId'; value: string };
    }) => agentsClient.createImagePullSecretAttachment(payload),
    onSuccess: () => {
      toast.success('Image pull secret attached.');
      if (targetId) {
        void queryClient.invalidateQueries({ queryKey: ['imagePullSecretAttachments', targetCase, targetId, 'list'] });
      }
      setSelectedSecretId('');
      setSelectedSecretError('');
    },
    onError: (error) => {
      if (error instanceof ConnectError && error.code === Code.AlreadyExists) {
        toast.error('Image pull secret already attached.');
        return;
      }
      toast.error(error instanceof Error ? error.message : 'Failed to attach image pull secret.');
    },
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: (attachmentId: string) => agentsClient.deleteImagePullSecretAttachment({ id: attachmentId }),
    onSuccess: () => {
      toast.success('Image pull secret detached.');
      if (targetId) {
        void queryClient.invalidateQueries({ queryKey: ['imagePullSecretAttachments', targetCase, targetId, 'list'] });
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to detach image pull secret.');
    },
  });

  const handleAttach = () => {
    if (!selectedSecretId) {
      setSelectedSecretError('Select a secret to attach.');
      return;
    }
    if (!targetId) {
      toast.error('Missing target ID.');
      return;
    }
    const target =
      targetCase === 'mcpId'
        ? ({ case: 'mcpId', value: targetId } as const)
        : ({ case: 'hookId', value: targetId } as const);

    createAttachmentMutation.mutate({ imagePullSecretId: selectedSecretId, target });
  };

  const handleDetach = (attachment: ImagePullSecretAttachment) => {
    const attachmentId = attachment.meta?.id;
    if (!attachmentId) {
      toast.error('Missing attachment ID.');
      return;
    }
    deleteAttachmentMutation.mutate(attachmentId);
  };

  const renderAttachmentLabel = (attachment: ImagePullSecretAttachment, map: Map<string, ImagePullSecret>) => {
    const secret = map.get(attachment.imagePullSecretId);
    const registry = secret?.registry || 'Registry';
    const username = secret?.username || '';
    const description = secret?.description || 'Image pull secret';
    return (
      <div>
        <div className="text-sm text-foreground">
          {registry}
          {username ? ` (${username})` : ''}
        </div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
    );
  };

  const noSecretsAvailable = !imagePullSecretsQuery.isPending && secrets.length === 0;
  const allSecretsAttached = !imagePullSecretsQuery.isPending && secrets.length > 0 && availableSecrets.length === 0;
  const attachDisabled =
    createAttachmentMutation.isPending || imagePullSecretsQuery.isPending || noSecretsAvailable || allSecretsAttached;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="nested-image-pull-secrets-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nested-image-pull-secrets-select">Image Pull Secret</Label>
            <Select
              value={selectedSecretId}
              onValueChange={(value) => {
                setSelectedSecretId(value);
                if (selectedSecretError) setSelectedSecretError('');
              }}
            >
            <SelectTrigger id="nested-image-pull-secrets-select" data-testid="nested-image-pull-secrets-select">
              <SelectValue placeholder="Select secret" />
            </SelectTrigger>
            <SelectContent>
                {availableSecrets.map((secret) => {
                  const secretId = secret.meta?.id;
                  if (!secretId) return null;
                  return (
                    <SelectItem key={secretId} value={secretId}>
                      {secret.registry} ({secret.username})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {imagePullSecretsQuery.isPending ? (
              <div className="text-xs text-muted-foreground">Loading image pull secrets...</div>
            ) : null}
            {imagePullSecretsQuery.isError ? (
              <div className="text-xs text-muted-foreground">Failed to load image pull secrets.</div>
            ) : null}
            {noSecretsAvailable ? (
              <div className="text-xs text-muted-foreground">No image pull secrets available.</div>
            ) : null}
            {allSecretsAttached ? <div className="text-xs text-muted-foreground">All secrets attached.</div> : null}
            {selectedSecretError ? <p className="text-sm text-destructive">{selectedSecretError}</p> : null}
            <Button
              variant="outline"
              size="sm"
              onClick={handleAttach}
              disabled={attachDisabled}
              data-testid="nested-image-pull-secrets-attach"
            >
              {createAttachmentMutation.isPending ? 'Attaching...' : 'Attach secret'}
            </Button>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">Attached secrets</div>
            {attachmentsQuery.isPending ? (
              <div className="text-xs text-muted-foreground">Loading image pull secrets...</div>
            ) : null}
            {attachmentsQuery.isError ? (
              <div className="text-xs text-muted-foreground">Failed to load image pull secrets.</div>
            ) : null}
            {attachments.length === 0 && !attachmentsQuery.isPending ? (
              <div className="text-xs text-muted-foreground">No image pull secrets attached.</div>
            ) : null}
            {attachments.length > 0 ? (
              <div className="divide-y divide-border rounded-md border border-border">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.meta?.id ?? attachment.imagePullSecretId}
                    className="flex items-center justify-between px-3 py-2"
                    data-testid="nested-image-pull-secret-row"
                  >
                    {renderAttachmentLabel(attachment, secretMap)}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDetach(attachment)}
                      disabled={deleteAttachmentMutation.isPending}
                      data-testid="nested-image-pull-secret-detach"
                    >
                      Detach
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
