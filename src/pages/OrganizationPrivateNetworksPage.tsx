import { useMemo, useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { networksClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ConnectivityBadge, EnrollmentBadge, ProvisioningBadge } from '@/components/NetworkBadges';
import { SortableHeader } from '@/components/SortableHeader';
import type { Network, TunnelCredential } from '@/gen/agynio/api/networks/v1/networks_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useListControls } from '@/hooks/useListControls';
import { copyText } from '@/lib/clipboard';
import { formatDateOnly, timestampToMillis } from '@/lib/format';
import { formatProvisioningState } from '@/lib/networks';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

type NetworkDialogValues = {
  name: string;
  description: string;
};

function NetworkDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: NetworkDialogValues) => void;
  isSubmitting: boolean;
}) {
  const [values, setValues] = useState<NetworkDialogValues>({ name: '', description: '' });
  const [error, setError] = useState('');

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setValues({ name: '', description: '' });
      setError('');
    }
  };

  const handleSubmit = () => {
    const name = values.name.trim();
    if (!name) {
      setError('Name is required.');
      return;
    }
    onSubmit({ name, description: values.description.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="private-networks-create-dialog">
        <DialogHeader>
          <DialogTitle>Create private network</DialogTitle>
          <DialogDescription>Create a logical network that can be reached by one or more tunnels.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="network-name">Name</Label>
            <Input
              id="network-name"
              value={values.name}
              onChange={(event) => {
                setValues((current) => ({ ...current, name: event.target.value }));
                setError('');
              }}
              placeholder="production-vpc"
              data-testid="private-networks-create-name"
            />
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="network-description">Description</Label>
            <Textarea
              id="network-description"
              value={values.description}
              onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))}
              placeholder="Private resources reachable through this network"
              data-testid="private-networks-create-description"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} data-testid="private-networks-create-submit">
            {isSubmitting ? 'Creating...' : 'Create network'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OrganizationPrivateNetworksPage() {
  useDocumentTitle('Private Networks');

  const { id } = useParams();
  const organizationId = id ?? '';
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const networksQuery = useInfiniteQuery({
    queryKey: ['private-networks', organizationId, 'list'],
    queryFn: ({ pageParam }) =>
      networksClient.listNetworks({ organizationId, pageSize: DEFAULT_PAGE_SIZE, pageToken: pageParam }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const createMutation = useMutation({
    mutationFn: (values: NetworkDialogValues) =>
      networksClient.createNetwork({ organizationId, name: values.name, description: values.description }),
    onSuccess: () => {
      toast.success('Private network created.');
      setCreateOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['private-networks', organizationId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create private network.');
    },
  });

  const networks = useMemo(() => networksQuery.data?.pages.flatMap((page) => page.networks) ?? [], [networksQuery.data]);
  const listControls = useListControls({
    items: networks,
    searchFields: [
      (network) => network.name,
      (network) => network.description,
      (network) => network.meta?.id ?? '',
      (network) => formatProvisioningState(network.provisioningState),
      (network) => formatDateOnly(network.meta?.createdAt),
    ],
    sortOptions: {
      name: (network) => network.name,
      state: (network) => formatProvisioningState(network.provisioningState),
      created: (network) => timestampToMillis(network.meta?.createdAt),
    },
    defaultSortKey: 'name',
  });

  const visibleNetworks = listControls.filteredItems;
  const hasSearch = listControls.searchTerm.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-sm flex-1">
          <Input
            placeholder="Search private networks..."
            value={listControls.searchTerm}
            onChange={(event) => listControls.setSearchTerm(event.target.value)}
            data-testid="private-networks-search"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)} data-testid="private-networks-create">
          Create network
        </Button>
      </div>
      {networksQuery.isPending ? <div className="text-sm text-muted-foreground">Loading private networks...</div> : null}
      {networksQuery.isError ? <div className="text-sm text-muted-foreground">Failed to load private networks.</div> : null}
      {networks.length === 0 && !networksQuery.isPending ? (
        <Card className="border-border" data-testid="private-networks-empty">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No private networks configured.
          </CardContent>
        </Card>
      ) : null}
      {networks.length > 0 ? (
        <Card className="border-border" data-testid="private-networks-table">
          <CardContent className="px-0">
            <div className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[2fr_2fr_1fr_1fr]">
              <SortableHeader
                label="Network"
                sortKey="name"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <span>Description</span>
              <SortableHeader
                label="Provisioning"
                sortKey="state"
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
            </div>
            <div className="divide-y divide-border">
              {visibleNetworks.length === 0 ? (
                <div className="px-6 py-6 text-sm text-muted-foreground">
                  {hasSearch ? 'No results found.' : 'No private networks configured.'}
                </div>
              ) : (
                visibleNetworks.map((network) => <NetworkRow key={network.meta?.id ?? network.name} network={network} />)
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}
      {networksQuery.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void networksQuery.fetchNextPage()}
            disabled={networksQuery.isFetchingNextPage}
          >
            {networksQuery.isFetchingNextPage ? 'Loading...' : 'Load more'}
          </Button>
        </div>
      ) : null}
      <NetworkDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={(values) => createMutation.mutate(values)}
        isSubmitting={createMutation.isPending}
      />
    </div>
  );
}

function NetworkRow({ network }: { network: Network }) {
  const networkId = network.meta?.id;

  return (
    <div className="grid gap-2 px-6 py-4 text-sm md:grid-cols-[2fr_2fr_1fr_1fr]" data-testid="private-networks-row">
      <div>
        {networkId ? (
          <NavLink className="font-medium text-primary hover:underline" to={networkId} data-testid="private-networks-row-link">
            {network.name}
          </NavLink>
        ) : (
          <span className="font-medium text-foreground">{network.name}</span>
        )}
        <div className="text-xs text-muted-foreground">{networkId || 'No ID'}</div>
      </div>
      <div className="text-muted-foreground">{network.description || 'No description'}</div>
      <div><ProvisioningBadge state={network.provisioningState} /></div>
      <div>{formatDateOnly(network.meta?.createdAt)}</div>
    </div>
  );
}

export function OrganizationPrivateNetworkDetailPage() {
  useDocumentTitle('Private Network');

  const { id, networkId } = useParams();
  const organizationId = id ?? '';
  const resolvedNetworkId = networkId ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const networkQuery = useQuery({
    queryKey: ['private-networks', organizationId, resolvedNetworkId],
    queryFn: () => networksClient.getNetwork({ id: resolvedNetworkId }),
    enabled: Boolean(resolvedNetworkId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const updateMutation = useMutation({
    mutationFn: (values: NetworkDialogValues) =>
      networksClient.updateNetwork({ id: resolvedNetworkId, name: values.name, description: values.description }),
    onSuccess: () => {
      toast.success('Private network updated.');
      void queryClient.invalidateQueries({ queryKey: ['private-networks', organizationId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to update private network.'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => networksClient.deleteNetwork({ id: resolvedNetworkId }),
    onSuccess: () => {
      toast.success('Private network deleted.');
      void queryClient.invalidateQueries({ queryKey: ['private-networks', organizationId] });
      navigate(`/organizations/${organizationId}/private-networks`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to delete private network.'),
  });

  const network = networkQuery.data?.network;

  if (networkQuery.isPending) return <div className="text-sm text-muted-foreground">Loading private network...</div>;
  if (networkQuery.isError || !network) return <div className="text-sm text-muted-foreground">Failed to load private network.</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <NavLink to={`/organizations/${organizationId}/private-networks`}>Back to private networks</NavLink>
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild data-testid="private-network-resources-link">
            <NavLink to={`/organizations/${organizationId}/private-resources?network=${resolvedNetworkId}`}>
              Private resources
            </NavLink>
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)} data-testid="private-network-delete">
            Delete network
          </Button>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {network.name}
            <ProvisioningBadge state={network.provisioningState} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <NetworkSettingsForm
            network={network}
            onSubmit={(values) => updateMutation.mutate(values)}
            isSubmitting={updateMutation.isPending}
          />
        </CardContent>
      </Card>
      {/* Tunnels are the only thing a network contains directly; resources have
          their own organization-scoped list and detail pages. */}
      <NetworkTunnelsTab networkId={resolvedNetworkId} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete private network?"
        description="This cascades through its tunnel credentials, private resources, and resource grants."
        confirmLabel="Delete network"
        variant="danger"
        onConfirm={() => deleteMutation.mutate()}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}

function NetworkSettingsForm({
  network,
  onSubmit,
  isSubmitting,
}: {
  network: Network;
  onSubmit: (values: NetworkDialogValues) => void;
  isSubmitting: boolean;
}) {
  const [values, setValues] = useState({ name: network.name, description: network.description });
  const [error, setError] = useState('');

  const handleSubmit = () => {
    const name = values.name.trim();
    if (!name) {
      setError('Name is required.');
      return;
    }
    onSubmit({ name, description: values.description.trim() });
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="network-detail-name">Name</Label>
        <Input
          id="network-detail-name"
          value={values.name}
          onChange={(event) => {
            setValues((current) => ({ ...current, name: event.target.value }));
            setError('');
          }}
          data-testid="network-detail-name"
        />
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
      <div className="space-y-2">
        <Label>Created</Label>
        <div className="rounded-md border border-input px-3 py-2 text-sm">{formatDateOnly(network.meta?.createdAt)}</div>
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="network-detail-description">Description</Label>
        <Textarea
          id="network-detail-description"
          value={values.description}
          onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))}
          data-testid="network-detail-description"
        />
      </div>
      <div className="md:col-span-2">
        <Button onClick={handleSubmit} disabled={isSubmitting} data-testid="network-detail-save">
          {isSubmitting ? 'Saving...' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}

function NetworkTunnelsTab({ networkId }: { networkId: string }) {
  const queryClient = useQueryClient();
  const [revealedJwt, setRevealedJwt] = useState('');

  const tunnelsQuery = useQuery({
    queryKey: ['private-networks', networkId, 'tunnels'],
    queryFn: () => networksClient.listTunnelCredentials({ networkId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(networkId),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  const createMutation = useMutation({
    mutationFn: () => networksClient.createTunnelCredential({ networkId }),
    onSuccess: (response) => {
      toast.success('Tunnel credential created. Copy the enrollment JWT now.');
      setRevealedJwt(response.enrollmentJwt);
      void queryClient.invalidateQueries({ queryKey: ['private-networks', networkId, 'tunnels'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to create tunnel credential.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => networksClient.deleteTunnelCredential({ id }),
    onSuccess: () => {
      toast.success('Tunnel credential revoked.');
      void queryClient.invalidateQueries({ queryKey: ['private-networks', networkId, 'tunnels'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to revoke tunnel credential.'),
  });

  const tunnels = tunnelsQuery.data?.tunnelCredentials ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Tunnel credentials</CardTitle>
        <Button size="sm" onClick={() => createMutation.mutate()} disabled={createMutation.isPending} data-testid="tunnels-create">
          {createMutation.isPending ? 'Creating...' : 'Issue credential'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {revealedJwt ? (
          <div className="rounded-md border border-border bg-muted/40 p-4" data-testid="tunnel-jwt-reveal">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-foreground">Enrollment JWT</div>
                <p className="text-xs text-muted-foreground">This token is shown once. Copy it before leaving this page.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => copyText(revealedJwt, 'Enrollment JWT copied.')}>
                Copy JWT
              </Button>
            </div>
            <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-background p-3 text-xs text-foreground">{revealedJwt}</pre>
          </div>
        ) : null}
        {tunnelsQuery.isPending ? <div className="text-sm text-muted-foreground">Loading tunnel credentials...</div> : null}
        {tunnelsQuery.isError ? <div className="text-sm text-muted-foreground">Failed to load tunnel credentials.</div> : null}
        {tunnels.length === 0 && !tunnelsQuery.isPending ? (
          <div className="rounded-md border border-border p-6 text-center text-sm text-muted-foreground">
            No tunnel credentials issued.
          </div>
        ) : null}
        {tunnels.length > 0 ? (
          <div className="divide-y divide-border rounded-md border border-border" data-testid="tunnels-list">
            {tunnels.map((tunnel) => (
              <TunnelRow
                key={tunnel.meta?.id ?? tunnel.networkId}
                tunnel={tunnel}
                onDelete={() => tunnel.meta?.id && deleteMutation.mutate(tunnel.meta.id)}
                isDeleting={deleteMutation.isPending}
              />
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TunnelRow({
  tunnel,
  onDelete,
  isDeleting,
}: {
  tunnel: TunnelCredential;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  return (
    <div className="grid gap-3 p-3 text-sm md:grid-cols-[2fr_1fr_1fr_1fr_120px]" data-testid="tunnels-row">
      <div>
        <div className="font-medium text-foreground">{tunnel.meta?.id ?? 'Tunnel credential'}</div>
        <div className="text-xs text-muted-foreground">
          JWT {tunnel.enrollmentJwtRevealed ? 'issued' : 'not issued'} · expires {formatDateOnly(tunnel.enrollmentJwtExpiresAt)}
        </div>
      </div>
      <div><EnrollmentBadge state={tunnel.enrollmentState} /></div>
      <div><ConnectivityBadge state={tunnel.connectivity} /></div>
      <div>
        <ProvisioningBadge state={tunnel.provisioningState} />
        <div className="mt-1 text-xs text-muted-foreground">Last seen {formatDateOnly(tunnel.lastSeenAt)}</div>
      </div>
      <div className="text-right">
        <Button variant="ghost" size="sm" onClick={onDelete} disabled={isDeleting || !tunnel.meta?.id}>
          Revoke
        </Button>
      </div>
    </div>
  );
}
