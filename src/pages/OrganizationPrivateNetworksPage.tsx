import { useMemo, useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentsClient, appsClient, groupsClient, networksClient, organizationsClient, usersClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { SortableHeader } from '@/components/SortableHeader';
import { AppVisibility } from '@/gen/agynio/api/apps/v1/apps_pb';
import type { Agent } from '@/gen/agynio/api/agents/v1/agents_pb';
import { GroupSource } from '@/gen/agynio/api/groups/v1/groups_pb';
import { MembershipStatus } from '@/gen/agynio/api/organizations/v1/organizations_pb';
import type { User } from '@/gen/agynio/api/users/v1/users_pb';
import {
  PrivateResourceAccessPrincipalType,
  PrivateResourceProtocol,
  ProvisioningState,
  TunnelConnectivity,
  TunnelEnrollmentState,
  type Network,
  type PrivateResource,
  type PrivateResourceAccess,
  type TunnelCredential,
} from '@/gen/agynio/api/networks/v1/networks_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useListControls } from '@/hooks/useListControls';
import { formatDateOnly, timestampToMillis } from '@/lib/format';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

type NetworkDialogValues = {
  name: string;
  description: string;
};

type ResourceDialogValues = {
  name: string;
  protocol: PrivateResourceProtocol;
  targetHost: string;
  targetPorts: number[];
  interceptHost: string;
  interceptPorts: number[];
};

type PrincipalOption = {
  type: PrivateResourceAccessPrincipalType;
  id: string;
  label: string;
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
        <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)} data-testid="private-network-delete">
          Delete network
        </Button>
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
      <Tabs defaultValue="tunnels" data-testid="private-network-tabs">
        <TabsList>
          <TabsTrigger value="tunnels" data-testid="private-network-tunnels-tab">Tunnels</TabsTrigger>
          <TabsTrigger value="resources" data-testid="private-network-resources-tab">Resources</TabsTrigger>
        </TabsList>
        <TabsContent value="tunnels">
          <NetworkTunnelsTab networkId={resolvedNetworkId} />
        </TabsContent>
        <TabsContent value="resources">
          <NetworkResourcesTab organizationId={organizationId} networkId={resolvedNetworkId} />
        </TabsContent>
      </Tabs>
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

function NetworkResourcesTab({ organizationId, networkId }: { organizationId: string; networkId: string }) {
  const queryClient = useQueryClient();
  const [resourceDialogOpen, setResourceDialogOpen] = useState(false);

  const resourcesQuery = useQuery({
    queryKey: ['private-networks', networkId, 'resources'],
    queryFn: () => networksClient.listPrivateResources({ networkId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(networkId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const grantsQuery = useInfiniteQuery({
    queryKey: ['private-networks', networkId, 'grants'],
    queryFn: ({ pageParam }) =>
      networksClient.listPrivateResourceAccess({ networkId, pageSize: MAX_PAGE_SIZE, pageToken: pageParam }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
    enabled: Boolean(networkId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const createMutation = useMutation({
    mutationFn: (values: ResourceDialogValues) => networksClient.createPrivateResource({ networkId, ...values }),
    onSuccess: () => {
      toast.success('Private resource created.');
      setResourceDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['private-networks', networkId, 'resources'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to create private resource.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (resourceId: string) => networksClient.deletePrivateResource({ id: resourceId }),
    onSuccess: () => {
      toast.success('Private resource deleted.');
      void queryClient.invalidateQueries({ queryKey: ['private-networks', networkId, 'resources'] });
      void queryClient.invalidateQueries({ queryKey: ['private-networks', networkId, 'grants'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to delete private resource.'),
  });

  const resources = resourcesQuery.data?.privateResources ?? [];
  const grants = useMemo(
    () => grantsQuery.data?.pages.flatMap((page) => page.privateResourceAccess) ?? [],
    [grantsQuery.data?.pages],
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Private resources</CardTitle>
        <Button size="sm" onClick={() => setResourceDialogOpen(true)} data-testid="resources-create">
          Add resource
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {resourcesQuery.isPending ? <div className="text-sm text-muted-foreground">Loading private resources...</div> : null}
        {resourcesQuery.isError ? <div className="text-sm text-muted-foreground">Failed to load private resources.</div> : null}
        {resources.length === 0 && !resourcesQuery.isPending ? (
          <div className="rounded-md border border-border p-6 text-center text-sm text-muted-foreground">
            No private resources configured.
          </div>
        ) : null}
        {resources.length > 0 ? (
          <div className="space-y-3" data-testid="resources-list">
            {resources.map((resource) => (
              <PrivateResourceCard
                key={resource.meta?.id ?? resource.name}
                organizationId={organizationId}
                networkId={networkId}
                resource={resource}
                grants={grants.filter((grant) => grant.privateResourceId === resource.meta?.id)}
                onDelete={() => resource.meta?.id && deleteMutation.mutate(resource.meta.id)}
                isDeleting={deleteMutation.isPending}
              />
            ))}
          </div>
        ) : null}
        <ResourceDialog
          open={resourceDialogOpen}
          onOpenChange={setResourceDialogOpen}
          onSubmit={(values) => createMutation.mutate(values)}
          isSubmitting={createMutation.isPending}
        />
      </CardContent>
    </Card>
  );
}

function ResourceDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ResourceDialogValues) => void;
  isSubmitting: boolean;
}) {
  const [values, setValues] = useState({
    name: '',
    protocol: `${PrivateResourceProtocol.TCP}`,
    targetHost: '',
    targetPorts: '',
    interceptHost: '',
    interceptPorts: '',
  });
  const [error, setError] = useState('');

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setValues({ name: '', protocol: `${PrivateResourceProtocol.TCP}`, targetHost: '', targetPorts: '', interceptHost: '', interceptPorts: '' });
      setError('');
    }
  };

  const handleSubmit = () => {
    const targetPorts = parsePorts(values.targetPorts);
    const interceptPorts = parsePorts(values.interceptPorts);
    if (!values.name.trim() || !values.targetHost.trim() || !values.interceptHost.trim()) {
      setError('Name, target host, and intercept host are required.');
      return;
    }
    if (targetPorts.length === 0 || interceptPorts.length === 0 || targetPorts.length !== interceptPorts.length) {
      setError('Target and intercept ports must be non-empty lists with matching length.');
      return;
    }
    onSubmit({
      name: values.name.trim(),
      protocol: Number(values.protocol) as PrivateResourceProtocol,
      targetHost: values.targetHost.trim(),
      targetPorts,
      interceptHost: values.interceptHost.trim(),
      interceptPorts,
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="resource-create-dialog">
        <DialogHeader>
          <DialogTitle>Add private resource</DialogTitle>
          <DialogDescription>Expose a private target through this network using an intercept hostname.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={values.name} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Protocol</Label>
            <Select value={values.protocol} onValueChange={(protocol) => setValues((current) => ({ ...current, protocol }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={`${PrivateResourceProtocol.TCP}`}>TCP</SelectItem>
                <SelectItem value={`${PrivateResourceProtocol.HTTP}`}>HTTP</SelectItem>
                <SelectItem value={`${PrivateResourceProtocol.HTTPS}`}>HTTPS</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Target host</Label>
            <Input value={values.targetHost} onChange={(event) => setValues((current) => ({ ...current, targetHost: event.target.value }))} placeholder="postgres.internal" />
          </div>
          <div className="space-y-2">
            <Label>Target ports</Label>
            <Input value={values.targetPorts} onChange={(event) => setValues((current) => ({ ...current, targetPorts: event.target.value }))} placeholder="5432" />
          </div>
          <div className="space-y-2">
            <Label>Intercept host</Label>
            <Input value={values.interceptHost} onChange={(event) => setValues((current) => ({ ...current, interceptHost: event.target.value }))} placeholder="postgres.private.example" />
          </div>
          <div className="space-y-2">
            <Label>Intercept ports</Label>
            <Input value={values.interceptPorts} onChange={(event) => setValues((current) => ({ ...current, interceptPorts: event.target.value }))} placeholder="5432" />
          </div>
          {error ? <p className="text-xs text-destructive md:col-span-2">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} data-testid="resource-create-submit">
            {isSubmitting ? 'Creating...' : 'Create resource'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PrivateResourceCard({
  organizationId,
  networkId,
  resource,
  grants,
  onDelete,
  isDeleting,
}: {
  organizationId: string;
  networkId: string;
  resource: PrivateResource;
  grants: PrivateResourceAccess[];
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const queryClient = useQueryClient();
  const [grantDialogOpen, setGrantDialogOpen] = useState(false);
  const connectionString = buildConnectionString(resource);

  const principalOptions = usePrincipalOptions(organizationId);
  const createGrantMutation = useMutation({
    mutationFn: (option: PrincipalOption) =>
      networksClient.createPrivateResourceAccess({
        privateResourceId: resource.meta?.id ?? '',
        principalType: option.type,
        principalId: option.id,
      }),
    onSuccess: () => {
      toast.success('Resource grant created.');
      setGrantDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['private-networks', networkId, 'grants'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to create resource grant.'),
  });
  const deleteGrantMutation = useMutation({
    mutationFn: (grantId: string) => networksClient.deletePrivateResourceAccess({ id: grantId }),
    onSuccess: () => {
      toast.success('Resource grant removed.');
      void queryClient.invalidateQueries({ queryKey: ['private-networks', networkId, 'grants'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to remove resource grant.'),
  });

  return (
    <Card className="border-border" data-testid="resource-card">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            {resource.name}
            <ProvisioningBadge state={resource.provisioningState} />
          </CardTitle>
          <div className="mt-1 text-sm text-muted-foreground">
            {formatProtocol(resource.protocol)} · {formatPortMapping(resource)}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onDelete} disabled={isDeleting || !resource.meta?.id}>
          Delete
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-border p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Target</div>
            <div className="mt-1 text-sm">{resource.targetHost}:{resource.targetPorts.join(', ')}</div>
          </div>
          <div className="rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Connection string</div>
                <div className="mt-1 break-all text-sm" data-testid="resource-connection-string">{connectionString}</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => copyText(connectionString, 'Connection string copied.')}>
                Copy
              </Button>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-foreground">Grants</h4>
            <Button variant="outline" size="sm" onClick={() => setGrantDialogOpen(true)} disabled={!resource.meta?.id} data-testid="resource-grant-add">
              Add grant
            </Button>
          </div>
          {grants.length === 0 ? (
            <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">No principals can access this resource.</div>
          ) : (
            <div className="divide-y divide-border rounded-md border border-border">
              {grants.map((grant) => (
                <GrantRow
                  key={grant.meta?.id ?? `${grant.principalType}:${grant.principalId}`}
                  grant={grant}
                  label={formatGrantLabel(grant, principalOptions.options)}
                  onDelete={() => grant.meta?.id && deleteGrantMutation.mutate(grant.meta.id)}
                  isDeleting={deleteGrantMutation.isPending}
                />
              ))}
            </div>
          )}
        </div>
        <GrantDialog
          open={grantDialogOpen}
          onOpenChange={setGrantDialogOpen}
          options={principalOptions.options}
          existingGrants={grants}
          onSubmit={(option) => createGrantMutation.mutate(option)}
          isSubmitting={createGrantMutation.isPending}
          organizationId={organizationId}
        />
      </CardContent>
    </Card>
  );
}

function GrantRow({
  grant,
  label,
  onDelete,
  isDeleting,
}: {
  grant: PrivateResourceAccess;
  label: string;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm" data-testid="resource-grant-row">
      <div>
        <div className="font-medium text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">
          {formatPrincipalType(grant.principalType)} - {grant.principalId}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <ProvisioningBadge state={grant.provisioningState} />
        <Button variant="ghost" size="sm" onClick={onDelete} disabled={isDeleting || !grant.meta?.id}>Remove</Button>
      </div>
    </div>
  );
}

function GrantDialog({
  open,
  onOpenChange,
  options,
  existingGrants,
  onSubmit,
  isSubmitting,
  organizationId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: PrincipalOption[];
  existingGrants: PrivateResourceAccess[];
  onSubmit: (option: PrincipalOption) => void;
  isSubmitting: boolean;
  organizationId: string;
}) {
  const queryClient = useQueryClient();
  const [selectedValue, setSelectedValue] = useState('');
  const [inlineGroupName, setInlineGroupName] = useState('');
  const [inlineGroupError, setInlineGroupError] = useState('');

  const grantedKeys = useMemo(
    () => new Set(existingGrants.map((grant) => principalValue({ type: grant.principalType, id: grant.principalId, label: '', description: '' }))),
    [existingGrants],
  );
  const selectableOptions = options.filter((option) => !grantedKeys.has(principalValue(option)));
  const selectedOption = selectableOptions.find((option) => principalValue(option) === selectedValue);

  const createGroupMutation = useMutation({
    mutationFn: (name: string) => groupsClient.createGroup({ organizationId, name, description: '', source: GroupSource.PLATFORM }),
    onSuccess: (response) => {
      const group = response.group;
      const groupId = group?.meta?.id;
      if (!group || !groupId) return;
      toast.success('Group created.');
      void queryClient.invalidateQueries({ queryKey: ['groups', organizationId] });
      onSubmit({
        type: PrivateResourceAccessPrincipalType.GROUP,
        id: groupId,
        label: group.name,
        description: group.description || groupId,
      });
      setInlineGroupName('');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to create group.'),
  });

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setSelectedValue('');
      setInlineGroupName('');
      setInlineGroupError('');
    }
  };

  const createInlineGroup = () => {
    const name = inlineGroupName.trim();
    if (!/^[a-z0-9_-]{1,64}$/.test(name)) {
      setInlineGroupError('Use 1-64 lowercase letters, numbers, underscores, or hyphens.');
      return;
    }
    createGroupMutation.mutate(name);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="grant-dialog">
        <DialogHeader>
          <DialogTitle>Add resource access</DialogTitle>
          <DialogDescription>Grant this private resource to an agent, user, app, or group principal.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Principal</Label>
            <Select value={selectedValue} onValueChange={setSelectedValue}>
              <SelectTrigger className="w-full" data-testid="grant-principal-select"><SelectValue placeholder="Select a principal" /></SelectTrigger>
              <SelectContent>
                {selectableOptions.length === 0 ? (
                  <SelectItem value="__none" disabled>No principals available</SelectItem>
                ) : (
                  selectableOptions.map((option) => (
                    <SelectItem key={principalValue(option)} value={principalValue(option)}>
                      {option.label} ({formatPrincipalType(option.type)})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {selectedOption ? <p className="text-xs text-muted-foreground">{selectedOption.description}</p> : null}
          </div>
          <div className="rounded-md border border-border p-3">
            <Label htmlFor="inline-group-name">Create group inline</Label>
            <div className="mt-2 flex gap-2">
              <Input
                id="inline-group-name"
                value={inlineGroupName}
                onChange={(event) => {
                  setInlineGroupName(event.target.value);
                  setInlineGroupError('');
                }}
                placeholder="engineering"
                data-testid="grant-inline-group-name"
              />
              <Button variant="outline" onClick={createInlineGroup} disabled={createGroupMutation.isPending}>
                Create and grant
              </Button>
            </div>
            {inlineGroupError ? <p className="mt-2 text-xs text-destructive">{inlineGroupError}</p> : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          <Button onClick={() => selectedOption && onSubmit(selectedOption)} disabled={!selectedOption || isSubmitting} data-testid="grant-submit">
            {isSubmitting ? 'Granting...' : 'Grant access'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function usePrincipalOptions(organizationId: string) {
  const organizationMembersQuery = useInfiniteQuery({
    queryKey: ['organizations', organizationId, 'members', 'resource-grant-picker'],
    queryFn: ({ pageParam }) =>
      organizationsClient.listMembers({
        organizationId,
        status: MembershipStatus.ACTIVE,
        pageSize: MAX_PAGE_SIZE,
        pageToken: pageParam,
      }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const agentsQuery = useQuery({
    queryKey: ['agents', organizationId, 'resource-grant-picker'],
    queryFn: () => agentsClient.listAgents({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const appsQuery = useQuery({
    queryKey: ['apps', organizationId, 'resource-grant-picker'],
    queryFn: () =>
      appsClient.listApps({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '', visibility: AppVisibility.UNSPECIFIED }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const groupsQuery = useQuery({
    queryKey: ['groups', organizationId, 'resource-grant-picker'],
    queryFn: () => groupsClient.listGroups({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const organizationMemberIdentityIds = useMemo(
    () =>
      Array.from(
        new Set(
          (organizationMembersQuery.data?.pages.flatMap((page) => page.memberships) ?? [])
            .map((membership) => membership.identityId)
            .filter(Boolean),
        ),
      ),
    [organizationMembersQuery.data?.pages],
  );

  const organizationUsersQuery = useQuery({
    queryKey: ['users', 'batch', 'org-members', 'resource-grant-picker', organizationMemberIdentityIds.join(',')],
    queryFn: () => usersClient.batchGetUsers({ identityIds: organizationMemberIdentityIds }),
    enabled: organizationMemberIdentityIds.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const options = useMemo(() => {
    const userOptions = (organizationUsersQuery.data?.users ?? []).flatMap((user): PrincipalOption[] => {
      const userId = user.meta?.id;
      if (!userId) return [];
      return [{ type: PrivateResourceAccessPrincipalType.USER, id: userId, label: formatUserPrincipal(user), description: user.email || userId }];
    });
    const agentOptions = (agentsQuery.data?.agents ?? []).flatMap((agent): PrincipalOption[] => {
      const agentId = agent.meta?.id;
      if (!agentId) return [];
      return [{ type: PrivateResourceAccessPrincipalType.AGENT, id: agentId, label: formatAgentPrincipal(agent), description: agent.role || agentId }];
    });
    const appOptions = (appsQuery.data?.apps ?? []).flatMap((app): PrincipalOption[] => {
      const appId = app.identityId || app.meta?.id;
      if (!appId) return [];
      return [{ type: PrivateResourceAccessPrincipalType.APP, id: appId, label: app.name || app.slug || appId, description: app.slug || appId }];
    });
    const groupOptions = (groupsQuery.data?.groups ?? []).flatMap((group): PrincipalOption[] => {
      const groupId = group.meta?.id;
      if (!groupId) return [];
      return [{ type: PrivateResourceAccessPrincipalType.GROUP, id: groupId, label: group.name, description: group.description || groupId }];
    });
    return [...userOptions, ...agentOptions, ...appOptions, ...groupOptions].sort((left, right) => left.label.localeCompare(right.label));
  }, [agentsQuery.data?.agents, appsQuery.data?.apps, groupsQuery.data?.groups, organizationUsersQuery.data?.users]);

  return { options };
}

function ProvisioningBadge({ state }: { state: ProvisioningState }) {
  const label = formatProvisioningState(state);
  const variant = state === ProvisioningState.FAILED ? 'destructive' : state === ProvisioningState.ACTIVE ? 'default' : 'outline';
  return <Badge variant={variant}>{label}</Badge>;
}

function EnrollmentBadge({ state }: { state: TunnelEnrollmentState }) {
  return <Badge variant={state === TunnelEnrollmentState.ENROLLED ? 'default' : 'outline'}>{formatEnrollmentState(state)}</Badge>;
}

function ConnectivityBadge({ state }: { state: TunnelConnectivity }) {
  return <Badge variant={state === TunnelConnectivity.ONLINE ? 'default' : 'outline'}>{formatConnectivity(state)}</Badge>;
}

function formatProvisioningState(state: ProvisioningState) {
  switch (state) {
    case ProvisioningState.ACTIVE:
      return 'Active';
    case ProvisioningState.FAILED:
      return 'Failed';
    case ProvisioningState.REMOVING:
      return 'Removing';
    case ProvisioningState.UNSPECIFIED:
      return 'Unspecified';
  }
}

function formatEnrollmentState(state: TunnelEnrollmentState) {
  switch (state) {
    case TunnelEnrollmentState.PENDING:
      return 'Pending';
    case TunnelEnrollmentState.ENROLLED:
      return 'Enrolled';
    case TunnelEnrollmentState.UNSPECIFIED:
      return 'Unspecified';
  }
}

function formatConnectivity(state: TunnelConnectivity) {
  switch (state) {
    case TunnelConnectivity.ONLINE:
      return 'Online';
    case TunnelConnectivity.OFFLINE:
      return 'Offline';
    case TunnelConnectivity.UNSPECIFIED:
      return 'Unspecified';
  }
}

function formatProtocol(protocol: PrivateResourceProtocol) {
  switch (protocol) {
    case PrivateResourceProtocol.TCP:
      return 'TCP';
    case PrivateResourceProtocol.HTTP:
      return 'HTTP';
    case PrivateResourceProtocol.HTTPS:
      return 'HTTPS';
    case PrivateResourceProtocol.UNSPECIFIED:
      return 'Unspecified';
  }
}

function formatPrincipalType(type: PrivateResourceAccessPrincipalType) {
  switch (type) {
    case PrivateResourceAccessPrincipalType.AGENT:
      return 'Agent';
    case PrivateResourceAccessPrincipalType.USER:
      return 'User';
    case PrivateResourceAccessPrincipalType.APP:
      return 'App';
    case PrivateResourceAccessPrincipalType.GROUP:
      return 'Group';
    case PrivateResourceAccessPrincipalType.UNSPECIFIED:
      return 'Principal';
  }
}

function parsePorts(value: string) {
  return value
    .split(',')
    .map((port) => Number(port.trim()))
    .filter((port) => Number.isInteger(port) && port > 0 && port <= 65535);
}

function buildConnectionString(resource: PrivateResource) {
  const protocol = formatProtocol(resource.protocol).toLowerCase();
  const port = resource.interceptPorts[0];
  return port ? `${protocol}://${resource.interceptHost}:${port}` : `${protocol}://${resource.interceptHost}`;
}

function formatPortMapping(resource: PrivateResource) {
  return resource.interceptPorts.map((port, index) => `${resource.interceptHost}:${port} -> ${resource.targetHost}:${resource.targetPorts[index]}`).join(', ');
}

function principalValue(option: PrincipalOption) {
  return `${option.type}:${option.id}`;
}

function formatGrantLabel(grant: PrivateResourceAccess, options: PrincipalOption[]) {
  return options.find((option) => option.type === grant.principalType && option.id === grant.principalId)?.label ?? grant.principalId;
}

function formatUserPrincipal(user: User) {
  return user.nickname ? `@${user.nickname}` : user.name || user.email || user.meta?.id || 'User';
}

function formatAgentPrincipal(agent: Agent) {
  return agent.nickname || agent.name || agent.meta?.id || 'Agent';
}

function copyText(value: string, successMessage: string) {
  void navigator.clipboard.writeText(value).then(
    () => toast.success(successMessage),
    () => toast.error('Failed to copy to clipboard.'),
  );
}
