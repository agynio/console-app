import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { egressClient } from '@/api/client';
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
import type { EgressRule, EgressRuleAttachment } from '@/gen/agynio/api/egress/v1/egress_pb';
import { useListControls } from '@/hooks/useListControls';
import { formatDateOnly, timestampToMillis } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

type AgentEgressRuleAttachmentsTabProps = {
  agentId: string;
  organizationId: string;
};

export function AgentEgressRuleAttachmentsTab({ agentId, organizationId }: AgentEgressRuleAttachmentsTabProps) {
  const queryClient = useQueryClient();
  const [attachOpen, setAttachOpen] = useState(false);
  const [selectedRuleId, setSelectedRuleId] = useState('');
  const [selectedRuleError, setSelectedRuleError] = useState('');
  const [detachTargetId, setDetachTargetId] = useState<string | null>(null);

  const attachmentsQuery = useQuery({
    queryKey: ['egressRuleAttachments', organizationId, agentId, 'list'],
    queryFn: () => egressClient.listEgressRuleAttachments({ organizationId, agentId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId && agentId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const rulesQuery = useQuery({
    queryKey: ['egressRules', organizationId, 'list'],
    queryFn: () => egressClient.listEgressRules({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const ruleMap = useMemo(() => {
    const rules = rulesQuery.data?.egressRules ?? [];
    return new Map(
      rules.flatMap((rule) => {
        const ruleId = rule.meta?.id;
        return ruleId ? ([[ruleId, rule]] as const) : [];
      }),
    );
  }, [rulesQuery.data?.egressRules]);

  const attachments = attachmentsQuery.data?.egressRuleAttachments ?? [];
  const attachedRuleIds = new Set(attachments.map((attachment) => attachment.ruleId));
  const availableRules = (rulesQuery.data?.egressRules ?? []).filter((rule) => {
    const ruleId = rule.meta?.id;
    return ruleId ? !attachedRuleIds.has(ruleId) : false;
  });

  const getRuleName = (attachment: EgressRuleAttachment) => ruleMap.get(attachment.ruleId)?.name || attachment.ruleId;
  const getRuleDomain = (attachment: EgressRuleAttachment) => ruleMap.get(attachment.ruleId)?.matcher?.domainPattern || '';
  const listControls = useListControls({
    items: attachments,
    searchFields: [
      (attachment) => getRuleName(attachment),
      (attachment) => getRuleDomain(attachment),
      (attachment) => attachment.ruleId,
      (attachment) => formatDateOnly(attachment.meta?.createdAt),
    ],
    sortOptions: {
      rule: (attachment) => getRuleName(attachment),
      domain: (attachment) => getRuleDomain(attachment),
      created: (attachment) => timestampToMillis(attachment.meta?.createdAt),
    },
    defaultSortKey: 'rule',
  });

  const invalidateAttachments = () => {
    void queryClient.invalidateQueries({ queryKey: ['egressRuleAttachments', organizationId, agentId, 'list'] });
  };

  const createAttachmentMutation = useMutation({
    mutationFn: (ruleId: string) => egressClient.createEgressRuleAttachment({ ruleId, agentId }),
    onSuccess: () => {
      toast.success('Egress rule attached.');
      invalidateAttachments();
      setAttachOpen(false);
      setSelectedRuleId('');
      setSelectedRuleError('');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to attach egress rule.');
    },
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: (attachmentId: string) => egressClient.deleteEgressRuleAttachment({ id: attachmentId }),
    onSuccess: () => {
      toast.success('Egress rule detached.');
      invalidateAttachments();
      setDetachTargetId(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to detach egress rule.');
    },
  });

  const handleAttach = () => {
    if (!selectedRuleId) {
      setSelectedRuleError('Select an egress rule to attach.');
      return;
    }
    createAttachmentMutation.mutate(selectedRuleId);
  };

  const handleDetachOpen = (attachment: EgressRuleAttachment) => {
    const attachmentId = attachment.meta?.id;
    if (!attachmentId) {
      toast.error('Missing egress rule attachment ID.');
      return;
    }
    setDetachTargetId(attachmentId);
  };

  const renderRuleSummary = (attachment: EgressRuleAttachment, rules: Map<string, EgressRule>) => {
    const rule = rules.get(attachment.ruleId);
    return (
      <div>
        <div className="font-medium" data-testid="agent-egress-rule-attachment-name">
          {rule?.name || attachment.ruleId}
        </div>
        <div className="text-xs text-muted-foreground" data-testid="agent-egress-rule-attachment-domain">
          Domain: {rule?.matcher?.domainPattern || '-'}
        </div>
      </div>
    );
  };

  const visibleAttachments = listControls.filteredItems;
  const hasSearch = listControls.searchTerm.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground" data-testid="agent-egress-rule-attachments-heading">
            Egress Rules
          </h3>
          <p className="text-sm text-muted-foreground">Outbound traffic policies attached to this agent.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAttachOpen(true)}
          data-testid="agent-egress-rule-attachments-attach"
        >
          Attach egress rule
        </Button>
      </div>
      <div className="max-w-sm">
        <Input
          placeholder="Search egress rule attachments..."
          value={listControls.searchTerm}
          onChange={(event) => listControls.setSearchTerm(event.target.value)}
          data-testid="list-search"
        />
      </div>
      {attachmentsQuery.isPending ? (
        <div className="text-sm text-muted-foreground">Loading egress rule attachments...</div>
      ) : null}
      {attachmentsQuery.isError ? (
        <div className="text-sm text-muted-foreground">Failed to load egress rule attachments.</div>
      ) : null}
      {attachments.length === 0 && !attachmentsQuery.isPending ? (
        <Card className="border-border" data-testid="agent-egress-rule-attachments-empty">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No egress rules attached.
          </CardContent>
        </Card>
      ) : null}
      {attachments.length > 0 ? (
        <Card className="border-border" data-testid="agent-egress-rule-attachments-table">
          <CardContent className="px-0">
            <div className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[2fr_1fr_1fr_120px]">
              <SortableHeader label="Rule" sortKey="rule" activeSortKey={listControls.sortKey} sortDirection={listControls.sortDirection} onSort={listControls.handleSort} />
              <SortableHeader label="Domain" sortKey="domain" activeSortKey={listControls.sortKey} sortDirection={listControls.sortDirection} onSort={listControls.handleSort} />
              <SortableHeader label="Created" sortKey="created" activeSortKey={listControls.sortKey} sortDirection={listControls.sortDirection} onSort={listControls.handleSort} />
              <span className="text-right">Action</span>
            </div>
            <div className="divide-y divide-border">
              {visibleAttachments.length === 0 ? (
                <div className="px-6 py-6 text-sm text-muted-foreground">
                  {hasSearch ? 'No results found.' : 'No egress rules attached.'}
                </div>
              ) : (
                visibleAttachments.map((attachment) => (
                  <div key={attachment.meta?.id ?? attachment.ruleId} className="grid items-center gap-2 px-6 py-4 text-sm text-foreground md:grid-cols-[2fr_1fr_1fr_120px]" data-testid="agent-egress-rule-attachment-row">
                    {renderRuleSummary(attachment, ruleMap)}
                    <span className="text-xs text-muted-foreground">{getRuleDomain(attachment) || '-'}</span>
                    <span className="text-xs text-muted-foreground" data-testid="agent-egress-rule-attachment-created">
                      {formatDateOnly(attachment.meta?.createdAt)}
                    </span>
                    <div className="text-right">
                      <Button variant="destructive" size="sm" onClick={() => handleDetachOpen(attachment)} data-testid="agent-egress-rule-attachment-detach">
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
        <DialogContent data-testid="agent-egress-rule-attachments-attach-dialog">
          <DialogHeader>
            <DialogTitle data-testid="agent-egress-rule-attachments-attach-title">Attach egress rule</DialogTitle>
            <DialogDescription data-testid="agent-egress-rule-attachments-attach-description">
              Select an egress rule to attach to this agent.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="agent-egress-rule-attachments-attach-select">Egress rule</Label>
            <Select
              value={selectedRuleId}
              onValueChange={(value) => {
                setSelectedRuleId(value);
                if (selectedRuleError) setSelectedRuleError('');
              }}
            >
              <SelectTrigger id="agent-egress-rule-attachments-attach-select" data-testid="agent-egress-rule-attachments-attach-select">
                <SelectValue placeholder="Select egress rule" />
              </SelectTrigger>
              <SelectContent>
                {availableRules.map((rule) => {
                  const ruleId = rule.meta?.id;
                  if (!ruleId) return null;
                  return (
                    <SelectItem key={ruleId} value={ruleId}>
                      {rule.name} ({rule.matcher?.domainPattern || 'no domain'})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {selectedRuleError ? <p className="text-sm text-destructive">{selectedRuleError}</p> : null}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="agent-egress-rule-attachments-attach-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button size="sm" onClick={handleAttach} disabled={createAttachmentMutation.isPending} data-testid="agent-egress-rule-attachments-attach-submit">
              {createAttachmentMutation.isPending ? 'Attaching...' : 'Attach egress rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(detachTargetId)}
        onOpenChange={(open) => {
          if (!open) setDetachTargetId(null);
        }}
        title="Detach egress rule"
        description="This will remove the egress rule from the agent."
        confirmLabel="Detach egress rule"
        variant="danger"
        onConfirm={() => {
          if (detachTargetId) deleteAttachmentMutation.mutate(detachTargetId);
        }}
        isPending={deleteAttachmentMutation.isPending}
      />
    </div>
  );
}
