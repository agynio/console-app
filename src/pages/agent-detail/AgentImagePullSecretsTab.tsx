import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentsClient, secretsClient } from '@/api/client';
import { SortableHeader } from '@/components/SortableHeader';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ImagePullSecretAttachment } from '@/gen/agynio/api/agents/v1/agents_pb';
import type { ImagePullSecret } from '@/gen/agynio/api/secrets/v1/secrets_pb';
import { useListControls } from '@/hooks/useListControls';
import { formatDateOnly, timestampToMillis } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

type AgentImagePullSecretsTabProps = {
  agentId: string;
  organizationId: string;
};

export function AgentImagePullSecretsTab({ agentId, organizationId }: AgentImagePullSecretsTabProps) {
  const queryClient = useQueryClient();
  const [attachOpen, setAttachOpen] = useState(false);
  const [selectedSecretId, setSelectedSecretId] = useState('');
  const [selectedSecretError, setSelectedSecretError] = useState('');
  const [detachTargetId, setDetachTargetId] = useState<string | null>(null);

  const attachmentsQuery = useQuery({
    queryKey: ['imagePullSecretAttachments', agentId, 'list'],
    queryFn: () =>
      agentsClient.listImagePullSecretAttachments({
        pageSize: MAX_PAGE_SIZE,
        pageToken: '',
        imagePullSecretId: '',
        agentId,
        mcpId: '',
        hookId: '',
      }),
    enabled: Boolean(agentId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const imagePullSecretsQuery = useQuery({
    queryKey: ['imagePullSecrets', organizationId, 'list'],
    queryFn: () => secretsClient.listImagePullSecrets({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const secretMap = useMemo(() => {
    const secrets = imagePullSecretsQuery.data?.imagePullSecrets ?? [];
    return new Map(
      secrets.flatMap((secret) => {
        const secretId = secret.meta?.id;
        return secretId ? ([[secretId, secret]] as const) : [];
      }),
    );
  }, [imagePullSecretsQuery.data?.imagePullSecrets]);

  const attachments = attachmentsQuery.data?.imagePullSecretAttachments ?? [];
  const getSecretRegistry = (attachment: ImagePullSecretAttachment) =>
    secretMap.get(attachment.imagePullSecretId)?.registry || 'Registry';
  const getSecretUsername = (attachment: ImagePullSecretAttachment) =>
    secretMap.get(attachment.imagePullSecretId)?.username || '';
  const getSecretDescription = (attachment: ImagePullSecretAttachment) =>
    secretMap.get(attachment.imagePullSecretId)?.description || 'Image pull secret';

  const listControls = useListControls({
    items: attachments,
    searchFields: [
      (attachment) => getSecretRegistry(attachment),
      (attachment) => getSecretUsername(attachment),
      (attachment) => getSecretDescription(attachment),
      (attachment) => attachment.imagePullSecretId,
      (attachment) => formatDateOnly(attachment.meta?.createdAt),
    ],
    sortOptions: {
      registry: (attachment) => getSecretRegistry(attachment),
      username: (attachment) => getSecretUsername(attachment),
      created: (attachment) => timestampToMillis(attachment.meta?.createdAt),
    },
    defaultSortKey: 'registry',
  });

  const visibleAttachments = listControls.filteredItems;
  const hasSearch = listControls.searchTerm.trim().length > 0;

  const createAttachmentMutation = useMutation({
    mutationFn: (payload: { imagePullSecretId: string; target: { case: 'agentId'; value: string } }) =>
      agentsClient.createImagePullSecretAttachment(payload),
    onSuccess: () => {
      toast.success('Image pull secret attached.');
      void queryClient.invalidateQueries({ queryKey: ['imagePullSecretAttachments', agentId, 'list'] });
      setAttachOpen(false);
      setSelectedSecretId('');
      setSelectedSecretError('');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to attach image pull secret.');
    },
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: (attachmentId: string) => agentsClient.deleteImagePullSecretAttachment({ id: attachmentId }),
    onSuccess: () => {
      toast.success('Image pull secret detached.');
      void queryClient.invalidateQueries({ queryKey: ['imagePullSecretAttachments', agentId, 'list'] });
      setDetachTargetId(null);
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
    createAttachmentMutation.mutate({
      imagePullSecretId: selectedSecretId,
      target: { case: 'agentId', value: agentId },
    });
  };

  const handleDetachOpen = (attachment: ImagePullSecretAttachment) => {
    const attachmentId = attachment.meta?.id;
    if (!attachmentId) {
      toast.error('Missing attachment ID.');
      return;
    }
    setDetachTargetId(attachmentId);
  };

  const renderSecretSummary = (attachment: ImagePullSecretAttachment, secrets: Map<string, ImagePullSecret>) => {
    const secret = secrets.get(attachment.imagePullSecretId);
    const registry = secret?.registry || 'Registry';
    const description = secret?.description || 'Image pull secret';
    return (
      <div>
        <div className="font-medium" data-testid="agent-image-pull-secret-registry">
          {registry}
        </div>
        <div className="text-xs text-muted-foreground" data-testid="agent-image-pull-secret-description">
          {description}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground" data-testid="agent-image-pull-secrets-heading">
            Image Pull Secrets
          </h3>
          <p className="text-sm text-muted-foreground">Attach registry credentials to this agent.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAttachOpen(true)}
          data-testid="agent-image-pull-secrets-attach"
        >
          Attach secret
        </Button>
      </div>
      <div className="max-w-sm">
        <Input
          placeholder="Search image pull secrets..."
          value={listControls.searchTerm}
          onChange={(event) => listControls.setSearchTerm(event.target.value)}
          data-testid="list-search"
        />
      </div>
      {attachmentsQuery.isPending ? (
        <div className="text-sm text-muted-foreground">Loading image pull secrets...</div>
      ) : null}
      {attachmentsQuery.isError ? (
        <div className="text-sm text-muted-foreground">Failed to load image pull secrets.</div>
      ) : null}
      {attachments.length === 0 && !attachmentsQuery.isPending ? (
        <Card className="border-border" data-testid="agent-image-pull-secrets-empty">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No image pull secrets attached.
          </CardContent>
        </Card>
      ) : null}
      {attachments.length > 0 ? (
        <Card className="border-border" data-testid="agent-image-pull-secrets-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[2fr_1fr_1fr_120px]"
              data-testid="agent-image-pull-secrets-header"
            >
              <SortableHeader
                label="Registry"
                sortKey="registry"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Username"
                sortKey="username"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Created"
                sortKey="created"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <span className="text-right">Action</span>
            </div>
            <div className="divide-y divide-border">
              {visibleAttachments.length === 0 ? (
                <div className="px-6 py-6 text-sm text-muted-foreground">
                  {hasSearch ? 'No results found.' : 'No image pull secrets attached.'}
                </div>
              ) : (
                visibleAttachments.map((attachment) => (
                  <div
                    key={attachment.meta?.id ?? attachment.imagePullSecretId}
                    className="grid items-center gap-2 px-6 py-4 text-sm text-foreground md:grid-cols-[2fr_1fr_1fr_120px]"
                    data-testid="agent-image-pull-secret-row"
                  >
                    {renderSecretSummary(attachment, secretMap)}
                    <span className="text-xs text-muted-foreground" data-testid="agent-image-pull-secret-username">
                      {getSecretUsername(attachment) || '—'}
                    </span>
                    <span className="text-xs text-muted-foreground" data-testid="agent-image-pull-secret-created">
                      {formatDateOnly(attachment.meta?.createdAt)}
                    </span>
                    <div className="text-right">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDetachOpen(attachment)}
                        data-testid="agent-image-pull-secret-detach"
                      >
                        Detach
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}
      <Dialog open={attachOpen} onOpenChange={setAttachOpen}>
        <DialogContent data-testid="agent-image-pull-secrets-attach-dialog">
          <DialogHeader>
            <DialogTitle data-testid="agent-image-pull-secrets-attach-title">Attach secret</DialogTitle>
            <DialogDescription data-testid="agent-image-pull-secrets-attach-description">
              Select an image pull secret to attach.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="agent-image-pull-secrets-attach-select">Image Pull Secret</Label>
            <Select
              value={selectedSecretId}
              onValueChange={(value) => {
                setSelectedSecretId(value);
                if (selectedSecretError) setSelectedSecretError('');
              }}
            >
              <SelectTrigger
                id="agent-image-pull-secrets-attach-select"
                data-testid="agent-image-pull-secrets-attach-select"
              >
                <SelectValue placeholder="Select secret" />
              </SelectTrigger>
              <SelectContent>
                {(imagePullSecretsQuery.data?.imagePullSecrets ?? []).map((secret) => {
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
            {selectedSecretError ? (
              <p className="text-sm text-destructive" data-testid="agent-image-pull-secrets-attach-error">
                {selectedSecretError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="agent-image-pull-secrets-attach-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={handleAttach}
              disabled={createAttachmentMutation.isPending}
              data-testid="agent-image-pull-secrets-attach-submit"
            >
              {createAttachmentMutation.isPending ? 'Attaching...' : 'Attach secret'}
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
        title="Detach secret"
        description="This will remove the secret from the agent."
        confirmLabel="Detach secret"
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
