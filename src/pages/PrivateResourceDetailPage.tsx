import { useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { networksClient } from '@/api/client';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { GrantDialog } from '@/components/GrantDialog';
import { ProvisioningBadge } from '@/components/NetworkBadges';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  PrivateResourceProtocol,
  type PrivateResource,
  type PrivateResourceAccess,
} from '@/gen/agynio/api/networks/v1/networks_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { usePrincipalOptions, type PrincipalOption } from '@/hooks/usePrincipalOptions';
import { copyText } from '@/lib/clipboard';
import { EMPTY_PLACEHOLDER, formatDateOnly } from '@/lib/format';
import { buildConnectionString, formatPrincipalType, formatProtocol, parsePorts } from '@/lib/networks';
import { MAX_PAGE_SIZE } from '@/lib/pagination';

type ResourceFormValues = {
  name: string;
  protocol: PrivateResourceProtocol;
  targetHost: string;
  targetPorts: number[];
  interceptHost: string;
  interceptPorts: number[];
};

export function PrivateResourceDetailPage() {
  useDocumentTitle('Private Resource');

  const { id, resourceId } = useParams();
  const organizationId = id ?? '';
  const privateResourceId = resourceId ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const resourcesBase = `/organizations/${organizationId}/private-resources`;

  const resourceQuery = useQuery({
    queryKey: ['private-resources', organizationId, privateResourceId],
    queryFn: () => networksClient.getPrivateResource({ id: privateResourceId }),
    enabled: Boolean(privateResourceId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const resource = resourceQuery.data?.privateResource;

  const networkQuery = useQuery({
    queryKey: ['private-networks', organizationId, resource?.networkId ?? ''],
    queryFn: () => networksClient.getNetwork({ id: resource?.networkId ?? '' }),
    enabled: Boolean(resource?.networkId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const updateMutation = useMutation({
    mutationFn: (values: ResourceFormValues) =>
      networksClient.updatePrivateResource({
        id: privateResourceId,
        name: values.name,
        protocol: values.protocol,
        targetHost: values.targetHost,
        interceptHost: values.interceptHost,
        targetPortsUpdate: { ports: values.targetPorts },
        interceptPortsUpdate: { ports: values.interceptPorts },
      }),
    onSuccess: () => {
      toast.success('Private resource updated.');
      void queryClient.invalidateQueries({ queryKey: ['private-resources', organizationId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to update private resource.'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => networksClient.deletePrivateResource({ id: privateResourceId }),
    onSuccess: () => {
      toast.success('Private resource deleted.');
      void queryClient.invalidateQueries({ queryKey: ['private-resources', organizationId] });
      void navigate(resourcesBase);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to delete private resource.'),
  });

  if (resourceQuery.isPending) return <div className="text-sm text-muted-foreground">Loading private resource...</div>;
  if (resourceQuery.isError || !resource) {
    return <div className="text-sm text-muted-foreground">Failed to load private resource.</div>;
  }

  const connectionString = buildConnectionString(resource);
  const networkName = networkQuery.data?.network?.name ?? resource.networkId;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild data-testid="private-resource-back">
          <NavLink to={resourcesBase}>Back to private resources</NavLink>
        </Button>
        <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)} data-testid="private-resource-delete">
          Delete resource
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {resource.name}
            <ProvisioningBadge state={resource.provisioningState} />
          </CardTitle>
          <div className="text-sm text-muted-foreground">
            {formatProtocol(resource.protocol)} · reached through{' '}
            <NavLink
              to={`/organizations/${organizationId}/private-networks/${resource.networkId}`}
              className="text-primary hover:underline"
              data-testid="private-resource-network-link"
            >
              {networkName}
            </NavLink>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Connection string
                </div>
                <div className="mt-1 break-all text-sm" data-testid="resource-connection-string">
                  {connectionString}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyText(connectionString, 'Connection string copied.')}
                data-testid="resource-connection-string-copy"
              >
                Copy connection string
              </Button>
            </div>
          </div>
          <ResourceSettingsForm
            key={resource.meta?.id ?? privateResourceId}
            resource={resource}
            onSubmit={(values) => updateMutation.mutate(values)}
            isSubmitting={updateMutation.isPending}
          />
        </CardContent>
      </Card>
      <ResourceGrantsCard organizationId={organizationId} privateResourceId={privateResourceId} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete private resource?"
        description="This removes the resource and every access grant on it."
        confirmLabel="Delete resource"
        variant="danger"
        onConfirm={() => deleteMutation.mutate()}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}

function ResourceSettingsForm({
  resource,
  onSubmit,
  isSubmitting,
}: {
  resource: PrivateResource;
  onSubmit: (values: ResourceFormValues) => void;
  isSubmitting: boolean;
}) {
  const [values, setValues] = useState({
    name: resource.name,
    protocol: `${resource.protocol}`,
    targetHost: resource.targetHost,
    targetPorts: resource.targetPorts.join(', '),
    interceptHost: resource.interceptHost,
    interceptPorts: resource.interceptPorts.join(', '),
  });
  const [error, setError] = useState('');

  const update = (patch: Partial<typeof values>) => {
    setValues((current) => ({ ...current, ...patch }));
    setError('');
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
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="resource-detail-name">Name</Label>
        <Input
          id="resource-detail-name"
          value={values.name}
          onChange={(event) => update({ name: event.target.value })}
          data-testid="resource-detail-name"
        />
      </div>
      <div className="space-y-2">
        <Label>Protocol</Label>
        <Select value={values.protocol} onValueChange={(protocol) => update({ protocol })}>
          <SelectTrigger className="w-full" data-testid="resource-detail-protocol">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={`${PrivateResourceProtocol.TCP}`}>TCP</SelectItem>
            <SelectItem value={`${PrivateResourceProtocol.HTTP}`}>HTTP</SelectItem>
            <SelectItem value={`${PrivateResourceProtocol.HTTPS}`}>HTTPS</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="resource-detail-target-host">Target host</Label>
        <Input
          id="resource-detail-target-host"
          value={values.targetHost}
          onChange={(event) => update({ targetHost: event.target.value })}
          data-testid="resource-detail-target-host"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="resource-detail-target-ports">Target ports</Label>
        <Input
          id="resource-detail-target-ports"
          value={values.targetPorts}
          onChange={(event) => update({ targetPorts: event.target.value })}
          data-testid="resource-detail-target-ports"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="resource-detail-intercept-host">Intercept host</Label>
        <Input
          id="resource-detail-intercept-host"
          value={values.interceptHost}
          onChange={(event) => update({ interceptHost: event.target.value })}
          data-testid="resource-detail-intercept-host"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="resource-detail-intercept-ports">Intercept ports</Label>
        <Input
          id="resource-detail-intercept-ports"
          value={values.interceptPorts}
          onChange={(event) => update({ interceptPorts: event.target.value })}
          data-testid="resource-detail-intercept-ports"
        />
      </div>
      <div className="space-y-2">
        <Label>Created</Label>
        <div className="rounded-md border border-input px-3 py-2 text-sm">{formatDateOnly(resource.meta?.createdAt)}</div>
      </div>
      <div className="space-y-2">
        <Label>Resource ID</Label>
        <div className="rounded-md border border-input px-3 py-2 text-sm break-all">
          {resource.meta?.id || EMPTY_PLACEHOLDER}
        </div>
      </div>
      {error ? <p className="text-xs text-destructive md:col-span-2">{error}</p> : null}
      <div className="md:col-span-2">
        <Button onClick={handleSubmit} disabled={isSubmitting} data-testid="resource-detail-save">
          {isSubmitting ? 'Saving...' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}

function ResourceGrantsCard({
  organizationId,
  privateResourceId,
}: {
  organizationId: string;
  privateResourceId: string;
}) {
  const queryClient = useQueryClient();
  const [grantDialogOpen, setGrantDialogOpen] = useState(false);
  const principalOptions = usePrincipalOptions(organizationId);

  const grantsQueryKey = ['private-resources', organizationId, privateResourceId, 'grants'];
  const grantsQuery = useQuery({
    queryKey: grantsQueryKey,
    queryFn: () =>
      networksClient.listPrivateResourceAccess({ privateResourceId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(privateResourceId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const createGrantMutation = useMutation({
    mutationFn: (option: PrincipalOption) =>
      networksClient.createPrivateResourceAccess({
        privateResourceId,
        principalType: option.type,
        principalId: option.id,
      }),
    onSuccess: () => {
      toast.success('Resource grant created.');
      setGrantDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: grantsQueryKey });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to create resource grant.'),
  });

  const deleteGrantMutation = useMutation({
    mutationFn: (grantId: string) => networksClient.deletePrivateResourceAccess({ id: grantId }),
    onSuccess: () => {
      toast.success('Resource grant removed.');
      void queryClient.invalidateQueries({ queryKey: grantsQueryKey });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to remove resource grant.'),
  });

  const grants = grantsQuery.data?.privateResourceAccess ?? [];

  return (
    <Card data-testid="resource-grants-card">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>Access grants</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Principals that may reach this resource.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setGrantDialogOpen(true)} data-testid="resource-grant-add">
          Add grant
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {grantsQuery.isPending ? <div className="text-sm text-muted-foreground">Loading access grants...</div> : null}
        {grantsQuery.isError ? <div className="text-sm text-muted-foreground">Failed to load access grants.</div> : null}
        {grants.length === 0 && !grantsQuery.isPending && !grantsQuery.isError ? (
          <div className="rounded-md border border-border p-3 text-sm text-muted-foreground" data-testid="resource-grants-empty">
            No principals can access this resource.
          </div>
        ) : null}
        {grants.length > 0 ? (
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
        ) : null}
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
        <Button variant="ghost" size="sm" onClick={onDelete} disabled={isDeleting || !grant.meta?.id}>
          Remove
        </Button>
      </div>
    </div>
  );
}

function formatGrantLabel(grant: PrivateResourceAccess, options: PrincipalOption[]) {
  return (
    options.find((option) => option.type === grant.principalType && option.id === grant.principalId)?.label ??
    grant.principalId
  );
}
