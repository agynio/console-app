import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usersClient } from '@/api/client';
import { Button } from '@/components/Button';
import { Card, CardContent } from '@/components/ui/card';
import { MAX_PAGE_SIZE } from '@/lib/pagination';

export function UsersListPage() {
  const usersQuery = useQuery({
    queryKey: ['users', 'list'],
    queryFn: () => usersClient.listUsers({ pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const users = usersQuery.data?.users ?? [];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-[var(--agyn-dark)]">Users</h2>
          <p className="text-sm text-[var(--agyn-gray)]">Manage platform users.</p>
        </div>
        <Button variant="outline" size="sm">Create user</Button>
      </div>

      {usersQuery.isPending && (
        <div className="text-sm text-[var(--agyn-gray)]">Loading users...</div>
      )}
      {usersQuery.isError && (
        <div className="text-sm text-[var(--agyn-gray)]">Failed to load users.</div>
      )}

      <Card className="border-[var(--agyn-border-subtle)]">
        <CardContent className="px-0">
          <div className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-[var(--agyn-gray)] md:grid-cols-[2fr_2fr_120px]">
            <span>User</span>
            <span>Identity ID</span>
            <span className="text-right">Action</span>
          </div>
          <div className="divide-y divide-[var(--agyn-border-subtle)]">
            {users.length === 0 ? (
              <div className="px-6 py-6 text-sm text-[var(--agyn-gray)]">No users found.</div>
            ) : (
              users.map((user) => {
                const identityId = user.meta?.id ?? '';
                const canView = Boolean(identityId);
                return (
                  <div
                    key={identityId}
                    className="grid items-center gap-2 px-6 py-4 text-sm text-[var(--agyn-dark)] md:grid-cols-[2fr_2fr_120px]"
                  >
                    <div>
                      <div className="font-medium">{user.name || 'Unnamed user'}</div>
                      <div className="text-xs text-[var(--agyn-gray)]">{user.email}</div>
                    </div>
                    <div className="text-xs text-[var(--agyn-gray)]">{identityId || '—'}</div>
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
