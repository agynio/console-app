import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { organizationsClient, usersClient } from '@/api/client';
import { Button } from '@/components/Button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { MembershipStatus } from '@/gen/agynio/api/organizations/v1/organizations_pb';
import { formatMembershipRole, formatMembershipStatus } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';

export function OrganizationMembersTab() {
  const { id } = useParams();
  const organizationId = id ?? '';

  const activeQuery = useQuery({
    queryKey: ['organizations', organizationId, 'members', 'active'],
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

  const pendingQuery = useQuery({
    queryKey: ['organizations', organizationId, 'members', 'pending'],
    queryFn: () =>
      organizationsClient.listMembers({
        organizationId,
        status: MembershipStatus.PENDING,
        pageSize: MAX_PAGE_SIZE,
        pageToken: '',
      }),
    enabled: Boolean(organizationId),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const memberships = useMemo(
    () => [...(activeQuery.data?.memberships ?? []), ...(pendingQuery.data?.memberships ?? [])],
    [activeQuery.data?.memberships, pendingQuery.data?.memberships],
  );

  const identityIds = useMemo(() => {
    const ids = memberships.map((membership) => membership.identityId).filter(Boolean);
    return Array.from(new Set(ids));
  }, [memberships]);

  const usersQuery = useQuery({
    queryKey: ['users', 'batch', identityIds.join(',')],
    queryFn: () => usersClient.batchGetUsers({ identityIds }),
    enabled: identityIds.length > 0,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const userMap = useMemo(
    () => new Map((usersQuery.data?.users ?? []).map((user) => [user.meta?.id ?? '', user])),
    [usersQuery.data?.users],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[var(--agyn-dark)]" data-testid="organization-members-heading">
            Members
          </h3>
          <p className="text-sm text-[var(--agyn-gray)]">Invite and manage organization members.</p>
        </div>
        <Button variant="outline" size="sm" data-testid="organization-members-invite">
          <PlusIcon className="mr-2 h-4 w-4" />
          Invite member
        </Button>
      </div>
      {(activeQuery.isPending || pendingQuery.isPending) && (
        <div className="text-sm text-[var(--agyn-gray)]">Loading members...</div>
      )}
      {(activeQuery.isError || pendingQuery.isError) && (
        <div className="text-sm text-[var(--agyn-gray)]">Failed to load members.</div>
      )}
      {memberships.length === 0 && !activeQuery.isPending && !pendingQuery.isPending ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="organization-members-empty">
          <CardContent className="py-10 text-center text-sm text-[var(--agyn-gray)]">
            No members yet.
          </CardContent>
        </Card>
      ) : null}
      {memberships.length > 0 ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="organization-members-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-[var(--agyn-gray)] md:grid-cols-[2fr_1fr_1fr_120px]"
              data-testid="organization-members-header"
            >
              <span>Member</span>
              <span>Role</span>
              <span>Status</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-[var(--agyn-border-subtle)]">
              {memberships.map((membership) => {
                const user = userMap.get(membership.identityId);
                return (
                  <div
                    key={membership.id}
                    className="grid items-center gap-2 px-6 py-4 text-sm text-[var(--agyn-dark)] md:grid-cols-[2fr_1fr_1fr_120px]"
                    data-testid="organization-member-row"
                  >
                    <div>
                      <div className="font-medium" data-testid="organization-member-name">
                        {user?.name ?? membership.identityId}
                      </div>
                      <div className="text-xs text-[var(--agyn-gray)]" data-testid="organization-member-email">
                        {user?.email ?? 'Unknown email'}
                      </div>
                    </div>
                    <Badge variant="secondary">{formatMembershipRole(membership.role)}</Badge>
                    <Badge variant="outline">{formatMembershipStatus(membership.status)}</Badge>
                    <div className="text-right text-xs text-[var(--agyn-gray)]">Manage</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
