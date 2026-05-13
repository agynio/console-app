import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentsClient, organizationsClient, usersClient } from '@/api/client';
import { Button } from '@/components/ui/button';
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
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AgentRole, type AgentRoleAssignment } from '@/gen/agynio/api/agents/v1/agents_pb';
import { MembershipStatus } from '@/gen/agynio/api/organizations/v1/organizations_pb';
import { formatAgentRole } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

type AgentRolesSectionProps = {
  agentId: string;
  organizationId: string;
};

const assignableRoles = [AgentRole.OWNER, AgentRole.MAINTAINER, AgentRole.PARTICIPANT] as const;

export function AgentRolesSection({ agentId, organizationId }: AgentRolesSectionProps) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedIdentityId, setSelectedIdentityId] = useState('');
  const [selectedRole, setSelectedRole] = useState<AgentRole>(AgentRole.PARTICIPANT);

  const rolesQuery = useQuery({
    queryKey: ['agents', agentId, 'roles'],
    queryFn: () => agentsClient.listAgentRoles({ agentId }),
    enabled: Boolean(agentId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const membersQuery = useQuery({
    queryKey: ['organizations', organizationId, 'members', 'roles-picker'],
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

  const assignments = useMemo(() => rolesQuery.data?.assignments ?? [], [rolesQuery.data?.assignments]);
  const identityIds = useMemo(
    () => Array.from(new Set(assignments.map((assignment) => assignment.identityId).filter(Boolean))),
    [assignments],
  );

  const usersQuery = useQuery({
    queryKey: ['users', 'batch', identityIds.join(',')],
    queryFn: () => usersClient.batchGetUsers({ identityIds }),
    enabled: identityIds.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const userMap = useMemo(() => {
    const users = usersQuery.data?.users ?? [];
    return new Map(
      users.flatMap((user) => {
        const userId = user.meta?.id;
        return userId ? ([[userId, user]] as const) : [];
      }),
    );
  }, [usersQuery.data?.users]);

  const members = membersQuery.data?.memberships ?? [];
  const roleByIdentityId = useMemo(
    () => new Map(assignments.map((assignment) => [assignment.identityId, assignment.role] as const)),
    [assignments],
  );

  const setRoleMutation = useMutation({
    mutationFn: (payload: { identityId: string; role: AgentRole }) =>
      agentsClient.setAgentRole({ agentId, identityId: payload.identityId, role: payload.role }),
    onSuccess: () => {
      toast.success('Agent role saved.');
      void queryClient.invalidateQueries({ queryKey: ['agents', agentId, 'roles'] });
      setDialogOpen(false);
      setSelectedIdentityId('');
      setSelectedRole(AgentRole.PARTICIPANT);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to save agent role.');
    },
  });

  const removeRoleMutation = useMutation({
    mutationFn: (identityId: string) => agentsClient.removeAgentRole({ agentId, identityId }),
    onSuccess: () => {
      toast.success('Agent role removed.');
      void queryClient.invalidateQueries({ queryKey: ['agents', agentId, 'roles'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to remove agent role.');
    },
  });

  const memberLabel = (identityId: string) => {
    const user = userMap.get(identityId);
    return user?.username ? `@${user.username}` : user?.name || user?.email || identityId;
  };

  const openEdit = (assignment?: AgentRoleAssignment) => {
    setSelectedIdentityId(assignment?.identityId ?? '');
    setSelectedRole(assignment?.role || AgentRole.PARTICIPANT);
    setDialogOpen(true);
  };

  return (
    <Card className="border-border" data-testid="agent-roles-card">
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Roles</h3>
            <p className="text-sm text-muted-foreground">Per-agent access for organization members.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => openEdit()} data-testid="agent-roles-add">
            Add role
          </Button>
        </div>
        {rolesQuery.isPending ? <div className="text-sm text-muted-foreground">Loading roles...</div> : null}
        {rolesQuery.isError ? <div className="text-sm text-muted-foreground">Failed to load roles.</div> : null}
        {assignments.length === 0 && !rolesQuery.isPending ? (
          <div className="text-sm text-muted-foreground">No explicit roles assigned.</div>
        ) : null}
        {assignments.length > 0 ? (
          <div className="divide-y divide-border rounded-md border border-border" data-testid="agent-roles-list">
            {assignments.map((assignment) => (
              <div key={assignment.identityId} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div>
                  <div className="text-sm font-medium text-foreground">{memberLabel(assignment.identityId)}</div>
                  <div className="text-xs text-muted-foreground">{assignment.identityId}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{formatAgentRole(assignment.role)}</Badge>
                  <Button variant="outline" size="sm" onClick={() => openEdit(assignment)}>
                    Change
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeRoleMutation.mutate(assignment.identityId)}
                    disabled={removeRoleMutation.isPending}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent data-testid="agent-roles-dialog">
          <DialogHeader>
            <DialogTitle>Agent role</DialogTitle>
            <DialogDescription>Select an organization member and their role on this agent.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agent-roles-member">Member</Label>
              <Select value={selectedIdentityId} onValueChange={setSelectedIdentityId}>
                <SelectTrigger id="agent-roles-member" data-testid="agent-roles-member">
                  <SelectValue placeholder="Select member" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((membership) => (
                    <SelectItem key={membership.identityId} value={membership.identityId}>
                      {memberLabel(membership.identityId)}
                      {roleByIdentityId.has(membership.identityId) ? ` (${formatAgentRole(roleByIdentityId.get(membership.identityId))})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-roles-role">Role</Label>
              <Select value={String(selectedRole)} onValueChange={(value) => setSelectedRole(Number(value) as AgentRole)}>
                <SelectTrigger id="agent-roles-role" data-testid="agent-roles-role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {assignableRoles.map((role) => (
                    <SelectItem key={role} value={String(role)}>
                      {formatAgentRole(role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={() => setRoleMutation.mutate({ identityId: selectedIdentityId, role: selectedRole })}
              disabled={!selectedIdentityId || setRoleMutation.isPending}
            >
              {setRoleMutation.isPending ? 'Saving...' : 'Save role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
