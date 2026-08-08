import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { llmClient, secretsClient } from '@/api/client';
import { Vendor } from '@/gen/agynio/api/llm/v1/llm_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EMPTY_PLACEHOLDER } from '@/lib/format';

const PAGE_SIZE = 200;

// Codex is declared but not shippable: its subscription credential lives in a
// file rather than an environment variable, so no placeholder can be delivered
// to a workload. CreateSubscription refuses it, and offering it here would only
// surface that refusal as a failed form.
const VENDOR_OPTIONS = [{ value: Vendor.CLAUDE, label: 'Claude' }] as const;

function vendorLabel(vendor: Vendor): string {
  switch (vendor) {
    case Vendor.CLAUDE:
      return 'Claude';
    case Vendor.CODEX:
      return 'Codex';
    default:
      return EMPTY_PLACEHOLDER;
  }
}

/**
 * A subscription is an organization's own plan with an agent CLI vendor, held
 * as a reference to a secret. Nothing here reads or shows the token: it is
 * resolved by the LLM Proxy at connection time and never leaves the platform.
 */
export function OrganizationSubscriptionsTab() {
  useDocumentTitle('Subscriptions');

  const { id } = useParams();
  const organizationId = id ?? '';
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [vendor, setVendor] = useState<Vendor>(Vendor.CLAUDE);
  const [secretId, setSecretId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [errors, setErrors] = useState<{ name?: string; secretId?: string }>({});
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['llm', organizationId, 'subscriptions'],
    queryFn: () => llmClient.listSubscriptions({ organizationId, pageSize: PAGE_SIZE }),
    enabled: Boolean(organizationId),
  });

  const { data: attachmentData } = useQuery({
    queryKey: ['llm', organizationId, 'subscription-attachments'],
    queryFn: () => llmClient.listSubscriptionAttachments({ organizationId, pageSize: PAGE_SIZE }),
    enabled: Boolean(organizationId),
  });

  // A subscription only ever references a secret, so the picker lists what the
  // organization already holds rather than accepting a token here.
  const { data: secretData } = useQuery({
    queryKey: ['secrets', organizationId, 'for-subscriptions'],
    queryFn: () => secretsClient.listSecrets({ organizationId, pageSize: PAGE_SIZE }),
    enabled: createOpen && Boolean(organizationId),
  });

  const resetForm = () => {
    setName('');
    setVendor(Vendor.CLAUDE);
    setSecretId('');
    setAccountId('');
    setErrors({});
  };

  const createSubscription = useMutation({
    mutationFn: () =>
      llmClient.createSubscription({
        organizationId,
        name: name.trim(),
        vendor,
        secretId,
        accountId: accountId.trim(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['llm', organizationId, 'subscriptions'] });
      toast.success('Subscription created.');
      setCreateOpen(false);
      resetForm();
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error ? mutationError.message : 'Failed to create the subscription.',
      );
    },
  });

  const deleteSubscription = useMutation({
    mutationFn: (subscriptionId: string) => llmClient.deleteSubscription({ id: subscriptionId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['llm', organizationId, 'subscriptions'] });
      toast.success('Subscription deleted.');
      setPendingDelete(null);
    },
    onError: (mutationError) => {
      // Refused while attached, and the error names the targets — surfacing it
      // verbatim is what tells an operator which ones to detach.
      toast.error(
        mutationError instanceof Error ? mutationError.message : 'Failed to delete the subscription.',
      );
    },
  });

  const handleCreate = () => {
    const nextErrors: { name?: string; secretId?: string } = {};
    if (!name.trim()) nextErrors.name = 'Name is required.';
    if (!secretId) nextErrors.secretId = 'A secret holding the token is required.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    createSubscription.mutate();
  };

  const subscriptions = data?.subscriptions ?? [];
  const attachments = attachmentData?.subscriptionAttachments ?? [];
  const secrets = secretData?.secrets ?? [];

  const attachmentCount = (subscriptionId: string) =>
    attachments.filter((attachment) => attachment.subscriptionId === subscriptionId).length;

  return (
    <div className="space-y-4" data-testid="organization-subscriptions">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          An organization's own plan with an agent CLI vendor. Attach one to an environment and its
          workloads reach that vendor on it — the token is injected in flight and never enters the
          container.
        </p>
        <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="subscriptions-create">
          New subscription
        </Button>
      </div>

      {isLoading ? (
        <Card className="border-border" data-testid="subscriptions-loading">
          <CardContent className="py-6 text-sm text-muted-foreground">
            Loading subscriptions…
          </CardContent>
        </Card>
      ) : error ? (
        <Card className="border-border" data-testid="subscriptions-error">
          <CardContent className="py-6 text-sm text-destructive">
            Unable to load subscriptions.
          </CardContent>
        </Card>
      ) : subscriptions.length === 0 ? (
        <Card className="border-border" data-testid="subscriptions-empty">
          <CardContent className="space-y-2 py-6">
            <p className="text-sm text-foreground">No subscriptions yet.</p>
            <p className="text-sm text-muted-foreground">
              An environment in native LLM mode cannot start a workload until one is attached.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border" data-testid="subscriptions-table">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Secret</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Attached to</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptions.map((subscription) => {
                  const subscriptionId = subscription.meta?.id ?? '';
                  const count = attachmentCount(subscriptionId);
                  return (
                    <TableRow key={subscriptionId} data-testid="subscriptions-row">
                      <TableCell className="font-medium text-foreground">
                        {subscription.name || EMPTY_PLACEHOLDER}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {vendorLabel(subscription.vendor)}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {subscription.secretId || EMPTY_PLACEHOLDER}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {subscription.accountId || EMPTY_PLACEHOLDER}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {count === 0 ? 'Nothing' : `${count} target${count === 1 ? '' : 's'}`}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setPendingDelete({ id: subscriptionId, name: subscription.name })
                          }
                          data-testid="subscriptions-delete"
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) resetForm();
          setCreateOpen(open);
        }}
      >
        <DialogContent data-testid="subscriptions-create-dialog">
          <DialogHeader>
            <DialogTitle>New subscription</DialogTitle>
            <DialogDescription>
              The token is held by reference to a secret. Nothing here reads it, and no view ever
              shows it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="subscription-name">Name</Label>
              <Input
                id="subscription-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Team Claude plan"
                data-testid="subscriptions-create-name"
              />
              {errors.name ? <p className="text-sm text-destructive">{errors.name}</p> : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="subscription-vendor">Vendor</Label>
              <Select
                value={String(vendor)}
                onValueChange={(value) => setVendor(Number(value) as Vendor)}
              >
                <SelectTrigger id="subscription-vendor" data-testid="subscriptions-create-vendor">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VENDOR_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={String(option.value)}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subscription-secret">Secret</Label>
              <Select value={secretId} onValueChange={setSecretId}>
                <SelectTrigger id="subscription-secret" data-testid="subscriptions-create-secret">
                  <SelectValue placeholder="Choose a secret holding the token" />
                </SelectTrigger>
                <SelectContent>
                  {secrets.map((secret) => (
                    <SelectItem key={secret.meta?.id} value={secret.meta?.id ?? ''}>
                      {secret.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.secretId ? (
                <p className="text-sm text-destructive">{errors.secretId}</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Create it under Credentials first if it is not here yet.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="subscription-account">Account ID</Label>
              <Input
                id="subscription-account"
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
                placeholder="Only when the vendor's API requires one"
                data-testid="subscriptions-create-account"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createSubscription.isPending}
              data-testid="subscriptions-create-submit"
            >
              {createSubscription.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent data-testid="subscriptions-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The secret it references is left alone. Deleting is refused while the subscription is
              still attached to an environment or an agent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && deleteSubscription.mutate(pendingDelete.id)}
              disabled={deleteSubscription.isPending}
              data-testid="subscriptions-delete-confirm"
            >
              {deleteSubscription.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
