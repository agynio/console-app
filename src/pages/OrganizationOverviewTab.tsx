import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { organizationsClient, runnersClient, secretsClient } from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MembershipStatus } from '@/gen/agynio/api/organizations/v1/organizations_pb';
import { MAX_PAGE_SIZE } from '@/lib/pagination';

export function OrganizationOverviewTab() {
  const { id } = useParams();
  const organizationId = id ?? '';

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
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const providersQuery = useQuery({
    queryKey: ['secrets', organizationId, 'providers', 'overview'],
    queryFn: () => secretsClient.listSecretProviders({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60 * 1000,
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
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const runnersQuery = useQuery({
    queryKey: ['runners', organizationId, 'list', 'overview'],
    queryFn: () => runnersClient.listRunners({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const summary = [
    { label: 'Active members', value: membersQuery.data?.memberships.length ?? 0 },
    { label: 'Secret providers', value: providersQuery.data?.secretProviders.length ?? 0 },
    { label: 'Secrets', value: secretsQuery.data?.secrets.length ?? 0 },
    { label: 'Runners', value: runnersQuery.data?.runners.length ?? 0 },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2" data-testid="organization-overview-summary">
        {summary.map((item) => (
          <Card key={item.label} className="border-[var(--agyn-border-subtle)]" data-testid="organization-overview-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-[var(--agyn-gray)]">{item.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-[var(--agyn-dark)]">{item.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      {(membersQuery.isError || providersQuery.isError || secretsQuery.isError || runnersQuery.isError) && (
        <div className="text-sm text-[var(--agyn-gray)]">Failed to load organization metrics.</div>
      )}
    </div>
  );
}
