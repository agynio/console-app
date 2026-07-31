import { useEffect, useMemo } from 'react';
import { useInfiniteQuery, useQueries, useQuery } from '@tanstack/react-query';
import { agentsClient, appsClient, groupsClient, organizationsClient, usersClient } from '@/api/client';
import type { Agent } from '@/gen/agynio/api/agents/v1/agents_pb';
import { AppVisibility } from '@/gen/agynio/api/apps/v1/apps_pb';
import { PrivateResourceAccessPrincipalType } from '@/gen/agynio/api/networks/v1/networks_pb';
import { MembershipStatus } from '@/gen/agynio/api/organizations/v1/organizations_pb';
import type { User } from '@/gen/agynio/api/users/v1/users_pb';
import { MAX_PAGE_SIZE } from '@/lib/pagination';

export type PrincipalOption = {
  type: PrivateResourceAccessPrincipalType;
  id: string;
  label: string;
  description: string;
};

const userBatchSize = 100;

export function principalValue(option: Pick<PrincipalOption, 'type' | 'id'>) {
  return `${option.type}:${option.id}`;
}

function formatUserPrincipal(user: User) {
  return user.nickname ? `@${user.nickname}` : user.name || user.email || user.meta?.id || 'User';
}

function formatAgentPrincipal(agent: Agent) {
  return agent.nickname || agent.name || agent.meta?.id || 'Agent';
}

function chunkStrings(values: string[], size: number) {
  const chunks: string[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

/**
 * Every principal a private resource can be granted to: organization members,
 * agents, apps, and groups.
 */
export function usePrincipalOptions(organizationId: string) {
  const organizationMembersQuery = useInfiniteQuery({
    queryKey: ['organizations', organizationId, 'members', 'resource-grant-picker'],
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
    if (organizationMembersQuery.hasNextPage && !organizationMembersQuery.isFetchingNextPage) {
      void organizationMembersQuery.fetchNextPage();
    }
  }, [organizationMembersQuery]);

  const agentsQuery = useQuery({
    queryKey: ['agents', organizationId, 'resource-grant-picker'],
    queryFn: () => agentsClient.listAgents({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const appsQuery = useQuery({
    queryKey: ['apps', organizationId, 'resource-grant-picker'],
    queryFn: () =>
      appsClient.listApps({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '', visibility: AppVisibility.UNSPECIFIED }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const groupsQuery = useQuery({
    queryKey: ['groups', organizationId, 'resource-grant-picker'],
    queryFn: () => groupsClient.listGroups({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

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
      queryKey: ['users', 'batch', 'org-members', 'resource-grant-picker', identityIds.join(',')],
      queryFn: () => usersClient.batchGetUsers({ identityIds }),
      enabled: identityIds.length > 0,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    })),
  });

  const options = useMemo(() => {
    const organizationUsers = organizationUsersQueries.flatMap((query) => query.data?.users ?? []);
    const userOptions = organizationUsers.flatMap((user): PrincipalOption[] => {
      const userId = user.meta?.id;
      if (!userId) return [];
      return [{ type: PrivateResourceAccessPrincipalType.USER, id: userId, label: formatUserPrincipal(user), description: user.email || userId }];
    });
    const agentOptions = (agentsQuery.data?.agents ?? []).flatMap((agent): PrincipalOption[] => {
      const agentId = agent.meta?.id;
      if (!agentId) return [];
      return [{ type: PrivateResourceAccessPrincipalType.AGENT, id: agentId, label: formatAgentPrincipal(agent), description: agent.role || agentId }];
    });
    const appOptions = (appsQuery.data?.apps ?? []).flatMap((app): PrincipalOption[] => {
      const appId = app.identityId || app.meta?.id;
      if (!appId) return [];
      return [{ type: PrivateResourceAccessPrincipalType.APP, id: appId, label: app.name || app.slug || appId, description: app.slug || appId }];
    });
    const groupOptions = (groupsQuery.data?.groups ?? []).flatMap((group): PrincipalOption[] => {
      const groupId = group.meta?.id;
      if (!groupId) return [];
      return [{ type: PrivateResourceAccessPrincipalType.GROUP, id: groupId, label: group.name, description: group.description || groupId }];
    });
    return [...userOptions, ...agentOptions, ...appOptions, ...groupOptions].sort((left, right) => left.label.localeCompare(right.label));
  }, [agentsQuery.data?.agents, appsQuery.data?.apps, groupsQuery.data?.groups, organizationUsersQueries]);

  return { options };
}
