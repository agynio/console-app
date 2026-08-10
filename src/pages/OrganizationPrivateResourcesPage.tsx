import { useEffect, useMemo, useState } from 'react';
import { NavLink, useParams, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { networksClient } from '@/api/client';
import { LoadMoreButton } from '@/components/LoadMoreButton';
import { MultiSelectFilter } from '@/components/MultiSelectFilter';
import { ProvisioningBadge } from '@/components/NetworkBadges';
import { SortableHeader } from '@/components/SortableHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { PrivateResourceProtocol, type PrivateResource } from '@/gen/agynio/api/networks/v1/networks_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useListControls } from '@/hooks/useListControls';
import { EMPTY_PLACEHOLDER } from '@/lib/format';
import { formatPortMapping, formatProtocol, formatProvisioningState, parsePorts } from '@/lib/networks';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/pagination';

export type ResourceDialogValues = {
  networkId: string;
  name: string;
  protocol: PrivateResourceProtocol;
  targetHost: string;
  targetPorts: number[];
  interceptHost: string;
  interceptPorts: number[];
};

type NetworkOption = { id: string; name: string };

export function OrganizationPrivateResourcesPage() {
  useDocumentTitle('Private Resources');

  const { id } = useParams();
  const organizationId = id ?? '';
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  // The network filter lives in the URL so a filtered list can be linked to
  // from a network's detail page and shared.
  const [searchParams, setSearchParams] = useSearchParams();
  const networkFilter = useMemo(() => searchParams.getAll('network'), [searchParams]);
  const setNetworkFilter = (networkIds: string[]) => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('network');
        networkIds.forEach((networkId) => next.append('network', networkId));
        return next;
      },
      { replace: true },
    );
  };

  // Resources are unique per (organization, intercept host, port), so the
  // organization — not the network — is the natural scope for this list.
  const resourcesQuery = useInfiniteQuery({
    queryKey: ['private-resources', organizationId, 'list'],
    queryFn: ({ pageParam }) =>
      networksClient.listPrivateResources({ organizationId, pageSize: DEFAULT_PAGE_SIZE, pageToken: pageParam }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const networksQuery = useQuery({
    queryKey: ['private-networks', organizationId, 'options'],
    queryFn: () => networksClient.listNetworks({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const networkOptions = useMemo<NetworkOption[]>(
    () =>
      (networksQuery.data?.networks ?? [])
        .flatMap((network) => (network.meta?.id ? [{ id: network.meta.id, name: network.name }] : []))
        .sort((left, right) => left.name.localeCompare(right.name)),
    [networksQuery.data?.networks],
  );
  const networkNameById = useMemo(
    () => new Map(networkOptions.map((option) => [option.id, option.name])),
    [networkOptions],
  );
  const networkName = (networkId: string) => networkNameById.get(networkId) ?? networkId;

  const createMutation = useMutation({
    mutationFn: ({ networkId, ...values }: ResourceDialogValues) =>
      networksClient.createPrivateResource({ networkId, ...values }),
    onSuccess: () => {
      toast.success('Private resource created.');
      setCreateOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['private-resources', organizationId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to create private resource.'),
  });

  const resources = useMemo(
    () => resourcesQuery.data?.pages.flatMap((page) => page.privateResources) ?? [],
    [resourcesQuery.data?.pages],
  );

  const filteredByNetwork = useMemo(
    () => (networkFilter.length === 0 ? resources : resources.filter((resource) => networkFilter.includes(resource.networkId))),
    [networkFilter, resources],
  );

  const listControls = useListControls({
    items: filteredByNetwork,
    searchFields: [
      (resource) => resource.name,
      (resource) => resource.interceptHost,
      (resource) => resource.targetHost,
      (resource) => networkName(resource.networkId),
      (resource) => resource.meta?.id ?? '',
      (resource) => formatProtocol(resource.protocol),
      (resource) => formatProvisioningState(resource.provisioningState),
    ],
    sortOptions: {
      name: (resource) => resource.name,
      network: (resource) => networkName(resource.networkId),
      protocol: (resource) => formatProtocol(resource.protocol),
      state: (resource) => formatProvisioningState(resource.provisioningState),
    },
    defaultSortKey: 'name',
  });

  const visibleResources = listControls.filteredItems;
  const hasActiveFilters = networkFilter.length > 0 || listControls.searchTerm.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="max-w-sm flex-1">
            <Input
              placeholder="Search private resources..."
              value={listControls.searchTerm}
              onChange={(event) => listControls.setSearchTerm(event.target.value)}
              data-testid="private-resources-search"
            />
          </div>
          <div className="min-w-[180px]">
            <MultiSelectFilter
              label="Network"
              options={networkOptions.map((option) => ({ value: option.id, label: option.name }))}
              selectedValues={networkFilter}
              onChange={setNetworkFilter}
              testId="private-resources-network-filter"
            />
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCreateOpen(true)}
          disabled={networkOptions.length === 0}
          data-testid="private-resources-create"
        >
          Add resource
        </Button>
      </div>
      {resourcesQuery.isPending ? (
        <div className="text-sm text-muted-foreground">Loading private resources...</div>
      ) : null}
      {resourcesQuery.isError ? (
        <div className="text-sm text-muted-foreground">Failed to load private resources.</div>
      ) : null}
      {resources.length === 0 && !resourcesQuery.isPending && !resourcesQuery.isError ? (
        <Card className="border-border" data-testid="private-resources-empty">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {networkOptions.length === 0
              ? 'Create a private network before adding resources.'
              : 'No private resources configured.'}
          </CardContent>
        </Card>
      ) : null}
      {resources.length > 0 ? (
        <Card className="border-border" data-testid="private-resources-table">
          <CardContent className="px-0">
            <div className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[2fr_1fr_2fr_1fr_1fr]">
              <SortableHeader
                label="Resource"
                sortKey="name"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Network"
                sortKey="network"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <span>Mapping</span>
              <SortableHeader
                label="Protocol"
                sortKey="protocol"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Provisioning"
                sortKey="state"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
            </div>
            <div className="divide-y divide-border">
              {visibleResources.length === 0 ? (
                <div className="px-6 py-6 text-sm text-muted-foreground">
                  {hasActiveFilters ? 'No results found.' : 'No private resources configured.'}
                </div>
              ) : (
                visibleResources.map((resource) => (
                  <ResourceRow
                    key={resource.meta?.id ?? `${resource.networkId}:${resource.name}`}
                    organizationId={organizationId}
                    resource={resource}
                    networkName={networkName(resource.networkId)}
                  />
                ))
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}
      <LoadMoreButton
        hasMore={resourcesQuery.hasNextPage}
        isLoading={resourcesQuery.isFetchingNextPage}
        onClick={() => {
          void resourcesQuery.fetchNextPage();
        }}
      />
      <ResourceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Add private resource"
        description="Expose a private target through a network using an intercept hostname."
        submitLabel="Create resource"
        pendingLabel="Creating..."
        networks={networkOptions}
        initialValues={emptyResourceValues}
        onSubmit={(values) => createMutation.mutate(values)}
        isSubmitting={createMutation.isPending}
        testIdPrefix="resource-create"
      />
    </div>
  );
}

function ResourceRow({
  organizationId,
  resource,
  networkName,
}: {
  organizationId: string;
  resource: PrivateResource;
  networkName: string;
}) {
  const resourceId = resource.meta?.id;

  return (
    <div className="grid gap-2 px-6 py-4 text-sm md:grid-cols-[2fr_1fr_2fr_1fr_1fr]" data-testid="private-resources-row">
      <div>
        {resourceId ? (
          <NavLink
            className="font-medium text-primary hover:underline"
            to={`/organizations/${organizationId}/private-resources/${resourceId}`}
            data-testid="private-resources-row-link"
          >
            {resource.name}
          </NavLink>
        ) : (
          <span className="font-medium text-foreground">{resource.name}</span>
        )}
        <div className="text-xs text-muted-foreground">{resourceId || 'No ID'}</div>
      </div>
      <div className="text-muted-foreground" data-testid="private-resources-row-network">
        <NavLink
          className="hover:underline"
          to={`/organizations/${organizationId}/private-networks/${resource.networkId}`}
        >
          {networkName}
        </NavLink>
      </div>
      <div className="break-all text-muted-foreground">{formatPortMapping(resource) || EMPTY_PLACEHOLDER}</div>
      <div className="text-muted-foreground">{formatProtocol(resource.protocol)}</div>
      <div>
        <ProvisioningBadge state={resource.provisioningState} />
      </div>
    </div>
  );
}

const emptyResourceValues: ResourceDialogValues = {
  networkId: '',
  name: '',
  protocol: PrivateResourceProtocol.TCP,
  targetHost: '',
  targetPorts: [],
  interceptHost: '',
  interceptPorts: [],
};

/** Ports are edited as the comma-separated lists they are typed in. */
function toFormValues(values: ResourceDialogValues) {
  return {
    networkId: values.networkId,
    name: values.name,
    protocol: `${values.protocol}`,
    targetHost: values.targetHost,
    targetPorts: values.targetPorts.join(', '),
    interceptHost: values.interceptHost,
    interceptPorts: values.interceptPorts.join(', '),
  };
}

/** The dialog the list creates with and the detail page edits with, so both take the same form. */
export function ResourceDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  pendingLabel,
  networks,
  // Set when the network cannot change: an update keeps the resource where it is.
  networkName,
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
  networks?: NetworkOption[];
  networkName?: string;
  initialValues: ResourceDialogValues;
  onSubmit: (values: ResourceDialogValues) => void;
  isSubmitting: boolean;
  testIdPrefix: string;
}) {
  const [values, setValues] = useState(() => toFormValues(initialValues));
  const [error, setError] = useState('');
  const signature = JSON.stringify(initialValues);

  // Each opening starts from the resource as it is now, not from the last edit.
  // Read back from the signature so this follows the values, not the object.
  useEffect(() => {
    if (!open) return;
    setValues(toFormValues(JSON.parse(signature) as ResourceDialogValues));
    setError('');
  }, [open, signature]);

  const update = (patch: Partial<typeof values>) => {
    setValues((current) => ({ ...current, ...patch }));
    setError('');
  };

  const handleSubmit = () => {
    const targetPorts = parsePorts(values.targetPorts);
    const interceptPorts = parsePorts(values.interceptPorts);
    if (!values.networkId) {
      setError('Select the network this resource is reached through.');
      return;
    }
    if (!values.name.trim() || !values.targetHost.trim() || !values.interceptHost.trim()) {
      setError('Name, target host, and intercept host are required.');
      return;
    }
    if (targetPorts.length === 0 || interceptPorts.length === 0 || targetPorts.length !== interceptPorts.length) {
      setError('Target and intercept ports must be non-empty lists with matching length.');
      return;
    }
    onSubmit({
      networkId: values.networkId,
      name: values.name.trim(),
      protocol: Number(values.protocol) as PrivateResourceProtocol,
      targetHost: values.targetHost.trim(),
      targetPorts,
      interceptHost: values.interceptHost.trim(),
      interceptPorts,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={`${testIdPrefix}-dialog`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>Network</Label>
            {networkName ? (
              <div className="flex h-9 items-center text-sm text-muted-foreground" data-testid={`${testIdPrefix}-network`}>
                {networkName}
              </div>
            ) : (
              <Select value={values.networkId} onValueChange={(networkId) => update({ networkId })}>
                <SelectTrigger className="w-full" data-testid={`${testIdPrefix}-network`}>
                  <SelectValue placeholder="Select a network" />
                </SelectTrigger>
                <SelectContent>
                  {(networks ?? []).map((network) => (
                    <SelectItem key={network.id} value={network.id}>
                      {network.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={values.name}
              onChange={(event) => update({ name: event.target.value })}
              data-testid={`${testIdPrefix}-name`}
            />
          </div>
          <div className="space-y-2">
            <Label>Protocol</Label>
            <Select value={values.protocol} onValueChange={(protocol) => update({ protocol })}>
              <SelectTrigger className="w-full" data-testid={`${testIdPrefix}-protocol`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={`${PrivateResourceProtocol.TCP}`}>TCP</SelectItem>
                <SelectItem value={`${PrivateResourceProtocol.HTTP}`}>HTTP</SelectItem>
                <SelectItem value={`${PrivateResourceProtocol.HTTPS}`}>HTTPS</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* Host beside its own ports: the two lists pair by position. */}
          <div className="space-y-2">
            <Label>Intercept host</Label>
            <Input
              value={values.interceptHost}
              onChange={(event) => update({ interceptHost: event.target.value })}
              placeholder="postgres.private.example"
              data-testid={`${testIdPrefix}-intercept-host`}
            />
          </div>
          <div className="space-y-2">
            <Label>Intercept ports</Label>
            <Input
              value={values.interceptPorts}
              onChange={(event) => update({ interceptPorts: event.target.value })}
              placeholder="5432"
              data-testid={`${testIdPrefix}-intercept-ports`}
            />
          </div>
          <div className="space-y-2">
            <Label>Target host</Label>
            <Input
              value={values.targetHost}
              onChange={(event) => update({ targetHost: event.target.value })}
              placeholder="postgres.internal"
              data-testid={`${testIdPrefix}-target-host`}
            />
          </div>
          <div className="space-y-2">
            <Label>Target ports</Label>
            <Input
              value={values.targetPorts}
              onChange={(event) => update({ targetPorts: event.target.value })}
              placeholder="5432"
              data-testid={`${testIdPrefix}-target-ports`}
            />
          </div>
          {error ? <p className="text-xs text-destructive md:col-span-2">{error}</p> : null}
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
