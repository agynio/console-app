import { NavLink, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { agentsClient, appsClient, organizationsClient, runnersClient, secretsClient } from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MembershipStatus } from '@/gen/agynio/api/organizations/v1/organizations_pb';
import { WorkloadStatus } from '@/gen/agynio/api/runners/v1/runners_pb';
import { useNotifications } from '@/hooks/useNotifications';
import { MAX_PAGE_SIZE } from '@/lib/pagination';

export function OrganizationOverviewTab() {
  const { id } = useParams();
  const organizationId = id ?? '';

  useNotifications({
    events: ['workload.status_changed'],
    invalidateKeys: [['workloads', organizationId, 'overview']],
    enabled: Boolean(organizationId),
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

  const base = `/organizations/${organizationId}`;
  const summary: Array<{ label: string; value: number; to: string }> = [
    { label: 'Active members', value: membersQuery.data?.memberships.length ?? 0, to: `${base}/members` },
    { label: 'Agents', value: agentsQuery.data?.agents.length ?? 0, to: `${base}/agents` },
    { label: 'Secret providers', value: providersQuery.data?.secretProviders.length ?? 0, to: `${base}/secret-providers` },
    { label: 'Secrets', value: secretsQuery.data?.secrets.length ?? 0, to: `${base}/secrets` },
    { label: 'Runners', value: runnersQuery.data?.runners.length ?? 0, to: `${base}/runners` },
    { label: 'Active workloads', value: workloadsQuery.data?.workloads.length ?? 0, to: `${base}/monitoring` },
    { label: 'App installations', value: installationsQuery.data?.installations.length ?? 0, to: `${base}/apps` },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2" data-testid="organization-overview-summary">
        {summary.map((item) => (
          <NavLink
            key={item.label}
            to={item.to}
            className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="organization-overview-card-link"
          >
            <Card
              className="cursor-pointer border-border transition-colors hover:bg-muted"
              data-testid="organization-overview-card"
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{item.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-foreground">{item.value}</div>
              </CardContent>
            </Card>
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
