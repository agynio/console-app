import { useEffect, useMemo, useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentsClient, appsClient, groupsClient, organizationsClient, usersClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { GroupMemberType, GroupSource, type GroupMembership } from '@/gen/agynio/api/groups/v1/groups_pb';
import { AppVisibility, type App } from '@/gen/agynio/api/apps/v1/apps_pb';
import { MembershipStatus } from '@/gen/agynio/api/organizations/v1/organizations_pb';
import type { Agent } from '@/gen/agynio/api/agents/v1/agents_pb';
import type { User } from '@/gen/agynio/api/users/v1/users_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { formatDateOnly } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

type MemberOption = {
  type: GroupMemberType;
  id: string;
  label: string;
  description: string;
};

type MemberPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: MemberOption[];
  existingMemberIds: Set<string>;
  onSubmit: (option: MemberOption) => void;
  isSubmitting: boolean;
};

const groupNamePattern = /^[a-z0-9_-]{1,64}$/;
const userBatchSize = 100;
const memberTypeLabels = new Map<GroupMemberType, string>([
  [GroupMemberType.USER, 'User'],
  [GroupMemberType.AGENT, 'Agent'],
  [GroupMemberType.APP, 'App'],
]);

function MemberPickerDialog({
  open,
  onOpenChange,
  options,
  existingMemberIds,
  onSubmit,
  isSubmitting,
}: MemberPickerDialogProps) {
  const selectableOptions = useMemo(
    () => options.filter((option) => !existingMemberIds.has(option.id)),
    [existingMemberIds, options],
  );
  const [selectedValue, setSelectedValue] = useState('');
  const selectedOption = selectableOptions.find((option) => optionValue(option) === selectedValue);

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) setSelectedValue('');
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="group-member-picker">
        <DialogHeader>
          <DialogTitle>Add member</DialogTitle>
          <DialogDescription>Select a user, agent, or app identity to add to this group.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Member</Label>
          <Select value={selectedValue} onValueChange={setSelectedValue}>
            <SelectTrigger className="w-full" data-testid="group-member-picker-select">
              <SelectValue placeholder="Select a member" />
            </SelectTrigger>
            <SelectContent>
              {selectableOptions.length === 0 ? (
                <SelectItem value="__none" disabled>
                  No members available
                </SelectItem>
              ) : (
                selectableOptions.map((option) => (
                  <SelectItem key={optionValue(option)} value={optionValue(option)}>
                    {option.label} ({formatMemberType(option.type)})
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {selectedOption ? <p className="text-xs text-muted-foreground">{selectedOption.description}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={() => selectedOption && onSubmit(selectedOption)}
            disabled={!selectedOption || isSubmitting}
            data-testid="group-member-picker-submit"
          >
            {isSubmitting ? 'Adding...' : 'Add member'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OrganizationGroupDetailPage() {
  useDocumentTitle('Group');

  const { id, groupId } = useParams();
  const organizationId = id ?? '';
  const resolvedGroupId = groupId ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const groupQuery = useQuery({
    queryKey: ['groups', organizationId, resolvedGroupId],
    queryFn: () => groupsClient.getGroup({ id: resolvedGroupId }),
    enabled: Boolean(resolvedGroupId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const membersQuery = useInfiniteQuery({
    queryKey: ['groups', resolvedGroupId, 'members'],
    queryFn: ({ pageParam }) =>
      groupsClient.listMembers({ groupId: resolvedGroupId, pageSize: MAX_PAGE_SIZE, pageToken: pageParam }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
    enabled: Boolean(resolvedGroupId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const organizationMembersQuery = useInfiniteQuery({
    queryKey: ['organizations', organizationId, 'members', 'group-picker'],
    queryFn: ({ pageParam }) =>
      organizationsClient.listMembers({
        organizationId,
        status: MembershipStatus.ACTIVE,
        pageSize: MAX_PAGE_SIZE,
        pageToken: pageParam,
      }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (membersQuery.hasNextPage && !membersQuery.isFetchingNextPage) {
      void membersQuery.fetchNextPage();
    }
  }, [membersQuery]);

  useEffect(() => {
    if (organizationMembersQuery.hasNextPage && !organizationMembersQuery.isFetchingNextPage) {
      void organizationMembersQuery.fetchNextPage();
    }
  }, [organizationMembersQuery]);

  const agentsQuery = useQuery({
    queryKey: ['agents', organizationId, 'group-picker'],
    queryFn: () => agentsClient.listAgents({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const appsQuery = useQuery({
    queryKey: ['apps', organizationId, 'group-picker'],
    queryFn: () =>
      appsClient.listApps({
        organizationId,
        pageSize: MAX_PAGE_SIZE,
        pageToken: '',
        visibility: AppVisibility.UNSPECIFIED,
      }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const members = useMemo(
    () => membersQuery.data?.pages.flatMap((page) => page.memberships) ?? [],
    [membersQuery.data?.pages],
  );
  const memberIds = useMemo(() => members.map((membership) => membership.memberId).filter(Boolean), [members]);
  const memberUserIdChunks = useMemo(() => chunkStrings(memberIds, userBatchSize), [memberIds]);
  const memberUsersQueries = useQueries({
    queries: memberUserIdChunks.map((identityIds) => ({
      queryKey: ['users', 'batch', identityIds.join(',')],
      queryFn: () => usersClient.batchGetUsers({ identityIds }),
      enabled: identityIds.length > 0,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    })),
  });
  const agentMemberships = useMemo(
    () => members.filter((membership) => membership.memberType === GroupMemberType.AGENT),
    [members],
  );
  const memberAgentQueries = useQueries({
    queries: agentMemberships.map((membership) => ({
      queryKey: ['agents', membership.memberId, 'member-label'],
      queryFn: () => agentsClient.getAgent({ id: membership.memberId }),
      enabled: Boolean(membership.memberId),
      retry: false,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    })),
  });

  const memberUserMap = useMemo(() => {
    const users = memberUsersQueries.flatMap((query) => query.data?.users ?? []);
    return new Map(users.flatMap((user) => (user.meta?.id ? ([[user.meta.id, user]] as const) : [])));
  }, [memberUsersQueries]);

  const memberAgentMap = useMemo(
    () =>
      new Map(
        memberAgentQueries.flatMap((query, index) => {
          const memberId = agentMemberships[index]?.memberId;
          const agent = query.data?.agent;
          return memberId && agent ? ([[memberId, agent]] as const) : [];
        }),
      ),
    [agentMemberships, memberAgentQueries],
  );

  const organizationMemberIdentityIds = useMemo(
    () =>
      Array.from(
        new Set(
          (organizationMembersQuery.data?.pages.flatMap((page) => page.memberships) ?? [])
            .map((membership) => membership.identityId)
            .filter(Boolean),
        ),
      ),
    [organizationMembersQuery.data?.pages],
  );

  const organizationUserIdChunks = useMemo(
    () => chunkStrings(organizationMemberIdentityIds, userBatchSize),
    [organizationMemberIdentityIds],
  );
  const organizationUsersQueries = useQueries({
    queries: organizationUserIdChunks.map((identityIds) => ({
      queryKey: ['users', 'batch', 'org-members', identityIds.join(',')],
      queryFn: () => usersClient.batchGetUsers({ identityIds }),
      enabled: identityIds.length > 0,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    })),
  });

  const memberOptions = useMemo(() => {
    const organizationUsers = organizationUsersQueries.flatMap((query) => query.data?.users ?? []);
    const userOptions: MemberOption[] = organizationUsers.flatMap((user) => {
      const userId = user.meta?.id;
      if (!userId) return [];
      return [{ type: GroupMemberType.USER, id: userId, label: formatUserLabel(user), description: user.email || userId }];
    });
    const agentOptions: MemberOption[] = (agentsQuery.data?.agents ?? []).flatMap((agent) => {
      const agentId = agent.meta?.id;
      if (!agentId) return [];
      return [{ type: GroupMemberType.AGENT, id: agentId, label: formatAgentLabel(agent), description: agent.role || agentId }];
    });
    const appOptions: MemberOption[] = (appsQuery.data?.apps ?? []).flatMap((app) => {
      const appId = app.identityId || app.meta?.id;
      if (!appId) return [];
      return [{ type: GroupMemberType.APP, id: appId, label: app.name || app.slug || appId, description: app.slug || appId }];
    });
    return [...userOptions, ...agentOptions, ...appOptions].sort((left, right) => left.label.localeCompare(right.label));
  }, [agentsQuery.data?.agents, appsQuery.data?.apps, organizationUsersQueries]);

  const addMemberMutation = useMutation({
    mutationFn: (option: MemberOption) =>
      groupsClient.addMember({
        groupId: resolvedGroupId,
        memberType: option.type,
        memberId: option.id,
        source: GroupSource.PLATFORM,
      }),
    onSuccess: () => {
      toast.success('Group member added.');
      setMemberDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['groups', resolvedGroupId, 'members'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to add member.');
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) => groupsClient.removeMember({ groupId: resolvedGroupId, memberId }),
    onSuccess: () => {
      toast.success('Group member removed.');
      void queryClient.invalidateQueries({ queryKey: ['groups', resolvedGroupId, 'members'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to remove member.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (values: { name: string; description: string }) =>
      groupsClient.updateGroup({ id: resolvedGroupId, name: values.name, description: values.description }),
    onSuccess: () => {
      toast.success('Group updated.');
      void queryClient.invalidateQueries({ queryKey: ['groups', organizationId] });
      void queryClient.invalidateQueries({ queryKey: ['groups', organizationId, resolvedGroupId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update group.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => groupsClient.deleteGroup({ id: resolvedGroupId }),
    onSuccess: () => {
      toast.success('Group deleted.');
      void queryClient.invalidateQueries({ queryKey: ['groups', organizationId] });
      navigate(`/organizations/${organizationId}/groups`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete group.');
    },
  });

  const group = groupQuery.data?.group;
  const existingMemberIds = useMemo(() => new Set(members.map((membership) => membership.memberId)), [members]);

  if (groupQuery.isPending) return <div className="text-sm text-muted-foreground">Loading group...</div>;
  if (groupQuery.isError || !group) return <div className="text-sm text-muted-foreground">Failed to load group.</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <NavLink to={`/organizations/${organizationId}/groups`}>Back to groups</NavLink>
        </Button>
        <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)} data-testid="group-delete">
          Delete group
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{group.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <GroupSettingsForm
            name={group.name}
            description={group.description}
            source={group.source}
            externalId={group.externalId}
            createdAt={formatDateOnly(group.meta?.createdAt)}
            onSubmit={(values) => updateMutation.mutate(values)}
            isSubmitting={updateMutation.isPending}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Members</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setMemberDialogOpen(true)} data-testid="group-add-member">
            Add member
          </Button>
        </CardHeader>
        <CardContent>
          {membersQuery.isPending ? <div className="text-sm text-muted-foreground">Loading members...</div> : null}
          {membersQuery.isError ? <div className="text-sm text-muted-foreground">Failed to load members.</div> : null}
          {members.length === 0 && !membersQuery.isPending ? (
            <div className="rounded-md border border-border p-6 text-center text-sm text-muted-foreground">
              No members in this group.
            </div>
          ) : null}
          {members.length > 0 ? (
            <div className="divide-y divide-border rounded-md border border-border" data-testid="group-members-list">
              {members.map((membership) => (
                <GroupMemberRow
                  key={membership.meta?.id ?? membership.memberId}
                  membership={membership}
                  label={formatMembershipLabel(membership, memberUserMap, memberAgentMap, appsQuery.data?.apps ?? [])}
                  onRemove={() => removeMemberMutation.mutate(membership.memberId)}
                  isRemoving={removeMemberMutation.isPending}
                />
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
      <MemberPickerDialog
        open={memberDialogOpen}
        onOpenChange={setMemberDialogOpen}
        options={memberOptions}
        existingMemberIds={existingMemberIds}
        onSubmit={(option) => addMemberMutation.mutate(option)}
        isSubmitting={addMemberMutation.isPending}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete group?"
        description="This removes memberships and any group-based grants that reference this group."
        confirmLabel="Delete group"
        onConfirm={() => deleteMutation.mutate()}
        variant="danger"
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}

type GroupSettingsFormProps = {
  name: string;
  description: string;
  source: GroupSource;
  externalId?: string;
  createdAt: string;
  onSubmit: (values: { name: string; description: string }) => void;
  isSubmitting: boolean;
};

function GroupSettingsForm({
  name,
  description,
  source,
  externalId,
  createdAt,
  onSubmit,
  isSubmitting,
}: GroupSettingsFormProps) {
  const [values, setValues] = useState({ name, description });
  const [error, setError] = useState('');

  const handleSubmit = () => {
    const nextName = values.name.trim();
    if (!groupNamePattern.test(nextName)) {
      setError('Use 1-64 lowercase letters, numbers, underscores, or hyphens.');
      return;
    }
    onSubmit({ name: nextName, description: values.description.trim() });
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="group-detail-name">Name</Label>
        <Input
          id="group-detail-name"
          value={values.name}
          onChange={(event) => {
            setValues((current) => ({ ...current, name: event.target.value }));
            setError('');
          }}
          disabled={source === GroupSource.SCIM}
          data-testid="group-detail-name"
        />
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
      <div className="space-y-2">
        <Label>Source</Label>
        <div className="rounded-md border border-input px-3 py-2 text-sm">{formatSource(source)}</div>
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="group-detail-description">Description</Label>
        <Textarea
          id="group-detail-description"
          value={values.description}
          onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))}
          disabled={source === GroupSource.SCIM}
          data-testid="group-detail-description"
        />
      </div>
      <div className="text-sm text-muted-foreground">Created: {createdAt}</div>
      {externalId ? <div className="text-sm text-muted-foreground">External ID: {externalId}</div> : null}
      <div className="md:col-span-2">
        <Button onClick={handleSubmit} disabled={source === GroupSource.SCIM || isSubmitting} data-testid="group-detail-save">
          {isSubmitting ? 'Saving...' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}

function GroupMemberRow({
  membership,
  label,
  onRemove,
  isRemoving,
}: {
  membership: GroupMembership;
  label: string;
  onRemove: () => void;
  isRemoving: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3" data-testid="group-member-row">
      <div>
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">
          {formatMemberType(membership.memberType)} - {membership.memberId}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{formatSource(membership.source)}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={membership.source === GroupSource.SCIM || isRemoving}
          data-testid="group-member-remove"
        >
          Remove
        </Button>
      </div>
    </div>
  );
}

function optionValue(option: MemberOption) {
  return `${option.type}:${option.id}`;
}

function formatMemberType(type: GroupMemberType) {
  return memberTypeLabels.get(type) ?? 'Member';
}

function formatSource(source: GroupSource) {
  switch (source) {
    case GroupSource.PLATFORM:
      return 'Platform';
    case GroupSource.SCIM:
      return 'SCIM';
    case GroupSource.UNSPECIFIED:
      return 'Unspecified';
  }
}

function formatUserLabel(user: User) {
  return user.nickname ? `@${user.nickname}` : user.name || user.email || user.meta?.id || 'User';
}

function formatAgentLabel(agent: Agent) {
  return agent.nickname || agent.name || agent.meta?.id || 'Agent';
}

function formatMembershipLabel(
  membership: GroupMembership,
  userMap: Map<string, User>,
  agentMap: Map<string, Agent>,
  apps: App[],
) {
  if (membership.memberType === GroupMemberType.USER) {
    const user = userMap.get(membership.memberId);
    return user ? formatUserLabel(user) : membership.memberId;
  }
  if (membership.memberType === GroupMemberType.AGENT) {
    const agent = agentMap.get(membership.memberId);
    return agent ? formatAgentLabel(agent) : membership.memberId;
  }
  if (membership.memberType === GroupMemberType.APP) {
    const app = apps.find((candidate) => candidate.identityId === membership.memberId);
    return app?.name || app?.slug || membership.memberId;
  }
  return membership.memberId;
}

function chunkStrings(values: string[], size: number) {
  const chunks: string[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}
