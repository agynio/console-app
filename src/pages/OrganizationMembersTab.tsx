import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { organizationsClient, usersClient } from '@/api/client';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MembershipRole, MembershipStatus } from '@/gen/agynio/api/organizations/v1/organizations_pb';
import { formatMembershipRole, formatMembershipStatus } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

export function OrganizationMembersTab() {
  const { id } = useParams();
  const organizationId = id ?? '';
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<MembershipRole>(MembershipRole.MEMBER);
  const [inviteError, setInviteError] = useState('');
  const [removeTargetId, setRemoveTargetId] = useState('');

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
    staleTime: 60_000,
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
    staleTime: 60_000,
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
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const allUsersQuery = useQuery({
    queryKey: ['users', 'list', 'members', organizationId],
    queryFn: () => usersClient.listUsers({ pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const userMap = useMemo(
    () => new Map((usersQuery.data?.users ?? []).map((user) => [user.meta?.id ?? '', user])),
    [usersQuery.data?.users],
  );

  const inviteMemberMutation = useMutation({
    mutationFn: (payload: { identityId: string; role: MembershipRole }) =>
      organizationsClient.createMembership({ organizationId, ...payload }),
    onSuccess: () => {
      toast.success('Member invited.');
      void queryClient.invalidateQueries({ queryKey: ['organizations', organizationId, 'members'] });
      setInviteOpen(false);
      setSelectedUserId('');
      setSelectedRole(MembershipRole.MEMBER);
      setInviteError('');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to invite member.');
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: (payload: { membershipId: string; role: MembershipRole }) =>
      organizationsClient.updateMembershipRole(payload),
    onSuccess: () => {
      toast.success('Member role updated.');
      void queryClient.invalidateQueries({ queryKey: ['organizations', organizationId, 'members'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update role.');
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (membershipId: string) => organizationsClient.removeMembership({ membershipId }),
    onSuccess: () => {
      toast.success('Member removed.');
      void queryClient.invalidateQueries({ queryKey: ['organizations', organizationId, 'members'] });
      setRemoveTargetId('');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to remove member.');
    },
  });

  const handleInviteMember = () => {
    if (!selectedUserId) {
      setInviteError('Select a user to invite.');
      return;
    }
    setInviteError('');
    inviteMemberMutation.mutate({ identityId: selectedUserId, role: selectedRole });
  };

  const handleInviteOpenChange = (open: boolean) => {
    setInviteOpen(open);
    if (!open) {
      setSelectedUserId('');
      setSelectedRole(MembershipRole.MEMBER);
      setInviteError('');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[var(--agyn-dark)]" data-testid="organization-members-heading">
            Members
          </h3>
          <p className="text-sm text-[var(--agyn-gray)]">Invite and manage organization members.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          data-testid="organization-members-invite"
          onClick={() => handleInviteOpenChange(true)}
        >
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
                    <Badge variant="secondary" data-testid="organization-member-role">
                      {formatMembershipRole(membership.role)}
                    </Badge>
                    <Badge variant="outline" data-testid="organization-member-status">
                      {formatMembershipStatus(membership.status)}
                    </Badge>
                    <div className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" data-testid="organization-member-manage">
                            Manage
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" data-testid="organization-member-actions">
                          {membership.role === MembershipRole.MEMBER ? (
                            <DropdownMenuItem
                              onSelect={() =>
                                updateRoleMutation.mutate({ membershipId: membership.id, role: MembershipRole.OWNER })
                              }
                              disabled={updateRoleMutation.isPending}
                              data-testid="organization-member-make-owner"
                            >
                              Make owner
                            </DropdownMenuItem>
                          ) : null}
                          {membership.role === MembershipRole.OWNER ? (
                            <DropdownMenuItem
                              onSelect={() =>
                                updateRoleMutation.mutate({ membershipId: membership.id, role: MembershipRole.MEMBER })
                              }
                              disabled={updateRoleMutation.isPending}
                              data-testid="organization-member-make-member"
                            >
                              Make member
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem
                            onSelect={() => setRemoveTargetId(membership.id)}
                            disabled={removeMemberMutation.isPending}
                            data-testid="organization-member-remove"
                          >
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}
      <Dialog open={inviteOpen} onOpenChange={handleInviteOpenChange}>
        <DialogContent data-testid="organization-members-invite-dialog">
          <DialogHeader>
            <DialogTitle data-testid="organization-members-invite-title">Invite member</DialogTitle>
            <DialogDescription data-testid="organization-members-invite-description">
              Select a user and assign their organization role.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm text-[var(--agyn-dark)]">User</div>
              <Select
                value={selectedUserId}
                onValueChange={(value) => {
                  setSelectedUserId(value);
                  if (inviteError) setInviteError('');
                }}
              >
                <SelectTrigger data-testid="organization-members-invite-user">
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {(allUsersQuery.data?.users ?? [])
                    .filter((user) => Boolean(user.meta?.id))
                    .map((user) => (
                      <SelectItem key={user.meta?.id ?? user.name} value={user.meta?.id ?? ''}>
                        {user.name || 'Unnamed user'} ({user.email || 'No email'})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {inviteError ? (
                <div className="text-xs text-[var(--agyn-danger)]" data-testid="organization-members-invite-error">
                  {inviteError}
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <div className="text-sm text-[var(--agyn-dark)]">Role</div>
              <Select
                value={selectedRole === MembershipRole.OWNER ? 'owner' : 'member'}
                onValueChange={(value) =>
                  setSelectedRole(value === 'owner' ? MembershipRole.OWNER : MembershipRole.MEMBER)
                }
              >
                <SelectTrigger data-testid="organization-members-invite-role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="owner">Owner</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="organization-members-invite-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="primary"
              size="sm"
              onClick={handleInviteMember}
              disabled={inviteMemberMutation.isPending}
              data-testid="organization-members-invite-submit"
            >
              {inviteMemberMutation.isPending ? 'Inviting...' : 'Invite member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(removeTargetId)}
        onOpenChange={(open) => setRemoveTargetId(open ? removeTargetId : '')}
        title="Remove member"
        description="This member will lose access to the organization."
        confirmLabel="Remove member"
        variant="danger"
        onConfirm={() => removeMemberMutation.mutate(removeTargetId)}
        isPending={removeMemberMutation.isPending}
      />
    </div>
  );
}
