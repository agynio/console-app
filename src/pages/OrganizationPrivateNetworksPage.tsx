import { useEffect, useMemo, useState } from 'react';
import { MoreHorizontalIcon } from 'lucide-react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { networksClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DetailField } from '@/components/DetailField';
import { DetailPageHeader } from '@/components/DetailPageHeader';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ConnectivityBadge, EnrollmentBadge, ProvisioningBadge } from '@/components/NetworkBadges';
import { SortableHeader } from '@/components/SortableHeader';
import { ProvisioningState, TunnelEnrollmentState } from '@/gen/agynio/api/networks/v1/networks_pb';
import type { Network, TunnelCredential } from '@/gen/agynio/api/networks/v1/networks_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useListControls } from '@/hooks/useListControls';
import { copyText } from '@/lib/clipboard';
import { downloadTextFile } from '@/lib/download';
import { EMPTY_PLACEHOLDER, formatAge, formatDateOnly, timestampToMillis } from '@/lib/format';
import { formatEnrollmentExpiry, formatProvisioningState } from '@/lib/networks';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/pagination';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type NetworkDialogValues = {
  name: string;
  description: string;
};

const emptyNetworkValues: NetworkDialogValues = { name: '', description: '' };

/** The dialog the list creates with and the detail page edits with, so both take the same form. */
function NetworkDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  pendingLabel,
  initialValues,
  onSubmit,
  isSubmitting,
  testIdPrefix,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  pendingLabel: string;
  initialValues: NetworkDialogValues;
  onSubmit: (values: NetworkDialogValues) => void;
  isSubmitting: boolean;
  testIdPrefix: string;
}) {
  const [values, setValues] = useState<NetworkDialogValues>(initialValues);
  const [error, setError] = useState('');
  const { name: initialName, description: initialDescription } = initialValues;

  // Each opening starts from the network as it is now, not from the last edit.
  useEffect(() => {
    if (!open) return;
    setValues({ name: initialName, description: initialDescription });
    setError('');
  }, [open, initialName, initialDescription]);

  const handleSubmit = () => {
    const name = values.name.trim();
    if (!name) {
      setError('Name is required.');
      return;
    }
    onSubmit({ name, description: values.description.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={`${testIdPrefix}-dialog`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`${testIdPrefix}-name`}>Name</Label>
            <Input
              id={`${testIdPrefix}-name`}
              value={values.name}
              onChange={(event) => {
                setValues((current) => ({ ...current, name: event.target.value }));
                setError('');
              }}
              placeholder="production-vpc"
              data-testid={`${testIdPrefix}-name`}
            />
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${testIdPrefix}-description`}>Description</Label>
            <Textarea
              id={`${testIdPrefix}-description`}
              value={values.description}
              onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))}
              placeholder="Private resources reachable through this network"
              data-testid={`${testIdPrefix}-description`}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} data-testid={`${testIdPrefix}-submit`}>
            {isSubmitting ? pendingLabel : submitLabel}
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
        title="Create private network"
        description="Create a logical network that can be reached by one or more tunnels."
        submitLabel="Create network"
        pendingLabel="Creating..."
        initialValues={emptyNetworkValues}
        onSubmit={(values) => createMutation.mutate(values)}
        isSubmitting={createMutation.isPending}
        testIdPrefix="private-networks-create"
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
  const [editOpen, setEditOpen] = useState(false);

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
      setEditOpen(false);
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
    <div className="space-y-3">
      <DetailPageHeader
        parentLabel="Private networks"
        parentHref={`/organizations/${organizationId}/private-networks`}
        title={network.name}
        badge={<ProvisioningBadge state={network.provisioningState} />}
        meta={<span data-testid="network-detail-description">{network.description || 'No description'}</span>}
        actions={
          <>
            <Button variant="outline" size="sm" asChild data-testid="private-network-resources-link">
              <NavLink to={`/organizations/${organizationId}/private-resources?network=${resolvedNetworkId}`}>
                Private resources
              </NavLink>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} data-testid="network-detail-edit">
              Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" aria-label="More actions" data-testid="private-network-actions">
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setDeleteOpen(true)}
                  data-testid="private-network-delete"
                >
                  Delete network
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
        testId="private-network-header"
        className="mb-4"
      />
      <Card className="py-4">
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <DetailField label="Created" testId="network-detail-created">
              {formatDateOnly(network.meta?.createdAt)}
            </DetailField>
            <DetailField label="Network ID" testId="network-detail-id">
              <span className="font-mono text-xs text-muted-foreground">{network.meta?.id || EMPTY_PLACEHOLDER}</span>
            </DetailField>
          </div>
        </CardContent>
      </Card>
      <NetworkDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit private network"
        description="The name and description this network is listed under."
        submitLabel="Save changes"
        pendingLabel="Saving..."
        initialValues={{ name: network.name, description: network.description }}
        onSubmit={(values) => updateMutation.mutate(values)}
        isSubmitting={updateMutation.isPending}
        testIdPrefix="network-detail-edit"
      />
      {/* Tunnels are the only thing a network contains directly; resources have
          their own organization-scoped list and detail pages. */}
      <NetworkTunnelsTab networkId={resolvedNetworkId} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete private network?"
        description="This cascades through its tunnels, private resources, and resource grants."
        confirmLabel="Delete network"
        variant="danger"
        onConfirm={() => deleteMutation.mutate()}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}


function NetworkTunnelsTab({ networkId }: { networkId: string }) {
  const queryClient = useQueryClient();
  const [issued, setIssued] = useState<IssuedCredential | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);

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
      toast.success('Tunnel added.');
      setIssued({ id: response.tunnelCredential?.meta?.id ?? '', jwt: response.enrollmentJwt });
      void queryClient.invalidateQueries({ queryKey: ['private-networks', networkId, 'tunnels'] });
    },
    onError: (error) => {
      setIssueOpen(false);
      toast.error(error instanceof Error ? error.message : 'Failed to add tunnel.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => networksClient.deleteTunnelCredential({ id }),
    onSuccess: () => {
      toast.success('Tunnel revoked.');
      void queryClient.invalidateQueries({ queryKey: ['private-networks', networkId, 'tunnels'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to revoke tunnel.'),
  });

  // Issued from the click, not from the dialog opening: an effect would fire
  // twice under StrictMode and hand out two credentials.
  const handleIssue = () => {
    setIssued(null);
    setIssueOpen(true);
    createMutation.mutate();
  };

  const tunnels = tunnelsQuery.data?.tunnelCredentials ?? [];

  return (
    <Card className="gap-4 py-4">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Tunnels</CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={handleIssue}
          disabled={createMutation.isPending}
          data-testid="tunnels-create"
        >
          {createMutation.isPending ? 'Adding...' : 'Add tunnel'}
        </Button>
      </CardHeader>
      <CardContent>
        {tunnelsQuery.isPending ? <div className="text-sm text-muted-foreground">Loading tunnels...</div> : null}
        {tunnelsQuery.isError ? <div className="text-sm text-muted-foreground">Failed to load tunnels.</div> : null}
        {tunnels.length === 0 && !tunnelsQuery.isPending && !tunnelsQuery.isError ? (
          <div className="border-t border-border pt-3 text-sm text-muted-foreground" data-testid="tunnels-empty">
            No tunnels yet. A tunnel enrols with the JWT issued when you add it.
          </div>
        ) : null}
        {tunnels.length > 0 ? (
          <div data-testid="tunnels-list">
            <div className={cn(TUNNEL_GRID, 'border-t border-border pb-2 pt-3 text-xs text-muted-foreground')}>
              <span>Tunnel</span>
              <span>Enrollment</span>
              <span>Connection</span>
              <span>Last seen</span>
              <span />
            </div>
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
        <TunnelCredentialDialog
          open={issueOpen}
          issued={issued}
          isIssuing={createMutation.isPending}
          onDone={() => {
            setIssueOpen(false);
            setIssued(null);
          }}
        />
      </CardContent>
    </Card>
  );
}

type IssuedCredential = { id: string; jwt: string };

/**
 * The credential is already issued when this opens: the dialog exists to show
 * a JWT that is returned once, so it only leaves on an explicit Done.
 */
function TunnelCredentialDialog({
  open,
  issued,
  isIssuing,
  onDone,
}: {
  open: boolean;
  issued: IssuedCredential | null;
  isIssuing: boolean;
  onDone: () => void;
}) {
  const handleDownload = () => {
    if (!issued) return;
    downloadTextFile(issued.jwt, issued.id ? `tunnel-${issued.id}.jwt` : 'tunnel-credential.jwt');
    toast.success('Enrollment JWT downloaded.');
  };

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-2xl" showCloseButton={false} data-testid="tunnel-credential-dialog">
        <DialogHeader>
          <DialogTitle>Enrollment JWT</DialogTitle>
          <DialogDescription>Shown once — copy or download it before closing.</DialogDescription>
        </DialogHeader>
        {issued ? (
          <div className="space-y-4" data-testid="tunnel-jwt-reveal">
            <pre
              className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-muted p-3 font-mono text-xs text-foreground"
              data-testid="tunnel-jwt-value"
            >
              {issued.jwt}
            </pre>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyText(issued.jwt, 'Enrollment JWT copied.')}
                data-testid="tunnel-jwt-copy"
              >
                Copy JWT
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownload} data-testid="tunnel-jwt-download">
                Download .jwt
              </Button>
              <Button size="sm" onClick={onDone} data-testid="tunnel-jwt-done">
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="py-6 text-sm text-muted-foreground" data-testid="tunnel-jwt-pending">
            {isIssuing ? 'Issuing credential...' : 'No credential issued.'}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const TUNNEL_GRID = 'grid grid-cols-1 items-center gap-2 md:grid-cols-[minmax(0,2fr)_110px_110px_minmax(0,1fr)_40px]';

function TunnelRow({
  tunnel,
  onDelete,
  isDeleting,
}: {
  tunnel: TunnelCredential;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  // The enrollment window bounds enrolling only, so an enrolled tunnel is past it.
  const expiry =
    tunnel.enrollmentState === TunnelEnrollmentState.ENROLLED
      ? null
      : formatEnrollmentExpiry(tunnel.enrollmentJwtExpiresAt);

  return (
    <div className={cn(TUNNEL_GRID, 'border-t border-border py-3 text-sm')} data-testid="tunnels-row">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-mono text-xs text-foreground">{tunnel.meta?.id ?? EMPTY_PLACEHOLDER}</span>
          {tunnel.provisioningState === ProvisioningState.ACTIVE ? null : (
            <ProvisioningBadge state={tunnel.provisioningState} />
          )}
        </div>
        {expiry ? (
          <div className={cn('mt-1 text-xs', expiry.expired ? 'text-destructive' : 'text-muted-foreground')}>
            {expiry.label}
          </div>
        ) : null}
      </div>
      <div><EnrollmentBadge state={tunnel.enrollmentState} /></div>
      <div><ConnectivityBadge state={tunnel.connectivity} /></div>
      <div className="text-muted-foreground">{formatAge(tunnel.lastSeenAt)}</div>
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Tunnel actions" data-testid="tunnels-row-actions">
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              variant="destructive"
              disabled={isDeleting || !tunnel.meta?.id}
              onSelect={onDelete}
              data-testid="tunnels-row-revoke"
            >
              Revoke tunnel
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
