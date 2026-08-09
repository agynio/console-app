import { useMemo } from 'react';
import { Navigate, NavLink, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CopyIcon } from 'lucide-react';
import { agentsClient, appsClient, organizationsClient, runnersClient, secretsClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { useOrganizationContext } from '@/context/OrganizationContext';
import { MembershipStatus } from '@/gen/agynio/api/organizations/v1/organizations_pb';
import { WorkloadStatus } from '@/gen/agynio/api/runners/v1/runners_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import { copyText } from '@/lib/clipboard';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { OverviewActivity } from '@/pages/overview/OverviewActivity';
import { RecentThreads } from '@/pages/overview/RecentThreads';
import { RunningNow } from '@/pages/overview/RunningNow';
import { isSetupSkipped } from '@/pages/setup/skipped';

export function OrganizationOverviewTab() {
  useDocumentTitle('Overview');

  const { id } = useParams();
  const organizationId = id ?? '';
  // RequireOrganization has already resolved the URL id against the caller's
  // organizations, so this lookup needs no request of its own.
  const { organizations } = useOrganizationContext();
  const organizationName = organizations.find((organization) => organization.id === organizationId)?.name ?? '';
  const notificationRooms = useMemo(
    () => (organizationId ? [`organization:${organizationId}`] : []),
    [organizationId],
  );

  useNotifications({
    events: ['workload.updated'],
    invalidateKeys: [['workloads', organizationId, 'overview']],
    rooms: notificationRooms,
    enabled: Boolean(organizationId) && notificationRooms.length > 0,
  });

  const membersQuery = useQuery({
    queryKey: ['organizations', organizationId, 'members', 'overview'],
    queryFn: () =>
      organizationsClient.listMembers({
        organizationId,
        status: MembershipStatus.ACTIVE,
        pageSize: MAX_PAGE_SIZE,
        pageToken: '',
      }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const providersQuery = useQuery({
    queryKey: ['secrets', organizationId, 'providers', 'overview'],
    queryFn: () => secretsClient.listSecretProviders({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const secretsQuery = useQuery({
    queryKey: ['secrets', organizationId, 'list', 'overview'],
    queryFn: () =>
      secretsClient.listSecrets({
        organizationId,
        pageSize: MAX_PAGE_SIZE,
        pageToken: '',
        secretProviderId: '',
      }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const runnersQuery = useQuery({
    queryKey: ['runners', organizationId, 'list', 'overview'],
    queryFn: () => runnersClient.listRunners({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const workloadsQuery = useQuery({
    queryKey: ['workloads', organizationId, 'overview'],
    queryFn: () =>
      runnersClient.listWorkloads({
        organizationId,
        pageSize: MAX_PAGE_SIZE,
        pageToken: '',
        statuses: [WorkloadStatus.STARTING, WorkloadStatus.RUNNING],
      }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const agentsQuery = useQuery({
    queryKey: ['agents', organizationId, 'overview'],
    queryFn: () => agentsClient.listAgents({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const installationsQuery = useQuery({
    queryKey: ['installations', organizationId, 'overview'],
    queryFn: () =>
      appsClient.listInstallations({ organizationId, appId: '', pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const sandboxesQuery = useQuery({
    queryKey: ['sandboxes', organizationId, 'overview'],
    queryFn: () => agentsClient.listSandboxes({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // Counters on an organization that has produced nothing yet are a grid of
  // zeroes, so an empty organization opens setup instead of offering it. Once
  // it holds an agent or a sandbox — or the user has skipped — this is an
  // ordinary Overview again.
  const preSetup =
    !agentsQuery.isPending &&
    !sandboxesQuery.isPending &&
    (agentsQuery.data?.agents.length ?? 0) === 0 &&
    (sandboxesQuery.data?.sandboxes.length ?? 0) === 0 &&
    !isSetupSkipped(organizationId);

  const base = `/organizations/${organizationId}`;
  const summary: Array<{ label: string; value: number; to: string }> = [
    { label: 'Active members', value: membersQuery.data?.memberships.length ?? 0, to: `${base}/members` },
    { label: 'Agents', value: agentsQuery.data?.agents.length ?? 0, to: `${base}/agents` },
    { label: 'Secret providers', value: providersQuery.data?.secretProviders.length ?? 0, to: `${base}/secret-providers` },
    { label: 'Secrets', value: secretsQuery.data?.secrets.length ?? 0, to: `${base}/secrets` },
    { label: 'Runners', value: runnersQuery.data?.runners.length ?? 0, to: `${base}/runners` },
    { label: 'Active workloads', value: workloadsQuery.data?.workloads.length ?? 0, to: `${base}/workloads` },
    { label: 'App installations', value: installationsQuery.data?.installations.length ?? 0, to: `${base}/apps` },
  ];

  if (preSetup) {
    return <Navigate to={`${base}/setup`} replace />;
  }

  return (
    <div className="space-y-4">
      {/* The identity is a lookup, not a headline: it earns a row, and the
          activity below it earns the rest of the page. */}
      <div
        className="flex flex-wrap items-start justify-between gap-3"
        data-testid="organization-overview-identity"
      >
        <h2 className="text-lg font-semibold text-foreground">{organizationName || 'Organization'}</h2>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="font-mono text-xs break-all text-muted-foreground" data-testid="organization-overview-id">
              {organizationId}
            </div>
            <p className="text-xs text-muted-foreground">
              The <code className="font-mono">organization_id</code> the Terraform provider and the API take.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => copyText(organizationId, 'Organization ID copied.')}
            data-testid="organization-overview-id-copy"
          >
            <CopyIcon className="h-4 w-4" />
            Copy ID
          </Button>
        </div>
      </div>

      <OverviewActivity
        organizationId={organizationId}
        runnerCount={runnersQuery.data?.runners.length ?? 0}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <RunningNow
          organizationId={organizationId}
          workloads={workloadsQuery.data?.workloads ?? []}
          isPending={workloadsQuery.isPending}
          isError={workloadsQuery.isError}
        />
        <RecentThreads organizationId={organizationId} />
      </div>

      {/* The counters keep their links; they no longer keep the page. */}
      <div
        className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7"
        data-testid="organization-overview-summary"
      >
        {summary.map((item) => (
          <NavLink
            key={item.label}
            to={item.to}
            className="rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="organization-overview-card-link"
          >
            <div className="truncate text-xs text-muted-foreground" title={item.label}>
              {item.label}
            </div>
            <div className="text-lg font-semibold text-foreground" data-testid="organization-overview-card">
              {item.value}
            </div>
          </NavLink>
        ))}
      </div>
      {(membersQuery.isError ||
        providersQuery.isError ||
        secretsQuery.isError ||
        runnersQuery.isError ||
        workloadsQuery.isError ||
        agentsQuery.isError ||
        installationsQuery.isError) && (
        <div className="text-sm text-muted-foreground">Failed to load organization metrics.</div>
      )}
    </div>
  );
}
