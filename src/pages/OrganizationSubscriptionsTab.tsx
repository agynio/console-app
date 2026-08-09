import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { llmClient, secretsClient } from '@/api/client';
import { Vendor, type Subscription } from '@/gen/agynio/api/llm/v1/llm_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { SortableHeader } from '@/components/SortableHeader';
import { useListControls } from '@/hooks/useListControls';
import { EMPTY_PLACEHOLDER, formatDateOnly, timestampToMillis } from '@/lib/format';

const PAGE_SIZE = 200;

// Chosen in the same Select as the existing secrets, so creating one never
// means leaving the form and losing what is already typed into it.
const NEW_SECRET = '__new__';

const VENDOR_OPTIONS = [
  { value: Vendor.ANTHROPIC, label: 'Anthropic' },
  { value: Vendor.OPENAI, label: 'OpenAI' },
] as const;

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
 * A subscription is an organization's own plan with an agent CLI vendor, held
 * as a reference to a secret. Nothing here reads or shows the token: it is
 * resolved by the LLM Proxy at connection time and never leaves the platform.
 */
export function OrganizationSubscriptionsTab() {
  useDocumentTitle('Subscriptions');

  const { id } = useParams();
  const organizationId = id ?? '';
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState<Subscription | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [vendor, setVendor] = useState<Vendor>(Vendor.ANTHROPIC);
  const [secretId, setSecretId] = useState('');
  const [newSecretTitle, setNewSecretTitle] = useState('');
  const [newSecretValue, setNewSecretValue] = useState('');
  const [errors, setErrors] = useState<{ name?: string; secretId?: string; token?: string }>({});
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
    enabled: (createOpen || editing !== null) && Boolean(organizationId),
  });

  const openEdit = (subscription: Subscription) => {
    setName(subscription.name);
    setVendor(subscription.vendor);
    setSecretId(subscription.secretId);
    setNewSecretTitle('');
    setNewSecretValue('');
    setErrors({});
    setEditing(subscription);
  };

  const resetForm = () => {
    setName('');
    setVendor(Vendor.ANTHROPIC);
    setSecretId('');
    setNewSecretTitle('');
    setNewSecretValue('');
    setErrors({});
  };

  const createSubscription = useMutation({
    mutationFn: async () => {
      // A new secret is created first and referenced by id: the subscription
      // holds a reference either way, and the token never reaches this service.
      let referencedSecretId = secretId;
      if (secretId === NEW_SECRET) {
        const created = await secretsClient.createSecret({
          organizationId,
          title: newSecretTitle.trim() || `${name.trim()} token`,
          description: 'Subscription token',
          value: newSecretValue,
        });
        referencedSecretId = created.secret?.meta?.id ?? '';
        void queryClient.invalidateQueries({ queryKey: ['secrets', organizationId] });
      }
      return llmClient.createSubscription({
        organizationId,
        name: name.trim(),
        vendor,
        secretId: referencedSecretId,
      });
    },
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

  const updateSubscription = useMutation({
    mutationFn: async () => {
      let referencedSecretId = secretId;
      if (secretId === NEW_SECRET) {
        const created = await secretsClient.createSecret({
          organizationId,
          title: newSecretTitle.trim() || `${name.trim()} token`,
          description: 'Subscription token',
          value: newSecretValue,
        });
        referencedSecretId = created.secret?.meta?.id ?? '';
        void queryClient.invalidateQueries({ queryKey: ['secrets', organizationId] });
      }
      return llmClient.updateSubscription({
        id: editing?.meta?.id ?? '',
        name: name.trim(),
        secretId: referencedSecretId,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['llm', organizationId, 'subscriptions'] });
      toast.success('Subscription updated.');
      setEditing(null);
      resetForm();
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error ? mutationError.message : 'Failed to update the subscription.',
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
    const nextErrors: { name?: string; secretId?: string; token?: string } = {};
    if (!name.trim()) nextErrors.name = 'Name is required.';
    if (!secretId) nextErrors.secretId = 'A secret holding the token is required.';
    if (secretId === NEW_SECRET && !newSecretValue.trim()) nextErrors.token = 'Paste the token.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    if (editing) {
      updateSubscription.mutate();
      return;
    }
    createSubscription.mutate();
  };

  const subscriptions = data?.subscriptions ?? [];
  const attachments = attachmentData?.subscriptionAttachments ?? [];
  const secrets = secretData?.secrets ?? [];

  const attachmentCount = (subscriptionId: string) =>
    attachments.filter((attachment) => attachment.subscriptionId === subscriptionId).length;

  const listControls = useListControls({
    items: subscriptions,
    searchFields: [
      (subscription) => subscription.name,
      (subscription) => subscription.meta?.id ?? '',
      (subscription) => vendorLabel(subscription.vendor),
      (subscription) => subscription.secretId,
    ],
    sortOptions: {
      name: (subscription) => subscription.name,
      vendor: (subscription) => vendorLabel(subscription.vendor),
      attached: (subscription) => attachmentCount(subscription.meta?.id ?? ''),
      created: (subscription) => timestampToMillis(subscription.meta?.createdAt),
    },
    defaultSortKey: 'name',
  });
  const visible = listControls.filteredItems;
  const hasSearch = listControls.searchTerm.trim().length > 0;

  return (
    <div className="space-y-4" data-testid="organization-subscriptions">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-sm flex-1">
          <Input
            placeholder="Search subscriptions..."
            value={listControls.searchTerm}
            onChange={(event) => listControls.setSearchTerm(event.target.value)}
            data-testid="list-search"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCreateOpen(true)}
          data-testid="subscriptions-create"
        >
          Add subscription
        </Button>
      </div>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading subscriptions...</div>
      ) : null}
      {error ? <div className="text-sm text-muted-foreground">Failed to load subscriptions.</div> : null}
      {subscriptions.length === 0 && !isLoading ? (
        <Card className="border-border" data-testid="subscriptions-empty">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No subscriptions found.
          </CardContent>
        </Card>
      ) : null}
      {subscriptions.length > 0 ? (
        <Card className="border-border" data-testid="subscriptions-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[2fr_1fr_1fr_1fr_200px]"
              data-testid="subscriptions-header"
            >
              <SortableHeader
                label="Subscription"
                sortKey="name"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Vendor"
                sortKey="vendor"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Attached"
                sortKey="attached"
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
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-border">
              {visible.length === 0 ? (
                <div className="px-6 py-6 text-sm text-muted-foreground">
                  {hasSearch ? 'No results found.' : 'No subscriptions registered.'}
                </div>
              ) : (
                visible.map((subscription) => {
                  const subscriptionId = subscription.meta?.id ?? '';
                  const count = attachmentCount(subscriptionId);
                  return (
                    <div
                      key={subscriptionId}
                      className="grid items-center gap-2 px-6 py-4 text-sm text-foreground md:grid-cols-[2fr_1fr_1fr_1fr_200px]"
                      data-testid="subscriptions-row"
                    >
                      <div>
                        <div className="font-medium" data-testid="subscriptions-name">
                          {subscription.name || EMPTY_PLACEHOLDER}
                        </div>
                        <div className="text-xs text-muted-foreground" data-testid="subscriptions-secret">
                          {subscription.secretId || EMPTY_PLACEHOLDER}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground" data-testid="subscriptions-vendor">
                        {vendorLabel(subscription.vendor)}
                      </span>
                      <span className="text-xs text-muted-foreground" data-testid="subscriptions-attached">
                        {count === 0 ? EMPTY_PLACEHOLDER : `${count} target${count === 1 ? '' : 's'}`}
                      </span>
                      <span className="text-xs text-muted-foreground" data-testid="subscriptions-created">
                        {formatDateOnly(subscription.meta?.createdAt)}
                      </span>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(subscription)}
                          data-testid="subscriptions-edit"
                        >
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setPendingDelete({ id: subscriptionId, name: subscription.name })}
                          data-testid="subscriptions-delete"
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Dialog
        open={createOpen || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            resetForm();
            setEditing(null);
          }
          setCreateOpen(open && editing === null);
        }}
      >
        <DialogContent data-testid="subscriptions-create-dialog">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit subscription' : 'New subscription'}</DialogTitle>
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
                disabled={editing !== null}
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
                  <SelectValue placeholder="Choose a secret, or add one" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NEW_SECRET}>Add a new secret…</SelectItem>
                  {secrets.map((secret) => (
                    <SelectItem key={secret.meta?.id} value={secret.meta?.id ?? ''}>
                      {secret.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.secretId ? <p className="text-sm text-destructive">{errors.secretId}</p> : null}
            </div>

            {secretId === NEW_SECRET ? (
              <div className="space-y-4 rounded-md border border-border p-4">
                <div className="space-y-2">
                  <Label htmlFor="subscription-secret-title">Secret name</Label>
                  <Input
                    id="subscription-secret-title"
                    value={newSecretTitle}
                    onChange={(event) => setNewSecretTitle(event.target.value)}
                    placeholder={name.trim() ? `${name.trim()} token` : 'Subscription token'}
                    data-testid="subscriptions-create-secret-title"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subscription-secret-value">Token</Label>
                  <Input
                    id="subscription-secret-value"
                    type="password"
                    value={newSecretValue}
                    onChange={(event) => setNewSecretValue(event.target.value)}
                    data-testid="subscriptions-create-secret-value"
                  />
                  {errors.token ? (
                    <p className="text-sm text-destructive">{errors.token}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Stored as a secret and referenced by the subscription. Never shown again.
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateOpen(false);
                setEditing(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createSubscription.isPending || updateSubscription.isPending}
              data-testid="subscriptions-create-submit"
            >
              {editing
                ? updateSubscription.isPending
                  ? 'Saving…'
                  : 'Save'
                : createSubscription.isPending
                  ? 'Creating…'
                  : 'Create'}
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
