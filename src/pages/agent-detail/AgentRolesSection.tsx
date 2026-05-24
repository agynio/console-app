import { useMemo, useState } from 'react';
import { Code, ConnectError } from '@connectrpc/connect';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentsClient, organizationsClient, usersClient } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AgentAvailability, AgentRole, type AgentRoleAssignment } from '@/gen/agynio/api/agents/v1/agents_pb';
import { AgentsGateway } from '@/gen/agynio/api/gateway/v1/agents_pb';
import { MembershipStatus, type Membership } from '@/gen/agynio/api/organizations/v1/organizations_pb';
import { formatAgentRole } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

type AgentRolesSectionProps = {
  agentId: string;
  organizationId: string;
  availability: AgentAvailability;
};

const assignableRoles = [AgentRole.OWNER, AgentRole.MAINTAINER, AgentRole.PARTICIPANT] as const;
const agentsGatewayApiPath = `/api/${AgentsGateway.typeName}/*`;
const missingGatewayRoleMethodMessage =
  `Agent role management is not available from the gateway yet. The console is calling ${agentsGatewayApiPath}; update the gateway/backend to expose ListAgentRoles, SetAgentRole, and RemoveAgentRole.`;

async function listActiveOrganizationMembers(organizationId: string): Promise<Membership[]> {
  const memberships: Membership[] = [];
  let pageToken = '';

  do {
    const response = await organizationsClient.listMembers({
      organizationId,
      status: MembershipStatus.ACTIVE,
      pageSize: MAX_PAGE_SIZE,
      pageToken,
    });
    memberships.push(...response.memberships);
    pageToken = response.nextPageToken;
  } while (pageToken);

  return memberships;
}

function isMissingGatewayRoleMethod(error: ConnectError) {
  return error.code === Code.Unimplemented;
}

function formatRoleError(error: unknown, fallback: string) {
  if (error instanceof ConnectError) {
    if (error.code === Code.PermissionDenied) {
      return 'You do not have permission to manage agent sharing roles.';
    }
    if (isMissingGatewayRoleMethod(error)) {
      return missingGatewayRoleMethodMessage;
    }
  }
  return error instanceof Error ? error.message : fallback;
}

export function AgentRolesSection({ agentId, organizationId, availability }: AgentRolesSectionProps) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedIdentityId, setSelectedIdentityId] = useState('');
  const [selectedRole, setSelectedRole] = useState<AgentRole>(AgentRole.PARTICIPANT);
  const [roleError, setRoleError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const rolesQuery = useQuery({
    queryKey: ['agents', agentId, 'roles'],
    queryFn: () => agentsClient.listAgentRoles({ agentId }),
    enabled: Boolean(agentId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const membersQuery = useQuery({
    queryKey: ['organizations', organizationId, 'members', 'roles-picker'],
    queryFn: () => listActiveOrganizationMembers(organizationId),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const assignments = useMemo(() => rolesQuery.data?.assignments ?? [], [rolesQuery.data?.assignments]);
  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);
  const identityIds = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...assignments.map((assignment) => assignment.identityId),
            ...members.map((membership) => membership.identityId),
          ].filter(Boolean),
        ),
      ),
    [assignments, members],
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

  const roleByIdentityId = useMemo(
    () => new Map(assignments.map((assignment) => [assignment.identityId, assignment.role] as const)),
    [assignments],
  );

  const memberLabel = (identityId: string) => {
    const user = userMap.get(identityId);
    return user?.username ? `@${user.username}` : user?.name || user?.email || identityId;
  };

  const filteredAssignments = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) return assignments;

    return assignments.filter((assignment) => {
      const user = userMap.get(assignment.identityId);
      const searchableValues = [
        user?.username ? `@${user.username}` : user?.name || user?.email || assignment.identityId,
        assignment.identityId,
        user?.username ?? '',
        user?.name ?? '',
        user?.email ?? '',
        formatAgentRole(assignment.role),
      ];
      return searchableValues.some((value) => value.toLowerCase().includes(normalizedSearch));
    });
  }, [assignments, searchTerm, userMap]);

  const setRoleMutation = useMutation({
    mutationFn: (payload: { identityId: string; role: AgentRole }) =>
      agentsClient.setAgentRole({ agentId, identityId: payload.identityId, role: payload.role }),
    onSuccess: () => {
      toast.success('Agent role saved.');
      void queryClient.invalidateQueries({ queryKey: ['agents', agentId, 'roles'] });
      setDialogOpen(false);
      setSelectedIdentityId('');
      setSelectedRole(AgentRole.PARTICIPANT);
      setRoleError('');
    },
    onError: (error) => {
      const message = formatRoleError(error, 'Failed to save agent role.');
      setRoleError(message);
      toast.error(message);
    },
  });

  const removeRoleMutation = useMutation({
    mutationFn: (identityId: string) => agentsClient.removeAgentRole({ agentId, identityId }),
    onSuccess: () => {
      toast.success('Agent role removed.');
      void queryClient.invalidateQueries({ queryKey: ['agents', agentId, 'roles'] });
      setRoleError('');
    },
    onError: (error) => {
      const message = formatRoleError(error, 'Failed to remove agent role.');
      setRoleError(message);
      toast.error(message);
    },
  });

  const openEdit = (assignment?: AgentRoleAssignment) => {
    setSelectedIdentityId(assignment?.identityId ?? '');
    setSelectedRole(assignment?.role || AgentRole.PARTICIPANT);
    setRoleError('');
    setDialogOpen(true);
  };

  const sharingDescription =
    availability === AgentAvailability.PRIVATE
      ? 'Private agents are shared by assigning owner, maintainer, or participant roles to specific organization members.'
      : 'Assign roles now to prepare specific-user sharing before switching this agent to Private availability.';
  const hasSearch = searchTerm.trim().length > 0;

  return (
    <Card className="border-border" data-testid="agent-roles-card">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg text-foreground">
          Share with specific users
          <Badge variant={availability === AgentAvailability.PRIVATE ? 'default' : 'outline'} data-testid="agent-roles-availability">
            {availability === AgentAvailability.PRIVATE ? 'Private sharing active' : 'Available when Private'}
          </Badge>
        </CardTitle>
        <CardDescription className="max-w-2xl">{sharingDescription}</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={() => openEdit()} data-testid="agent-roles-add">
            Share agent
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {availability !== AgentAvailability.PRIVATE ? (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground" data-testid="agent-roles-private-hint">
            To limit thread access to only the users listed here, set Availability to Private in Configuration.
          </div>
        ) : null}
        <div className="max-w-sm">
          <Input
            placeholder="Search shared users..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            data-testid="agent-roles-search"
          />
        </div>
        {rolesQuery.isPending ? <div className="text-sm text-muted-foreground">Loading roles...</div> : null}
        {rolesQuery.isError ? (
          <div className="text-sm text-destructive" data-testid="agent-roles-load-error">
            {formatRoleError(rolesQuery.error, 'Failed to load sharing roles.')}
          </div>
        ) : null}
        {membersQuery.isError ? (
          <div className="text-sm text-destructive" data-testid="agent-roles-members-error">
            Failed to load organization members for sharing.
          </div>
        ) : null}
        {roleError ? (
          <div className="text-sm text-destructive" data-testid="agent-roles-error">
            {roleError}
          </div>
        ) : null}
        {assignments.length === 0 && !rolesQuery.isPending ? (
          <div className="rounded-md border border-border py-10 text-center text-sm text-muted-foreground" data-testid="agent-roles-empty">
            No users are explicitly shared on this agent yet.
          </div>
        ) : null}
        {assignments.length > 0 ? (
          <div className="divide-y divide-border rounded-md border border-border" data-testid="agent-roles-list">
            {filteredAssignments.length === 0 ? (
              <div className="px-6 py-6 text-sm text-muted-foreground" data-testid="agent-roles-no-results">
                {hasSearch ? 'No results found.' : 'No users are explicitly shared on this agent yet.'}
              </div>
            ) : (
              filteredAssignments.map((assignment) => (
                <div key={assignment.identityId} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">{memberLabel(assignment.identityId)}</div>
                    <div className="text-xs text-muted-foreground">{assignment.identityId}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{formatAgentRole(assignment.role)}</Badge>
                    <Button variant="outline" size="sm" onClick={() => openEdit(assignment)} data-testid="agent-roles-change">
                      Change
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeRoleMutation.mutate(assignment.identityId)}
                      disabled={removeRoleMutation.isPending}
                      data-testid="agent-roles-remove"
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}
      </CardContent>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent data-testid="agent-roles-dialog">
          <DialogHeader>
            <DialogTitle>Share private agent</DialogTitle>
            <DialogDescription>
              Select an organization member who can use this agent when Availability is Private.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agent-roles-member">Member</Label>
              <Select value={selectedIdentityId} onValueChange={setSelectedIdentityId}>
                <SelectTrigger id="agent-roles-member" data-testid="agent-roles-member">
                  <SelectValue placeholder="Select member" />
                </SelectTrigger>
                <SelectContent>
                  {membersQuery.isPending ? <SelectItem value="loading" disabled>Loading members...</SelectItem> : null}
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
              data-testid="agent-roles-save"
            >
              {setRoleMutation.isPending ? 'Saving...' : 'Save role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
