import { useQuery } from '@tanstack/react-query';
import { organizationsClient, runnersClient, usersClient } from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MAX_PAGE_SIZE } from '@/lib/pagination';

export function DashboardPage() {
  const usersQuery = useQuery({
    queryKey: ['users', 'list', 'dashboard'],
    queryFn: () => usersClient.listUsers({ pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const orgsQuery = useQuery({
    queryKey: ['organizations', 'list', 'dashboard'],
    queryFn: () => organizationsClient.listOrganizations({ pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const runnersQuery = useQuery({
    queryKey: ['runners', 'list', 'dashboard'],
    queryFn: () => runnersClient.listRunners({ pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const clusterRunners = (runnersQuery.data?.runners ?? []).filter((runner) => !runner.organizationId);

  const summaryCards = [
    { label: 'Organizations', value: orgsQuery.data?.organizations.length ?? 0 },
    { label: 'Users', value: usersQuery.data?.users.length ?? 0 },
    { label: 'Cluster Runners', value: clusterRunners.length },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-[var(--agyn-dark)]">Dashboard</h2>
        <p className="text-sm text-[var(--agyn-gray)]">Platform overview and status.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {summaryCards.map((card) => (
          <Card key={card.label} className="border-[var(--agyn-border-subtle)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-[var(--agyn-gray)]">{card.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-[var(--agyn-dark)]">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      {(usersQuery.isError || orgsQuery.isError || runnersQuery.isError) && (
        <div className="text-sm text-[var(--agyn-gray)]">Failed to load dashboard metrics.</div>
      )}
    </div>
  );
}
