import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usersClient } from '@/api/client';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ClusterRole } from '@/gen/agynio/api/users/v1/users_pb';
import { formatClusterRole } from '@/lib/format';
import { toast } from 'sonner';

export function UserDetailPage() {
  const { id } = useParams();
  const identityId = id ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [adminConfirmOpen, setAdminConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const userQuery = useQuery({
    queryKey: ['users', identityId],
    queryFn: () => usersClient.getUser({ identityId }),
    enabled: Boolean(identityId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const user = userQuery.data?.user;
  const clusterRole = userQuery.data?.clusterRole ?? ClusterRole.UNSPECIFIED;
  const isAdmin = clusterRole === ClusterRole.ADMIN;

  const updateRoleMutation = useMutation({
    mutationFn: (nextRole: ClusterRole) => usersClient.updateUser({ identityId, clusterRole: nextRole }),
    onSuccess: () => {
      toast.success('User role updated.');
      void queryClient.invalidateQueries({ queryKey: ['users', identityId] });
      void queryClient.invalidateQueries({ queryKey: ['users', 'list'] });
      setAdminConfirmOpen(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update user role.');
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: () => usersClient.deleteUser({ identityId }),
    onSuccess: () => {
      toast.success('User deleted.');
      void queryClient.invalidateQueries({ queryKey: ['users', 'list'] });
      navigate('/users');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete user.');
    },
  });

  const handleToggleAdmin = () => {
    const nextRole = isAdmin ? ClusterRole.UNSPECIFIED : ClusterRole.ADMIN;
    updateRoleMutation.mutate(nextRole);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-[var(--agyn-dark)]" data-testid="user-heading">
            User
          </h2>
          <p className="text-sm text-[var(--agyn-gray)]">Manage user profile and cluster role.</p>
        </div>
        {user ? (
          <div className="flex flex-wrap items-center gap-2" data-testid="user-actions">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAdminConfirmOpen(true)}
              data-testid="user-admin-toggle"
              disabled={updateRoleMutation.isPending}
            >
              {isAdmin ? 'Revoke admin' : 'Grant admin'}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setDeleteConfirmOpen(true)}
              data-testid="user-delete"
              disabled={deleteUserMutation.isPending}
            >
              Delete user
            </Button>
          </div>
        ) : null}
      </div>
      {userQuery.isPending ? (
        <div className="text-sm text-[var(--agyn-gray)]">Loading user...</div>
      ) : null}
      {userQuery.isError ? (
        <div className="text-sm text-[var(--agyn-gray)]">Failed to load user.</div>
      ) : null}
      {user ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="user-profile-card">
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
                <div className="text-xs uppercase tracking-wide text-[var(--agyn-gray)]">Photo URL</div>
                <div className="text-sm text-[var(--agyn-dark)]" data-testid="user-photo-url">
                  {user.photoUrl || '—'}
                </div>
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
                <Badge
                  variant={clusterRole === ClusterRole.ADMIN ? 'default' : 'outline'}
                  data-testid="user-cluster-role"
                >
                  {formatClusterRole(clusterRole)}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <ConfirmDialog
        open={adminConfirmOpen}
        onOpenChange={setAdminConfirmOpen}
        title={isAdmin ? 'Revoke cluster admin' : 'Grant cluster admin'}
        description={
          isAdmin
            ? 'This user will lose admin access to the console.'
            : 'This user will gain admin access to the console.'
        }
        confirmLabel={isAdmin ? 'Revoke admin' : 'Grant admin'}
        onConfirm={handleToggleAdmin}
        isPending={updateRoleMutation.isPending}
      />
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete user"
        description="This action permanently removes the user from the cluster."
        confirmLabel="Delete user"
        variant="danger"
        onConfirm={() => deleteUserMutation.mutate()}
        isPending={deleteUserMutation.isPending}
      />
    </div>
  );
}
