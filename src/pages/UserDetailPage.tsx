import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usersClient } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ClusterRole } from '@/gen/agynio/api/users/v1/users_pb';
import { formatClusterRole } from '@/lib/format';

export function UserDetailPage() {
  const { id } = useParams();
  const identityId = id ?? '';

  const userQuery = useQuery({
    queryKey: ['users', identityId],
    queryFn: () => usersClient.getUser({ identityId }),
    enabled: Boolean(identityId),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const user = userQuery.data?.user;
  const clusterRole = userQuery.data?.clusterRole ?? ClusterRole.UNSPECIFIED;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-[var(--agyn-dark)]">User</h2>
        <p className="text-sm text-[var(--agyn-gray)]">Manage user profile and cluster role.</p>
      </div>
      {userQuery.isPending ? (
        <div className="text-sm text-[var(--agyn-gray)]">Loading user...</div>
      ) : null}
      {userQuery.isError ? (
        <div className="text-sm text-[var(--agyn-gray)]">Failed to load user.</div>
      ) : null}
      {user ? (
        <Card className="border-[var(--agyn-border-subtle)]">
          <CardContent className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-[var(--agyn-dark)]">Profile</h3>
              <p className="text-sm text-[var(--agyn-gray)]">Identity and profile information.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-[var(--agyn-gray)]">Name</div>
                <div className="text-sm text-[var(--agyn-dark)]">{user.name}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-[var(--agyn-gray)]">Email</div>
                <div className="text-sm text-[var(--agyn-dark)]">{user.email}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-[var(--agyn-gray)]">Nickname</div>
                <div className="text-sm text-[var(--agyn-dark)]">{user.nickname || '—'}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-[var(--agyn-gray)]">OIDC Subject</div>
                <div className="text-sm text-[var(--agyn-dark)]">{user.oidcSubject}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-[var(--agyn-gray)]">Identity ID</div>
                <div className="text-sm text-[var(--agyn-dark)]">{user.meta?.id}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-[var(--agyn-gray)]">Cluster role</div>
                <Badge variant={clusterRole === ClusterRole.ADMIN ? 'default' : 'outline'}>
                  {formatClusterRole(clusterRole)}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
