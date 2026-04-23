import { useMemo } from 'react';
import { Code, ConnectError } from '@connectrpc/connect';
import { useQueries, useQuery } from '@tanstack/react-query';
import { agentsClient, appsClient, usersClient } from '@/api/client';
import { EMPTY_PLACEHOLDER } from '@/lib/format';

function isNotFound(error: unknown): boolean {
  return error instanceof ConnectError && error.code === Code.NotFound;
}

export function useIdentityHandles(identityIds: string[]) {
  const uniqueIds = useMemo(
    () => Array.from(new Set(identityIds.filter((identityId) => identityId))),
    [identityIds],
  );

  const usersQuery = useQuery({
    queryKey: ['users', 'batch', uniqueIds.join(',')],
    queryFn: () => usersClient.batchGetUsers({ identityIds: uniqueIds }),
    enabled: uniqueIds.length > 0,
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

  const unresolvedIds = useMemo(() => {
    if (usersQuery.isPending) return [];
    return uniqueIds.filter((identityId) => !userMap.has(identityId));
  }, [uniqueIds, userMap, usersQuery.isPending]);

  const agentQueries = useQueries({
    queries: unresolvedIds.map((identityId) => ({
      queryKey: ['agents', 'identity', identityId],
      queryFn: async () => {
        try {
          return await agentsClient.getAgent({ id: identityId });
        } catch (error) {
          if (isNotFound(error)) return null;
          throw error;
        }
      },
      enabled: !usersQuery.isPending && Boolean(identityId),
      retry: false,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    })),
  });

  const agentMap = useMemo(
    () =>
      new Map(
        agentQueries.flatMap((query, index) => {
          const identityId = unresolvedIds[index];
          const agent = query.data?.agent;
          return identityId && agent ? ([[identityId, agent]] as const) : [];
        }),
      ),
    [agentQueries, unresolvedIds],
  );

  const appProfileQueries = useQueries({
    queries: unresolvedIds.map((identityId) => ({
      queryKey: ['apps', 'profile', identityId],
      queryFn: async () => {
        try {
          return await appsClient.getAppProfile({ identityId });
        } catch (error) {
          if (isNotFound(error)) return null;
          throw error;
        }
      },
      enabled: !usersQuery.isPending && Boolean(identityId),
      retry: false,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    })),
  });

  const appProfileMap = useMemo(
    () =>
      new Map(
        appProfileQueries.flatMap((query, index) => {
          const identityId = unresolvedIds[index];
          const profile = query.data?.profile;
          return identityId && profile ? ([[identityId, profile]] as const) : [];
        }),
      ),
    [appProfileQueries, unresolvedIds],
  );

  const resolveIdentityInfo = useMemo(() => {
    const buildLabel = (name?: string | null) => (name ? `@${name}` : 'Unknown');
    const buildHandle = (name: string | undefined | null, fallbackId: string) => `@${name || fallbackId}`;
    return (identityId?: string | null) => {
      if (!identityId) {
        return { label: EMPTY_PLACEHOLDER, handle: EMPTY_PLACEHOLDER, type: 'Identity' };
      }
      const user = userMap.get(identityId);
      if (user) {
        const name = user.nickname || user.name || user.email || null;
        return {
          label: buildLabel(name),
          handle: buildHandle(name, identityId),
          type: 'User',
        };
      }
      const agent = agentMap.get(identityId);
      if (agent) {
        const name = agent.nickname || agent.name || null;
        return {
          label: buildLabel(name),
          handle: buildHandle(name, identityId),
          type: 'Agent',
        };
      }
      const appProfile = appProfileMap.get(identityId);
      if (appProfile) {
        const name = appProfile.name || appProfile.slug || null;
        return {
          label: buildLabel(name),
          handle: buildHandle(name, identityId),
          type: 'App',
        };
      }
      return { label: 'Unknown', handle: `@${identityId}`, type: 'Identity' };
    };
  }, [agentMap, appProfileMap, userMap]);

  const formatHandle = useMemo(
    () => (identityId?: string | null) => resolveIdentityInfo(identityId).handle,
    [resolveIdentityInfo],
  );

  const formatHandleLabel = useMemo(
    () => (identityId?: string | null) => resolveIdentityInfo(identityId).label,
    [resolveIdentityInfo],
  );

  const formatHandleTooltip = useMemo(
    () => (identityId?: string | null) => {
      if (!identityId) return EMPTY_PLACEHOLDER;
      const identityType = resolveIdentityInfo(identityId).type;
      return `${identityType}: ${identityId}`;
    },
    [resolveIdentityInfo],
  );

  return { formatHandle, formatHandleLabel, formatHandleTooltip };
}
