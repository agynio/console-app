import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { llmClient } from '@/api/client';
import { LLMMode, type Environment } from '@/gen/agynio/api/agents/v1/agents_pb';
import { Vendor } from '@/gen/agynio/api/llm/v1/llm_pb';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EMPTY_PLACEHOLDER } from '@/lib/format';

const PAGE_SIZE = 200;

function vendorLabel(vendor: Vendor): string {
  switch (vendor) {
    case Vendor.ANTHROPIC:
      return 'Anthropic';
    case Vendor.OPENAI:
      return 'OpenAI';
    default:
      return EMPTY_PLACEHOLDER;
  }
}

/**
 * A native-mode environment reaches a vendor through a subscription attached
 * here. Without one it cannot start a workload at all, so this is where that
 * gets fixed rather than somewhere the operator has to go find.
 */
export function EnvironmentSubscriptionsTab({ environment }: { environment: Environment }) {
  const queryClient = useQueryClient();
  const environmentId = environment.meta?.id ?? '';
  const organizationId = environment.organizationId;
  const [selected, setSelected] = useState('');

  const attachmentsQuery = useQuery({
    queryKey: ['environment-subscriptions', environmentId],
    queryFn: () =>
      llmClient.listSubscriptionAttachments({ organizationId, environmentId, pageSize: PAGE_SIZE }),
    enabled: Boolean(environmentId),
  });

  const subscriptionsQuery = useQuery({
    queryKey: ['llm', organizationId, 'subscriptions'],
    queryFn: () => llmClient.listSubscriptions({ organizationId, pageSize: PAGE_SIZE }),
    enabled: Boolean(organizationId),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['environment-subscriptions', environmentId] });
  };

  const attach = useMutation({
    mutationFn: (subscriptionId: string) =>
      llmClient.createSubscriptionAttachment({
        subscriptionId,
        target: { case: 'environmentId', value: environmentId },
      }),
    onSuccess: () => {
      invalidate();
      setSelected('');
      toast.success('Subscription attached.');
    },
    onError: (error) => {
      // Refused when the environment already has one for that vendor, and the
      // error names the existing one — which is what tells you to detach first.
      toast.error(error instanceof Error ? error.message : 'Failed to attach the subscription.');
    },
  });

  const detach = useMutation({
    mutationFn: (attachmentId: string) =>
      llmClient.deleteSubscriptionAttachment({ id: attachmentId }),
    onSuccess: () => {
      invalidate();
      toast.success('Subscription detached.');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to detach the subscription.');
    },
  });

  const attachments = attachmentsQuery.data?.subscriptionAttachments ?? [];
  const subscriptions = subscriptionsQuery.data?.subscriptions ?? [];
  const attachedIds = new Set(attachments.map((attachment) => attachment.subscriptionId));
  const attachable = subscriptions.filter((s) => !attachedIds.has(s.meta?.id ?? ''));
  const nameOf = (subscriptionId: string) =>
    subscriptions.find((s) => s.meta?.id === subscriptionId)?.name ?? subscriptionId;

  const isNative = environment.llmMode === LLMMode.LLM_MODE_NATIVE;

  return (
    <div className="space-y-4">
      {isNative && attachments.length === 0 && !attachmentsQuery.isPending ? (
        <Card className="border-border" data-testid="environment-subscriptions-missing">
          <CardContent className="py-4 text-sm text-foreground">
            This environment is in native LLM mode with nothing attached, so it cannot start a
            workload. Attach a subscription below.
          </CardContent>
        </Card>
      ) : null}

      {!isNative ? (
        <Card className="border-border" data-testid="environment-subscriptions-platform">
          <CardContent className="py-4 text-sm text-muted-foreground">
            This environment is in platform mode, where models come from the catalog. A subscription
            attached here takes effect if you switch it to native.
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="max-w-sm flex-1">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="w-full" data-testid="environment-subscriptions-select">
              <SelectValue placeholder="Choose a subscription" />
            </SelectTrigger>
            <SelectContent>
              {attachable.map((subscription) => (
                <SelectItem key={subscription.meta?.id} value={subscription.meta?.id ?? ''}>
                  {subscription.name} — {vendorLabel(subscription.vendor)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!selected || attach.isPending}
          onClick={() => attach.mutate(selected)}
          data-testid="environment-subscriptions-attach"
        >
          {attach.isPending ? 'Attaching…' : 'Attach'}
        </Button>
      </div>

      {attachments.length === 0 ? (
        <Card className="border-border" data-testid="environment-subscriptions-empty">
          <CardContent className="py-6 text-sm text-muted-foreground">
            No subscriptions attached.
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border" data-testid="environment-subscriptions-table">
          <CardContent className="px-0">
            <div className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[2fr_1fr_140px]">
              <span>Subscription</span>
              <span>Vendor</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-border">
              {attachments.map((attachment) => (
                <div
                  key={attachment.meta?.id}
                  className="grid items-center gap-2 px-6 py-4 text-sm text-foreground md:grid-cols-[2fr_1fr_140px]"
                  data-testid="environment-subscriptions-row"
                >
                  <span className="font-medium">{nameOf(attachment.subscriptionId)}</span>
                  <span className="text-xs text-muted-foreground">
                    {vendorLabel(attachment.vendor)}
                  </span>
                  <div className="flex items-center justify-end">
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={detach.isPending}
                      onClick={() => detach.mutate(attachment.meta?.id ?? '')}
                      data-testid="environment-subscriptions-detach"
                    >
                      Detach
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
