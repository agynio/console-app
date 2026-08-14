import { useState } from 'react';
import { CopyIcon, MoreHorizontalIcon } from 'lucide-react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { egressClient, networksClient } from '@/api/client';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DetailField } from '@/components/DetailField';
import { DetailPageHeader } from '@/components/DetailPageHeader';
import { GrantDialog } from '@/components/GrantDialog';
import { ProvisioningBadge } from '@/components/NetworkBadges';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { PrivateResource, PrivateResourceAccess } from '@/gen/agynio/api/networks/v1/networks_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { usePrincipalOptions, type PrincipalOption } from '@/hooks/usePrincipalOptions';
import { copyText } from '@/lib/clipboard';
import { EMPTY_PLACEHOLDER, formatDateOnly } from '@/lib/format';
import { buildConnectionString, formatPrincipalType, formatProtocol } from '@/lib/networks';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { ResourceDialog, type ResourceDialogValues } from '@/pages/OrganizationPrivateResourcesPage';

export function PrivateResourceDetailPage() {
  useDocumentTitle('Private Resource');

  const { id, resourceId } = useParams();
  const organizationId = id ?? '';
  const privateResourceId = resourceId ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

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
    mutationFn: (values: ResourceDialogValues) =>
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
      setEditOpen(false);
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
    <div className="space-y-3">
      <DetailPageHeader
        parentLabel="Private resources"
        parentHref={resourcesBase}
        title={resource.name}
        badge={<ProvisioningBadge state={resource.provisioningState} />}
        meta={
          <>
            {formatProtocol(resource.protocol)} · reached through{' '}
            <NavLink
              to={`/organizations/${organizationId}/private-networks/${resource.networkId}`}
              className="text-primary hover:underline"
              data-testid="private-resource-network-link"
            >
              {networkName}
            </NavLink>
          </>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} data-testid="private-resource-edit">
              Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" aria-label="More actions" data-testid="private-resource-actions">
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setDeleteOpen(true)}
                  data-testid="private-resource-delete"
                >
                  Delete resource
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
        testId="private-resource-header"
        className="mb-4"
      />
      <Card className="py-4">
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <DetailField label="Connection string" testId="resource-connection-string">
            <span className="font-mono">{connectionString}</span>
          </DetailField>
          <Button
            variant="outline"
            size="icon"
            aria-label="Copy connection string"
            onClick={() => copyText(connectionString, 'Connection string copied.')}
            data-testid="resource-connection-string-copy"
          >
            <CopyIcon />
          </Button>
        </CardContent>
      </Card>
      <Card className="py-4">
        <CardContent className="space-y-4">
          <DetailField label="Mapping" testId="resource-detail-mapping">
            <ResourceMapping resource={resource} />
          </DetailField>
          <div className="grid gap-4 border-t border-border pt-4 md:grid-cols-3">
            <DetailField label="Network" testId="resource-detail-network">
              <NavLink
                to={`/organizations/${organizationId}/private-networks/${resource.networkId}`}
                className="text-primary hover:underline"
              >
                {networkName}
              </NavLink>
            </DetailField>
            <DetailField label="Created" testId="resource-detail-created">
              {formatDateOnly(resource.meta?.createdAt)}
            </DetailField>
            <DetailField label="Resource ID" testId="resource-detail-id">
              <span className="font-mono text-xs text-muted-foreground">{resource.meta?.id || EMPTY_PLACEHOLDER}</span>
            </DetailField>
          </div>
        </CardContent>
      </Card>
      <ResourceDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit private resource"
        description="The target this resource reaches and the intercept it is reached on."
        submitLabel="Save changes"
        pendingLabel="Saving..."
        networkName={networkName}
        initialValues={{
          networkId: resource.networkId,
          name: resource.name,
          protocol: resource.protocol,
          targetHost: resource.targetHost,
          targetPorts: resource.targetPorts,
          interceptHost: resource.interceptHost,
          interceptPorts: resource.interceptPorts,
        }}
        onSubmit={(values) => updateMutation.mutate(values)}
        isSubmitting={updateMutation.isPending}
        testIdPrefix="resource-detail-edit"
      />
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

/** Intercept and target are one relationship, paired by position, so they are stated as pairs. */
function ResourceMapping({ resource }: { resource: PrivateResource }) {
  if (resource.interceptPorts.length === 0) return <span>{EMPTY_PLACEHOLDER}</span>;

  return (
    <div className="space-y-1">
      {resource.interceptPorts.map((port, index) => (
        <div key={port} className="flex flex-wrap items-center gap-2 font-mono text-sm">
          <span>
            {resource.interceptHost}:{port}
          </span>
          <span className="text-muted-foreground">→</span>
          <span>
            {resource.targetHost}:{resource.targetPorts[index] ?? EMPTY_PLACEHOLDER}
          </span>
        </div>
      ))}
      <p className="font-sans text-xs text-muted-foreground">intercept → target</p>
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
    <Card className="gap-4 py-4" data-testid="resource-grants-card">
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
          <div className="border-t border-border pt-3 text-sm text-muted-foreground" data-testid="resource-grants-empty">
            No principals can access this resource.
          </div>
        ) : null}
        {grants.length > 0 ? (
          <div className="divide-y divide-border border-t border-border">
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
        <RuleAccessList organizationId={organizationId} privateResourceId={privateResourceId} />
        <GrantDialog
          open={grantDialogOpen}
          onOpenChange={setGrantDialogOpen}
          options={principalOptions.options}
          existingGrants={grants}
          onSubmit={(option) => createGrantMutation.mutate(option)}
          isSubmitting={createGrantMutation.isPending}
        />
      </CardContent>
    </Card>
  );
}

// The list answers "who can reach this?", so principals reaching the resource
// through an attached egress rule appear beside the grants, labelled with
// their source. Revoking is done where the access came from: detach the rule.
function RuleAccessList({ organizationId, privateResourceId }: { organizationId: string; privateResourceId: string }) {
  const ruleAccessQuery = useQuery({
    queryKey: ['private-resources', organizationId, privateResourceId, 'rule-access'],
    queryFn: async () => {
      const rules = await egressClient.listEgressRules({
        organizationId,
        privateResourceId,
        pageSize: MAX_PAGE_SIZE,
        pageToken: '',
      });
      const perRule = await Promise.all(
        (rules.egressRules ?? []).map(async (rule) => {
          const ruleId = rule.meta?.id ?? '';
          if (!ruleId) return [];
          const attachments = await egressClient.listEgressRuleAttachments({
            organizationId,
            ruleId,
            pageSize: MAX_PAGE_SIZE,
            pageToken: '',
          });
          return (attachments.egressRuleAttachments ?? []).map((attachment) => ({
            key: attachment.meta?.id ?? `${ruleId}:${attachment.target.value ?? ''}`,
            ruleName: rule.name || ruleId,
            targetKind: attachment.target.case === 'environmentId' ? 'Environment' : 'Agent',
            targetId: attachment.target.case === undefined ? attachment.agentId : attachment.target.value,
          }));
        }),
      );
      return perRule.flat();
    },
    enabled: Boolean(organizationId && privateResourceId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const entries = ruleAccessQuery.data ?? [];
  if (ruleAccessQuery.isPending || ruleAccessQuery.isError || entries.length === 0) return null;
  return (
    <div className="space-y-2" data-testid="resource-rule-access">
      <div>
        <h4 className="text-sm font-semibold text-foreground">Access through egress rules</h4>
        <p className="text-xs text-muted-foreground">Revoke by detaching the rule on the Egress Rules tab.</p>
      </div>
      <div className="divide-y divide-border border-t border-border">
        {entries.map((entry) => (
          <div key={entry.key} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm" data-testid="resource-rule-access-row">
            <div className="min-w-0">
              <div className="font-medium text-foreground">{entry.targetKind}</div>
              <div className="truncate text-xs text-muted-foreground">
                <span className="font-mono">{entry.targetId}</span> · via rule {entry.ruleName}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
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
    <div className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm" data-testid="resource-grant-row">
      <div className="min-w-0">
        <div className="font-medium text-foreground">{label}</div>
        <div className="truncate text-xs text-muted-foreground">
          {formatPrincipalType(grant.principalType)} · <span className="font-mono">{grant.principalId}</span>
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
