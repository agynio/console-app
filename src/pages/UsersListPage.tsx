import { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { organizationsClient, usersClient } from '@/api/client';
import { Button } from '@/components/Button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ClusterRole } from '@/gen/agynio/api/users/v1/users_pb';
import { MembershipRole, MembershipStatus } from '@/gen/agynio/api/organizations/v1/organizations_pb';

function formatMembershipRole(role: MembershipRole): string {
  if (role === MembershipRole.OWNER) return 'Owner';
  if (role === MembershipRole.MEMBER) return 'Member';
  return 'Unspecified';
}

function formatClusterRole(role?: ClusterRole): string {
  if (role === ClusterRole.ADMIN) return 'Admin';
  if (role === ClusterRole.UNSPECIFIED) return 'None';
  return 'Unknown';
}

export function UsersListPage() {
  const usersQuery = useQuery({
    queryKey: ['users', 'list'],
    queryFn: () => usersClient.listUsers({ pageSize: 200, pageToken: '' }),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const orgsQuery = useQuery({
    queryKey: ['organizations', 'list', 'users'],
    queryFn: () => organizationsClient.listOrganizations({ pageSize: 200, pageToken: '' }),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const membershipQueries = useQueries({
    queries: (orgsQuery.data?.organizations ?? []).map((org) => ({
      queryKey: ['organizations', org.id, 'memberships'],
      queryFn: () =>
        organizationsClient.listMembers({
          organizationId: org.id,
          status: MembershipStatus.UNSPECIFIED,
          pageSize: 200,
          pageToken: '',
        }),
      enabled: Boolean(org.id),
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
    })),
  });

  const roleQueries = useQueries({
    queries: (usersQuery.data?.users ?? []).map((user) => ({
      queryKey: ['users', user.meta?.id ?? 'unknown', 'detail'],
      queryFn: () => usersClient.getUser({ identityId: user.meta?.id ?? '' }),
      enabled: Boolean(user.meta?.id),
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
    })),
  });

  const membershipsByIdentity = useMemo(() => {
    const map = new Map<string, { orgName: string; role: MembershipRole }[]>();
    membershipQueries.forEach((query, index) => {
      const org = orgsQuery.data?.organizations[index];
      if (!org || !query.data) return;
      query.data.memberships.forEach((membership) => {
        const list = map.get(membership.identityId) ?? [];
        list.push({ orgName: org.name, role: membership.role });
        map.set(membership.identityId, list);
      });
    });
    return map;
  }, [membershipQueries, orgsQuery.data?.organizations]);

  const clusterRoleByIdentity = useMemo(() => {
    const map = new Map<string, ClusterRole>();
    roleQueries.forEach((query) => {
      const identityId = query.data?.user?.meta?.id;
      if (!identityId || !query.data) return;
      map.set(identityId, query.data.clusterRole);
    });
    return map;
  }, [roleQueries]);

  const users = usersQuery.data?.users ?? [];
  const membershipsLoading = membershipQueries.some((query) => query.isPending);
  const membershipsError = membershipQueries.some((query) => query.isError);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-[var(--agyn-dark)]">Users</h2>
          <p className="text-sm text-[var(--agyn-gray)]">Manage platform users.</p>
        </div>
        <Button variant="outline" size="sm">Create user</Button>
      </div>

      {(usersQuery.isPending || orgsQuery.isPending) && (
        <div className="text-sm text-[var(--agyn-gray)]">Loading users...</div>
      )}
      {(usersQuery.isError || orgsQuery.isError || membershipsError) && (
        <div className="text-sm text-[var(--agyn-gray)]">Failed to load users.</div>
      )}

      <Card className="border-[var(--agyn-border-subtle)]">
        <CardContent className="px-0">
          <div className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-[var(--agyn-gray)] md:grid-cols-[2fr_2fr_2fr_120px]">
            <span>User</span>
            <span>Organizations</span>
            <span>Cluster role</span>
            <span className="text-right">Action</span>
          </div>
          <div className="divide-y divide-[var(--agyn-border-subtle)]">
            {users.length === 0 ? (
              <div className="px-6 py-6 text-sm text-[var(--agyn-gray)]">No users found.</div>
            ) : (
              users.map((user) => {
                const identityId = user.meta?.id ?? '';
                const memberships = membershipsByIdentity.get(identityId) ?? [];
                const clusterRole = clusterRoleByIdentity.get(identityId);
                const canView = Boolean(identityId);
                return (
                  <div
                    key={identityId}
                    className="grid items-center gap-2 px-6 py-4 text-sm text-[var(--agyn-dark)] md:grid-cols-[2fr_2fr_2fr_120px]"
                  >
                    <div>
                      <div className="font-medium">{user.name || 'Unnamed user'}</div>
                      <div className="text-xs text-[var(--agyn-gray)]">{user.email}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {memberships.length === 0 ? (
                        <span className="text-xs text-[var(--agyn-gray)]">
                          {membershipsLoading ? 'Loading memberships...' : 'No memberships'}
                        </span>
                      ) : (
                        memberships.map((membership) => (
                          <Badge key={`${identityId}-${membership.orgName}`} variant="secondary">
                            {membership.orgName} · {formatMembershipRole(membership.role)}
                          </Badge>
                        ))
                      )}
                    </div>
                    <div>
                      <Badge variant={clusterRole === ClusterRole.ADMIN ? 'default' : 'outline'}>
                        {formatClusterRole(clusterRole)}
                      </Badge>
                    </div>
                    <div className="text-right">
                      {canView ? (
                        <Button variant="outline" size="sm" asChild>
                          <NavLink to={`/users/${identityId}`}>View</NavLink>
                        </Button>
                      ) : (
                        <span className="text-xs text-[var(--agyn-gray)]">—</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
